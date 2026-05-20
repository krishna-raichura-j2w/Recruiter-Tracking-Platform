"""
Pods — strict tree org structure: Pod → BH → KAMs → DLs → Recruiters.

Permissions:
- admin       : full CRUD on pods + can place/move/remove anyone
- delivery_lead: read-only on pods. May add/remove recruiters under themselves
                 only, scoped to their own pod.
- everyone else: read-only on their own pod.
"""

from __future__ import annotations

from core.database import get_db
from core.deps import get_current_user, require_roles
from fastapi import APIRouter, Depends, HTTPException
from infra.models import Pod, PodMembership, User, UserRole
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

router = APIRouter(prefix="/pods", tags=["pods"])


# ── Helpers ───────────────────────────────────────────────────────────────────

# Allowed parent role for each placeable role. KAMs, DLs, and Recruiters are
# all flat peers under the BH within a pod. A recruiter does NOT formally
# report to a DL in the pod tree — DLs build their own teams separately by
# picking from the pod's recruiters (see pod_memberships).
PARENT_ROLE_BY_CHILD = {
    UserRole.kam.value: UserRole.bh.value,
    UserRole.delivery_lead.value: UserRole.bh.value,
    UserRole.recruiter.value: UserRole.bh.value,
}


def _user_role_value(u: User) -> str:
    return u.role.value if hasattr(u.role, "value") else str(u.role)


def _user_short(u: User) -> dict:
    return {"id": u.id, "name": u.name, "email": u.email, "role": _user_role_value(u)}


def _serialize_member(
    u: User,
    by_parent: dict[int | None, list[User]],
    team_by_dl: dict[int, list[User]] | None = None,
) -> dict:
    out = {
        **_user_short(u),
        "parent_user_id": u.parent_user_id,
        "children": [
            _serialize_member(c, by_parent, team_by_dl) for c in by_parent.get(u.id, [])
        ],
    }
    if team_by_dl is not None and _user_role_value(u) == UserRole.delivery_lead.value:
        out["team_members"] = [_user_short(t) for t in team_by_dl.get(u.id, [])]
    return out


# Display order within a pod: all KAMs first, then all DLs (each followed by
# its recruiters). Sorting the flat list once by (role priority, name) and
# bucketing into by_parent in that order preserves per-group ordering, so the
# BH's children come out KAMs-then-DLs while recruiters under a DL stay
# alphabetical.
ROLE_ORDER = {
    UserRole.kam.value: 0,
    UserRole.delivery_lead.value: 1,
    UserRole.recruiter.value: 2,
}


def _build_tree(db: Session, pod: Pod) -> dict:
    members: list[User] = (
        db.query(User)
        .filter(User.pod_id == pod.id, User.id != (pod.bh_user_id or -1))
        .all()
    )
    members.sort(
        key=lambda u: (ROLE_ORDER.get(_user_role_value(u), 99), (u.name or "").lower()),
    )
    by_parent: dict[int | None, list[User]] = {}
    for m in members:
        by_parent.setdefault(m.parent_user_id, []).append(m)

    # DL team rosters (pod_memberships): a DL hand-picks recruiters from the
    # pod into their working team. One recruiter may belong to multiple DLs.
    member_ids_set = {m.id for m in members}
    dl_ids = [
        m.id for m in members if _user_role_value(m) == UserRole.delivery_lead.value
    ]
    team_by_dl: dict[int, list[User]] = {dl_id: [] for dl_id in dl_ids}
    if dl_ids:
        team_rows = (
            db.query(PodMembership.pod_lead_id, User)
            .join(User, PodMembership.user_id == User.id)
            .filter(PodMembership.pod_lead_id.in_(dl_ids))
            .all()
        )
        for dl_id, u in team_rows:
            # Restrict to recruiters who are actually part of THIS pod, so a
            # stale legacy row pointing at someone outside the pod doesn't leak.
            if (
                u.id in member_ids_set
                and _user_role_value(u) == UserRole.recruiter.value
            ):
                team_by_dl[dl_id].append(u)
        for dl_id, lst in team_by_dl.items():
            lst.sort(key=lambda x: (x.name or "").lower())

    bh_user = (
        db.query(User).filter(User.id == pod.bh_user_id).first()
        if pod.bh_user_id
        else None
    )
    bh_node = None
    if bh_user is not None:
        bh_node = {
            **_user_short(bh_user),
            "parent_user_id": None,
            "children": [
                _serialize_member(c, by_parent, team_by_dl)
                for c in by_parent.get(bh_user.id, [])
            ],
        }

    # Orphans: members whose parent isn't in this pod (data drift). Surface for cleanup.
    member_ids = {m.id for m in members}
    if bh_user is not None:
        member_ids.add(bh_user.id)
    orphans = [
        _serialize_member(m, by_parent, team_by_dl)
        for m in members
        if m.parent_user_id is not None and m.parent_user_id not in member_ids
    ]

    return {
        "id": pod.id,
        "name": pod.name,
        "bh_user_id": pod.bh_user_id,
        "bh": bh_node,
        "orphans": orphans,
        "member_count": len(members) + (1 if bh_user is not None else 0),
    }


