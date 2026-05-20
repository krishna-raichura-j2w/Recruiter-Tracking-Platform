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
    rows = (
        db.query(HourlyTarget)
        .filter(HourlyTarget.user_id.in_(user_ids), HourlyTarget.date == day)
        .all()
    )
    by_user: dict[int, dict[int, int]] = {uid: {} for uid in user_ids}
    for r in rows:
        by_user.setdefault(r.user_id, {})[r.slot_index] = r.target_count

    editable = _editable_user_ids(db, current_user)
    return {
        "date": day.isoformat(),
        "slots": TIME_SLOTS,
        "users": [
            {
                "id": u.id,
                "name": u.name,
                "email": u.email,
                "role": _role(u),
                "editable": _is_editable(editable, u.id),
                "targets": [
                    {
                        "slot_index": idx,
                        "target_count": by_user.get(u.id, {}).get(idx, 0),
                    }
                    for idx in _VALID_SLOT_INDICES
                ],
                "day_target": sum(by_user.get(u.id, {}).values()),
            }
            for u in users
        ],
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
