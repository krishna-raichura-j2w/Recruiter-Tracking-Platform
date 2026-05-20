"""
Pods — strict tree org structure: Pod → BH → KAMs → DLs → Recruiters.

Permissions:
- admin       : full CRUD on pods + can place/move/remove anyone
- delivery_lead: read-only on pods. May add/remove recruiters under themselves
                 only, scoped to their own pod.
- everyone else: read-only on their own pod.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from core.database import get_db
from core.deps import get_current_user, require_roles
from infra.models import Pod, User, UserRole


router = APIRouter(prefix="/pods", tags=["pods"])


# ── Helpers ───────────────────────────────────────────────────────────────────

LEVEL_BY_ROLE = {
    UserRole.bh.value:            0,
    UserRole.kam.value:           1,
    UserRole.delivery_lead.value: 2,
    UserRole.recruiter.value:     3,
}

REQUIRED_PARENT_LEVEL = {
    UserRole.kam.value:           0,  # KAM's parent must be BH
    UserRole.delivery_lead.value: 1,  # DL's parent must be KAM
    UserRole.recruiter.value:     2,  # Recruiter's parent must be DL
}


def _user_role_value(u: User) -> str:
    return u.role.value if hasattr(u.role, "value") else str(u.role)


def _user_short(u: User) -> dict:
    return {"id": u.id, "name": u.name, "email": u.email, "role": _user_role_value(u)}


def _serialize_member(u: User, by_parent: dict[int | None, list[User]]) -> dict:
    return {
        **_user_short(u),
        "parent_user_id": u.parent_user_id,
        "children": [_serialize_member(c, by_parent) for c in by_parent.get(u.id, [])],
    }


def _build_tree(db: Session, pod: Pod) -> dict:
    members: list[User] = (
        db.query(User)
          .filter(User.pod_id == pod.id, User.id != (pod.bh_user_id or -1))
          .order_by(User.name)
          .all()
    )
    by_parent: dict[int | None, list[User]] = {}
    for m in members:
        by_parent.setdefault(m.parent_user_id, []).append(m)

    bh_user = db.query(User).filter(User.id == pod.bh_user_id).first() if pod.bh_user_id else None
    bh_node = None
    if bh_user is not None:
        bh_node = {**_user_short(bh_user), "parent_user_id": None,
                   "children": [_serialize_member(c, by_parent) for c in by_parent.get(bh_user.id, [])]}

    # Orphans: members whose parent isn't in this pod (data drift). Surface for cleanup.
    member_ids = {m.id for m in members}
    if bh_user is not None:
        member_ids.add(bh_user.id)
    orphans = [
        _serialize_member(m, by_parent)
        for m in members
        if m.parent_user_id is not None and m.parent_user_id not in member_ids
    ]

    return {
        "id":         pod.id,
        "name":       pod.name,
        "bh_user_id": pod.bh_user_id,
        "bh":         bh_node,
        "orphans":    orphans,
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
    db: Session   = Depends(get_db),
    current_user  = Depends(get_current_user),
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
    db: Session  = Depends(get_db),
    current_user = Depends(get_current_user),
):
    pod = db.query(Pod).filter(Pod.id == pod_id).first()
    if not pod:
        raise HTTPException(404, "Pod not found")
    if not (_is_admin(current_user) or _is_coo(current_user)) and current_user.pod_id != pod.id:
        raise HTTPException(403, "Not a member of this pod")
    return _build_tree(db, pod)


class PodCreate(BaseModel):
    name:       str = Field(min_length=1, max_length=120)
    bh_user_id: int | None = None


@router.post("")
def create_pod(
    body: PodCreate,
    db: Session = Depends(get_db),
    _           = Depends(require_roles("admin")),
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
    name:       str | None = Field(default=None, min_length=1, max_length=120)
    bh_user_id: int | None = None   # pass null in JSON to clear


@router.patch("/{pod_id}")
def update_pod(
    pod_id: int,
    body: PodUpdate,
    db: Session = Depends(get_db),
    _           = Depends(require_roles("admin")),
):
    pod = db.query(Pod).filter(Pod.id == pod_id).first()
    if not pod:
        raise HTTPException(404, "Pod not found")
    payload = body.model_dump(exclude_unset=True)
    if "name" in payload and payload["name"]:
        clash = db.query(Pod).filter(Pod.name == payload["name"], Pod.id != pod.id).first()
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
    _           = Depends(require_roles("admin")),
):
    pod = db.query(Pod).filter(Pod.id == pod_id).first()
    if not pod:
        raise HTTPException(404, "Pod not found")
    # Detach all members
    db.query(User).filter(User.pod_id == pod.id).update(
        {User.pod_id: None, User.parent_user_id: None}, synchronize_session=False
    )
    db.delete(pod)
    db.commit()
    return {"deleted": pod_id}


class MemberAdd(BaseModel):
    user_id:        int
    parent_user_id: int   # the user above this one in the tree


def _validate_placement(db: Session, pod: Pod, user: User, parent_user_id: int) -> User:
    """Ensure (user.role, parent.role) is a legal step in the tree and parent is in the same pod."""
    urole = _user_role_value(user)
    if urole not in REQUIRED_PARENT_LEVEL:
        raise HTTPException(400, f"Role '{urole}' cannot be placed in a pod tree")
    parent = db.query(User).filter(User.id == parent_user_id).first()
    if not parent:
        raise HTTPException(404, "Parent user not found")
    if parent.pod_id != pod.id:
        raise HTTPException(400, "Parent is not a member of this pod")
    prole = _user_role_value(parent)
    expected_level = REQUIRED_PARENT_LEVEL[urole]
    if LEVEL_BY_ROLE.get(prole, -1) != expected_level:
        expected_role = {0: "BH", 1: "KAM", 2: "DL"}[expected_level]
        raise HTTPException(400, f"A {urole} must report to a {expected_role}, not a {prole}")
    return parent


@router.post("/{pod_id}/members")
def add_member(
    pod_id: int,
    body: MemberAdd,
    db: Session   = Depends(get_db),
    current_user  = Depends(get_current_user),
):
    pod = db.query(Pod).filter(Pod.id == pod_id).first()
    if not pod:
        raise HTTPException(404, "Pod not found")
    user = db.query(User).filter(User.id == body.user_id).first()
    if not user:
        raise HTTPException(404, "User not found")

    # Permission: admin can add anyone; DL can only add recruiters under self in own pod.
    if _is_admin(current_user):
        pass
    elif _is_dl(current_user):
        if current_user.pod_id != pod.id:
            raise HTTPException(403, "Not a member of this pod")
        if _user_role_value(user) != UserRole.recruiter.value:
            raise HTTPException(403, "DLs can only add recruiters")
        if body.parent_user_id != current_user.id:
            raise HTTPException(403, "DLs can only add recruiters under themselves")
    else:
        raise HTTPException(403, "Not allowed")

    if user.pod_id is not None and user.pod_id != pod.id:
        raise HTTPException(409, f"User already belongs to a different pod (id={user.pod_id})")

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
    db: Session   = Depends(get_db),
    current_user  = Depends(get_current_user),
):
    """Change a member's parent within the same pod. Admin: any user. DL: only
    recruiters in their own pod, and the new parent must still be the DL
    themselves (DLs can't reassign recruiters to other DLs)."""
    pod = db.query(Pod).filter(Pod.id == pod_id).first()
    if not pod:
        raise HTTPException(404, "Pod not found")
    user = db.query(User).filter(User.id == user_id, User.pod_id == pod_id).first()
    if not user:
        raise HTTPException(404, "User not in this pod")

    if _is_admin(current_user):
        pass
    elif _is_dl(current_user):
        if current_user.pod_id != pod.id:
            raise HTTPException(403, "Not a member of this pod")
        if _user_role_value(user) != UserRole.recruiter.value:
            raise HTTPException(403, "DLs can only move recruiters")
        if body.parent_user_id != current_user.id:
            raise HTTPException(403, "DLs can only reassign recruiters under themselves")
    else:
        raise HTTPException(403, "Not allowed")

    _validate_placement(db, pod, user, body.parent_user_id)
    user.parent_user_id = body.parent_user_id
    db.commit()
    return _build_tree(db, pod)


@router.delete("/{pod_id}/members/{user_id}")
def remove_member(
    pod_id: int,
    user_id: int,
    db: Session   = Depends(get_db),
    current_user  = Depends(get_current_user),
):
    pod = db.query(Pod).filter(Pod.id == pod_id).first()
    if not pod:
        raise HTTPException(404, "Pod not found")
    user = db.query(User).filter(User.id == user_id, User.pod_id == pod_id).first()
    if not user:
        raise HTTPException(404, "User not in this pod")

    if _is_admin(current_user):
        pass
    elif _is_dl(current_user):
        if current_user.pod_id != pod.id:
            raise HTTPException(403, "Not a member of this pod")
        if _user_role_value(user) != UserRole.recruiter.value or user.parent_user_id != current_user.id:
            raise HTTPException(403, "DLs can only remove recruiters under themselves")
    else:
        raise HTTPException(403, "Not allowed")

    # Refuse to remove a parent who still has children inside the pod (would orphan them).
    has_children = db.query(User).filter(User.parent_user_id == user.id, User.pod_id == pod.id).first()
    if has_children:
        raise HTTPException(409, "Reassign or remove this user's reports first")

    # If removing the BH, also clear pod.bh_user_id
    if pod.bh_user_id == user.id:
        pod.bh_user_id = None

    user.pod_id = None
    user.parent_user_id = None
    db.commit()
    return _build_tree(db, pod)


# ── Picker: users available for a given pod level ────────────────────────────

@router.get("/_assignable/{role}")
def assignable_users(
    role: str,
    pod_id: int | None = None,
    db: Session   = Depends(get_db),
    _             = Depends(require_roles("admin", "delivery_lead")),
):
    """List users with the given role who are NOT yet attached to any pod
    (admin can also include users from the same pod for moves)."""
    if role not in REQUIRED_PARENT_LEVEL and role != UserRole.bh.value:
        raise HTTPException(400, "Invalid role for pod tree")

    q = db.query(User).filter(User.role == role, User.is_active == True)  # noqa: E712
    if pod_id is not None:
        # users not yet attached, OR attached to this same pod (for re-parent moves)
        q = q.filter((User.pod_id.is_(None)) | (User.pod_id == pod_id))
    else:
        q = q.filter(User.pod_id.is_(None))

    return {"users": [_user_short(u) for u in q.order_by(User.name).all()]}