def _is_admin(user: User) -> bool:
    return _user_role_value(user) == UserRole.admin.value


def _is_coo(user: User) -> bool:
    return _user_role_value(user) == UserRole.coo.value


def _is_dl(user: User) -> bool:
    return _user_role_value(user) == UserRole.delivery_lead.value


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get("")
def list_pods(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Admin/COO: all pods. Others: only the pod they belong to (if any)."""
    if _is_admin(current_user) or _is_coo(current_user):
        pods = db.query(Pod).order_by(Pod.name).all()
    elif current_user.pod_id:
        pods = db.query(Pod).filter(Pod.id == current_user.pod_id).all()
    else:
        pods = []
    return {"pods": [_build_tree(db, p) for p in pods]}


@router.get("/{pod_id}")
def get_pod(
    pod_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    pod = db.query(Pod).filter(Pod.id == pod_id).first()
    if not pod:
        raise HTTPException(404, "Pod not found")
    if (
        not (_is_admin(current_user) or _is_coo(current_user))
        and current_user.pod_id != pod.id
    ):
        raise HTTPException(403, "Not a member of this pod")
    return _build_tree(db, pod)


class PodCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    bh_user_id: int | None = None


@router.post("")
def create_pod(
    body: PodCreate,
    db: Session = Depends(get_db),
    _=Depends(require_roles("admin")),
):
    if db.query(Pod).filter(Pod.name == body.name).first():
        raise HTTPException(409, f"Pod '{body.name}' already exists")

    bh: User | None = None
    if body.bh_user_id is not None:
        bh = db.query(User).filter(User.id == body.bh_user_id).first()
        if not bh:
            raise HTTPException(404, "BH user not found")
        if _user_role_value(bh) != UserRole.bh.value:
            raise HTTPException(400, "Assigned user must have role='bh'")
        if bh.pod_id is not None:
            raise HTTPException(409, "That BH already heads another pod")

    pod = Pod(name=body.name, bh_user_id=body.bh_user_id)
    db.add(pod)
    db.flush()
    if bh is not None:
        bh.pod_id = pod.id
        bh.parent_user_id = None
    db.commit()
    db.refresh(pod)
    return _build_tree(db, pod)


class PodUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    bh_user_id: int | None = None  # pass null in JSON to clear


@router.patch("/{pod_id}")
def update_pod(
    pod_id: int,
    body: PodUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_roles("admin")),
):
    pod = db.query(Pod).filter(Pod.id == pod_id).first()
    if not pod:
        raise HTTPException(404, "Pod not found")
    payload = body.model_dump(exclude_unset=True)
    if payload.get("name"):
        clash = (
            db.query(Pod).filter(Pod.name == payload["name"], Pod.id != pod.id).first()
        )
        if clash:
            raise HTTPException(409, f"Pod '{payload['name']}' already exists")
        pod.name = payload["name"]
    if "bh_user_id" in payload:
        new_bh_id = payload["bh_user_id"]
        # Detach the current BH from this pod (so they aren't an orphan with role=bh).
        if pod.bh_user_id and pod.bh_user_id != new_bh_id:
            old = db.query(User).filter(User.id == pod.bh_user_id).first()
            if old:
                old.pod_id = None
                old.parent_user_id = None
        if new_bh_id is None:
            pod.bh_user_id = None
        else:
            bh = db.query(User).filter(User.id == new_bh_id).first()
            if not bh:
                raise HTTPException(404, "BH user not found")
            if _user_role_value(bh) != UserRole.bh.value:
                raise HTTPException(400, "Assigned user must have role='bh'")
            if bh.pod_id is not None and bh.pod_id != pod.id:
                raise HTTPException(409, "That BH already heads another pod")
            pod.bh_user_id = bh.id
            bh.pod_id = pod.id
            bh.parent_user_id = None
    db.commit()
    db.refresh(pod)
    return _build_tree(db, pod)


@router.delete("/{pod_id}")
def delete_pod(
    pod_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_roles("admin")),
):
    pod = db.query(Pod).filter(Pod.id == pod_id).first()
    if not pod:
        raise HTTPException(404, "Pod not found")
    # Detach all members
    db.query(User).filter(User.pod_id == pod.id).update(
        {User.pod_id: None, User.parent_user_id: None}, synchronize_session=False,
    )
    db.delete(pod)
    db.commit()
    return {"deleted": pod_id}


class MemberAdd(BaseModel):
    user_id: int
    parent_user_id: int  # the user above this one in the tree


def _validate_placement(db: Session, pod: Pod, user: User, parent_user_id: int) -> User:
    """Ensure (user.role, parent.role) is a legal step in the pod and parent is in the same pod."""
    urole = _user_role_value(user)
    if urole not in PARENT_ROLE_BY_CHILD:
        raise HTTPException(400, f"Role '{urole}' cannot be placed in a pod tree")
    parent = db.query(User).filter(User.id == parent_user_id).first()
    if not parent:
        raise HTTPException(404, "Parent user not found")
    if parent.pod_id != pod.id:
        raise HTTPException(400, "Parent is not a member of this pod")
    prole = _user_role_value(parent)
    expected = PARENT_ROLE_BY_CHILD[urole]
    if prole != expected:
        nice = {"bh": "BH", "kam": "KAM", "delivery_lead": "DL"}.get(expected, expected)
        raise HTTPException(400, f"A {urole} must report to a {nice}, not a {prole}")
    return parent


@router.post("/{pod_id}/members")
def add_member(
    pod_id: int,
    body: MemberAdd,
    db: Session = Depends(get_db),
    _=Depends(require_roles("admin")),
):
    """
    Add a KAM, DL, or Recruiter to the pod. All three are flat peers under
    the BH; the `parent_user_id` in the body must be the pod's BH. Admin only —
    DLs manage their working teams via /pods/{id}/dl-team, not via the tree.
    """
    pod = db.query(Pod).filter(Pod.id == pod_id).first()
    if not pod:
        raise HTTPException(404, "Pod not found")
    user = db.query(User).filter(User.id == body.user_id).first()
    if not user:
        raise HTTPException(404, "User not found")

    if user.pod_id is not None and user.pod_id != pod.id:
        raise HTTPException(
            409, f"User already belongs to a different pod (id={user.pod_id})",
        )

    _validate_placement(db, pod, user, body.parent_user_id)
    user.pod_id = pod.id
    user.parent_user_id = body.parent_user_id
    db.commit()
    return _build_tree(db, pod)


class MemberMove(BaseModel):
    parent_user_id: int


@router.patch("/{pod_id}/members/{user_id}")
def move_member(
    pod_id: int,
    user_id: int,
    body: MemberMove,
    db: Session = Depends(get_db),
    _=Depends(require_roles("admin")),
):
    """
    Re-parent a member within the pod. Admin only (with the flat shape this
    is rarely needed; mostly a safety hatch for data fixes).
    """
    pod = db.query(Pod).filter(Pod.id == pod_id).first()
    if not pod:
        raise HTTPException(404, "Pod not found")
    user = db.query(User).filter(User.id == user_id, User.pod_id == pod_id).first()
    if not user:
        raise HTTPException(404, "User not in this pod")
    _validate_placement(db, pod, user, body.parent_user_id)
    user.parent_user_id = body.parent_user_id
    db.commit()
    return _build_tree(db, pod)


@router.delete("/{pod_id}/members/{user_id}")
def remove_member(
    pod_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_roles("admin")),
):
    """
    Remove a member from the pod. Admin only. Cascades: also detaches them
    from any DL's working team (pod_memberships).
    """
    pod = db.query(Pod).filter(Pod.id == pod_id).first()
    if not pod:
        raise HTTPException(404, "Pod not found")
    user = db.query(User).filter(User.id == user_id, User.pod_id == pod_id).first()
    if not user:
        raise HTTPException(404, "User not in this pod")

    # Removing a DL: refuse if their team isn't empty so the admin makes an
    # explicit decision about the recruiters they were working with.
    if _user_role_value(user) == UserRole.delivery_lead.value:
        has_team = (
            db.query(PodMembership).filter(PodMembership.pod_lead_id == user.id).first()
        )
        if has_team:
            raise HTTPException(
                409, "This DL still has team members. Clear their team first.",
            )

    # If removing a recruiter, drop any DL-team memberships they belong to.
    if _user_role_value(user) == UserRole.recruiter.value:
        db.query(PodMembership).filter(PodMembership.user_id == user.id).delete()

    # If removing the BH, also clear pod.bh_user_id.
    if pod.bh_user_id == user.id:
        pod.bh_user_id = None

    user.pod_id = None
    user.parent_user_id = None
    db.commit()
    return _build_tree(db, pod)


# ── DL team management (pod_memberships) ──────────────────────────────────────


class DlTeamAdd(BaseModel):
    user_id: int  # recruiter to add to the DL's team


def _resolve_dl(db: Session, pod: Pod, dl_id: int, current_user: User) -> User:
    """Look up the DL inside `pod` and enforce edit rights for the current user."""
    dl = db.query(User).filter(User.id == dl_id, User.pod_id == pod.id).first()
    if not dl or _user_role_value(dl) != UserRole.delivery_lead.value:
        raise HTTPException(404, "DL not in this pod")
    if _is_admin(current_user):
        return dl
    if _is_dl(current_user) and current_user.id == dl.id:
        return dl
    raise HTTPException(403, "Only admin or this DL can edit this team")


@router.post("/{pod_id}/dl-team/{dl_id}/members")
def dl_team_add(
    pod_id: int,
    dl_id: int,
    body: DlTeamAdd,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    pod = db.query(Pod).filter(Pod.id == pod_id).first()
    if not pod:
        raise HTTPException(404, "Pod not found")
    dl = _resolve_dl(db, pod, dl_id, current_user)

    rec = db.query(User).filter(User.id == body.user_id).first()
    if not rec:
        raise HTTPException(404, "Recruiter not found")
    if _user_role_value(rec) != UserRole.recruiter.value:
        raise HTTPException(400, "Only recruiters can be added to a DL's team")
    if rec.pod_id != pod.id:
        raise HTTPException(400, "Recruiter is not part of this pod")

    existing = (
        db.query(PodMembership)
        .filter(PodMembership.user_id == rec.id, PodMembership.pod_lead_id == dl.id)
        .first()
    )
    if not existing:
        db.add(PodMembership(user_id=rec.id, pod_lead_id=dl.id))
        db.commit()
    return _build_tree(db, pod)


@router.delete("/{pod_id}/dl-team/{dl_id}/members/{user_id}")
def dl_team_remove(
    pod_id: int,
    dl_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    pod = db.query(Pod).filter(Pod.id == pod_id).first()
    if not pod:
        raise HTTPException(404, "Pod not found")
    dl = _resolve_dl(db, pod, dl_id, current_user)
    db.query(PodMembership).filter(
        PodMembership.user_id == user_id, PodMembership.pod_lead_id == dl.id,
    ).delete()
    db.commit()
    return _build_tree(db, pod)


# ── Picker: users available for a given pod level ────────────────────────────


@router.get("/_assignable/{role}")
def assignable_users(
    role: str,
    pod_id: int | None = None,
    db: Session = Depends(get_db),
    _=Depends(require_roles("admin", "delivery_lead")),
):
    """
    List users with the given role who are NOT yet attached to any pod
    (admin can also include users from the same pod for moves).
    """
    valid_roles = set(PARENT_ROLE_BY_CHILD.keys()) | {UserRole.bh.value}
    if role not in valid_roles:
        raise HTTPException(400, "Invalid role for pod tree")
    try:
        role_enum = UserRole(role)
    except ValueError:
        raise HTTPException(400, "Unknown role")

    q = db.query(User).filter(
        User.role == role_enum, User.is_active,
    )
    if pod_id is not None:
        # users not yet attached, OR attached to this same pod (for re-parent moves)
        q = q.filter((User.pod_id.is_(None)) | (User.pod_id == pod_id))
    else:
        q = q.filter(User.pod_id.is_(None))

    return {"users": [_user_short(u) for u in q.order_by(User.name).all()]}
