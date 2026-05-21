"""
Hourly submission targets — admin/KAM set DL targets; KAM/DL set recruiter targets.

A target is one row per (user, date, slot_index). The leaderboard reads these
rows to compute the cumulative target a user should have hit by the current
time (sum of slot targets whose slot_end <= now).
"""

from __future__ import annotations

from datetime import date as _date
from datetime import datetime, time, timedelta, timezone

from core.database import get_db
from core.deps import get_current_user
from fastapi import APIRouter, Depends, HTTPException
from infra.models import HourlyTarget, User, UserRole
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

router = APIRouter(prefix="/targets", tags=["targets"])


# ── Time slots (IST) ─────────────────────────────────────────────────────────
#
# Mirrors the spreadsheet structure. Lunch (13:30–14:30) is intentionally
# missing — no target is set for that hour. slot_index is the stable key
# used in the DB; labels and times are derived.

TIME_SLOTS: list[dict] = [
    {"index": 0, "label": "09:30 – 10:30 AM", "start": "09:30", "end": "10:30"},
    {"index": 1, "label": "10:30 – 11:30 AM", "start": "10:30", "end": "11:30"},
    {"index": 2, "label": "11:30 – 12:30 PM", "start": "11:30", "end": "12:30"},
    {"index": 3, "label": "12:30 – 01:30 PM", "start": "12:30", "end": "13:30"},
    {"index": 4, "label": "02:30 – 03:30 PM", "start": "14:30", "end": "15:30"},
    {"index": 5, "label": "03:30 – 04:30 PM", "start": "15:30", "end": "16:30"},
    {"index": 6, "label": "04:30 – 05:30 PM", "start": "16:30", "end": "17:30"},
    {"index": 7, "label": "05:30 – 06:30 PM", "start": "17:30", "end": "18:30"},
    {"index": 8, "label": "06:30 – 07:30 PM", "start": "18:30", "end": "19:30"},
]

_VALID_SLOT_INDICES = {s["index"] for s in TIME_SLOTS}

# Default hourly split for recruiters when no targets are saved for the day:
# day_total = 4, distributed as the first four "productive" slots (after a
# warmup) each get 1, everything else 0. Slot 0 (09:30-10:30 IST) is intentionally
# empty so the recruiter has a setup hour. DLs have no default — empty stays empty.
RECRUITER_DEFAULT_HOURLY: dict[int, int] = {1: 1, 2: 1, 3: 1, 4: 1}


def _role_value(u) -> str:
    return u.role.value if hasattr(u.role, "value") else str(u.role)


def default_targets_for_user(user) -> dict[int, int]:
    """Per-role default slot map. Empty {} means no default (DLs, KAMs, etc.)."""
    if _role_value(user) == "recruiter" or (
        getattr(user, "secondary_role", None) == "recruiter"
    ):
        return dict(RECRUITER_DEFAULT_HOURLY)
    return {}


def latest_targets_for_users(
    db,
    user_ids: list[int],
    on_date,
) -> dict[int, tuple[dict[int, int], object]]:
    """For each user, return (slot_map, source_date).

    Resolution order, per user:
      1. Rows for `on_date` exactly → use them. source_date == on_date.
      2. Else: rows for the most recent saved date ≤ on_date → carry them
         forward. source_date is that earlier date.
      3. Else: empty map + source_date None. Caller can fall back to role
         defaults.

    This is what makes a save "permanent" — once a recruiter has rows for
    any date, those values apply to every later date until the next save
    overrides them.
    """
    if not user_ids:
        return {}
    from sqlalchemy import func as _f

    out: dict[int, tuple[dict[int, int], object]] = {}

    # 1. Exact-date matches.
    same_day = (
        db.query(
            HourlyTarget.user_id,
            HourlyTarget.slot_index,
            HourlyTarget.target_count,
        )
        .filter(HourlyTarget.user_id.in_(user_ids), HourlyTarget.date == on_date)
        .all()
    )
    for uid, idx, cnt in same_day:
        slot_map, _ = out.get(uid, ({}, on_date))
        slot_map[idx] = int(cnt)
        out[uid] = (slot_map, on_date)

    # 2. For users with no same-day rows, find their most recent date ≤ on_date.
    missing = [uid for uid in user_ids if uid not in out]
    if missing:
        latest_per_user = (
            db.query(HourlyTarget.user_id, _f.max(HourlyTarget.date).label("d"))
            .filter(
                HourlyTarget.user_id.in_(missing),
                HourlyTarget.date <= on_date,
            )
            .group_by(HourlyTarget.user_id)
            .all()
        )
        # Map → user_id : carry_date.
        carry_dates: dict[int, object] = {uid: d for uid, d in latest_per_user if d is not None}
        if carry_dates:
            # Bulk-fetch the carry-forward rows (one query per distinct date).
            for uid, d in carry_dates.items():
                rows = (
                    db.query(HourlyTarget.slot_index, HourlyTarget.target_count)
                    .filter(HourlyTarget.user_id == uid, HourlyTarget.date == d)
                    .all()
                )
                slot_map = {idx: int(cnt) for idx, cnt in rows}
                if slot_map:
                    out[uid] = (slot_map, d)

    return out


def _parse_hhmm(s: str) -> time:
    hh, mm = s.split(":")
    return time(int(hh), int(mm))


def current_slot_indices_completed(today_ist_now: datetime) -> list[int]:
    """Slot indices whose end has passed (i.e. cumulative target applies)."""
    now_t = today_ist_now.time()
    return [s["index"] for s in TIME_SLOTS if _parse_hhmm(s["end"]) <= now_t]


def cumulative_target(
    targets_by_slot: dict[int, int],
    today_ist_now: datetime,
) -> tuple[int, int]:
    """Return (target_so_far, day_target) for a single user."""
    done_slots = set(current_slot_indices_completed(today_ist_now))
    so_far = sum(c for idx, c in targets_by_slot.items() if idx in done_slots)
    day_tot = sum(targets_by_slot.values())
    return so_far, day_tot


# ── Permissions ───────────────────────────────────────────────────────────────


def _role(u: User) -> str:
    return u.role.value if hasattr(u.role, "value") else str(u.role)


def _editable_user_ids(db: Session, editor: User) -> set[int]:
    """
    User IDs whose targets `editor` is allowed to set.

    - admin: everyone (returns a wildcard sentinel set with marker -1 in addition).
    - kam:   every DL and Recruiter in the same pod as the KAM.
    - dl:    every recruiter on the DL's team (pod_memberships) plus pod
             recruiters they may want to onboard.
    - others: empty.
    """
    role = _role(editor)
    if role == UserRole.admin.value:
        return {-1}  # sentinel → "any"

    ids: set[int] = set()
    if role == UserRole.kam.value:
        if editor.pod_id:
            rows = (
                db.query(User.id)
                .filter(
                    User.pod_id == editor.pod_id,
                    User.role.in_([UserRole.delivery_lead, UserRole.recruiter]),
                    User.is_active == True,  # noqa: E712
                )
                .all()
            )
            ids.update(r[0] for r in rows)
    elif role == UserRole.delivery_lead.value:
        # All recruiters in the same pod (the DL is who picks them into team).
        if editor.pod_id:
            rows = (
                db.query(User.id)
                .filter(
                    User.pod_id == editor.pod_id,
                    User.role == UserRole.recruiter,
                    User.is_active == True,  # noqa: E712
                )
                .all()
            )
            ids.update(r[0] for r in rows)
    return ids


def _is_editable(editable: set[int], target_user_id: int) -> bool:
    return -1 in editable or target_user_id in editable


def _visible_user_ids(db: Session, viewer: User, role_filter: str | None) -> list[User]:
    """
    Users whose targets the viewer can see, optionally filtered by role.

    Same scope as editing, plus the viewer themselves so they can see their
    own targets even if they aren't an editor of them.
    """
    role = _role(viewer)
    base = db.query(User).filter(User.is_active == True)  # noqa: E712

    if role == UserRole.admin.value or role == UserRole.coo.value:
        q = base
    elif role == UserRole.kam.value:
        if not viewer.pod_id:
            return []
        q = base.filter(
            User.pod_id == viewer.pod_id,
            User.role.in_([UserRole.delivery_lead, UserRole.recruiter, UserRole.kam]),
        )
    elif role == UserRole.delivery_lead.value:
        if not viewer.pod_id:
            return []
        q = base.filter(
            User.pod_id == viewer.pod_id,
            User.role.in_([UserRole.recruiter, UserRole.delivery_lead]),
        )
    else:
        # Recruiter / BH: see only themselves.
        q = base.filter(User.id == viewer.id)

    if role_filter:
        try:
            q = q.filter(User.role == UserRole(role_filter))
        except ValueError:
            raise HTTPException(400, "Unknown role filter")

    return q.order_by(User.name).all()


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get("/slots")
def list_slots(_=Depends(get_current_user)):
    return {"slots": TIME_SLOTS}


@router.get("")
def list_targets(
    date: str | None = None,
    role: str | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Return targets for `date` (defaults to today in IST). Filter by role
    of the target user (e.g. ?role=delivery_lead or ?role=recruiter).
    """
    ist_now = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
    if date:
        try:
            day = _date.fromisoformat(date)
        except ValueError:
            raise HTTPException(400, "date must be YYYY-MM-DD")
    else:
        day = ist_now.date()

    users = _visible_user_ids(db, current_user, role)
    if not users:
        return {"date": day.isoformat(), "users": [], "slots": TIME_SLOTS}

    user_ids = [u.id for u in users]

    # Resolution: exact-date rows → carry-forward from latest save → role default.
    resolved = latest_targets_for_users(db, user_ids, day)

    def _slots_and_source(user) -> tuple[dict[int, int], str | None]:
        entry = resolved.get(user.id)
        if entry is not None:
            slot_map, src_date = entry
            # `src_date` is a date object; emit ISO string for the UI.
            return slot_map, (src_date.isoformat() if hasattr(src_date, "isoformat") else None)
        # No saved rows ever → role default (virtual; persisted only when saved).
        return default_targets_for_user(user), None

    editable = _editable_user_ids(db, current_user)
    users_out = []
    for u in users:
        slot_map, src_date = _slots_and_source(u)
        is_for_today = src_date == day.isoformat()
        # is_default: TRUE only when there are no saved rows anywhere — i.e.,
        # we're showing the role default. A "carried-forward" save is real,
        # just from a prior date.
        is_default = src_date is None and bool(slot_map)  # default values present
        # If there's nothing at all (DL with no save), is_default is False but
        # all targets are 0 — that's the natural "empty" state.
        users_out.append({
            "id": u.id,
            "name": u.name,
            "email": u.email,
            "role": _role(u),
            "editable": _is_editable(editable, u.id),
            "is_default": is_default,
            "is_carried_forward": (src_date is not None) and (not is_for_today),
            "source_date": src_date,
            "targets": [
                {
                    "slot_index": idx,
                    "target_count": slot_map.get(idx, 0),
                }
                for idx in _VALID_SLOT_INDICES
            ],
            "day_target": sum(slot_map.values()),
        })

    return {
        "date": day.isoformat(),
        "slots": TIME_SLOTS,
        "users": users_out,
    }


class SlotValue(BaseModel):
    slot_index: int
    target_count: int = Field(ge=0, le=999)


class TargetsSave(BaseModel):
    user_id: int
    date: str
    slots: list[SlotValue]


@router.put("")
def save_targets(
    body: TargetsSave,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Upsert hourly targets for a single user on a single day."""
    try:
        day = _date.fromisoformat(body.date)
    except ValueError:
        raise HTTPException(400, "date must be YYYY-MM-DD")

    target_user = db.query(User).filter(User.id == body.user_id).first()
    if not target_user:
        raise HTTPException(404, "User not found")

    editable = _editable_user_ids(db, current_user)
    if not _is_editable(editable, target_user.id):
        raise HTTPException(403, "You may not set targets for this user")

    for sv in body.slots:
        if sv.slot_index not in _VALID_SLOT_INDICES:
            raise HTTPException(400, f"Invalid slot_index {sv.slot_index}")
        existing = (
            db.query(HourlyTarget)
            .filter(
                HourlyTarget.user_id == body.user_id,
                HourlyTarget.date == day,
                HourlyTarget.slot_index == sv.slot_index,
            )
            .first()
        )
        if existing:
            existing.target_count = sv.target_count
            existing.created_by_id = current_user.id
        else:
            db.add(
                HourlyTarget(
                    user_id=body.user_id,
                    date=day,
                    slot_index=sv.slot_index,
                    target_count=sv.target_count,
                    created_by_id=current_user.id,
                ),
            )
    db.commit()
    return {"saved": True, "user_id": body.user_id, "date": day.isoformat()}
