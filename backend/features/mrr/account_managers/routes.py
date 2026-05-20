"""
Business Heads — now backed by users with role='bh'.

The legacy `account_managers` table has been migrated into `users` (see
`ensure_schema()` in app.py). This module remains under the same `/business-heads`
URL so existing frontend callers (Jobs.tsx, Export.tsx, FilterBar.tsx) continue
to work without changes. All CRUD now goes through the users table — admins
manage BH accounts (logins) via the regular Users page.
"""

from core.database import get_db
from core.deps import get_current_user, require_roles
from core.security import hash_password
from fastapi import APIRouter, Depends, HTTPException
from infra.models import User, UserRole
from pydantic import BaseModel
from sqlalchemy.orm import Session

router = APIRouter(prefix="/business-heads", tags=["business-heads"])


def _out(u: User) -> dict:
    return {
        "id": u.id,
        "name": u.name,
        "email": u.email,
        "phone": None,  # BHs no longer carry a phone field; left for response-shape compat
    }


@router.get("")
def list_bhs(db: Session = Depends(get_db), _=Depends(get_current_user)):
    rows = (
        db.query(User)
        .filter(User.role == UserRole.bh, User.is_active == True)  # noqa: E712
        .order_by(User.name)
        .all()
    )
    return [_out(u) for u in rows]


class BHCreate(BaseModel):
    name: str
    email: str
    phone: str | None = None  # accepted for compat, not persisted


@router.post("")
def create_bh(
    body: BHCreate, db: Session = Depends(get_db), _=Depends(require_roles("admin")),
):
    if not body.email:
        raise HTTPException(400, "Email is required for a BH login")
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(409, "A user with this email already exists")
    u = User(
        name=body.name,
        email=body.email,
        password_hash=hash_password("joules@123"),
        role=UserRole.bh,
        is_active=True,
        must_change_password=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return _out(u)


class BHUpdate(BaseModel):
    name: str | None = None
    email: str | None = None
    phone: str | None = None


@router.patch("/{bh_id}")
def update_bh(
    bh_id: int,
    body: BHUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_roles("admin")),
):
    u = db.query(User).filter(User.id == bh_id, User.role == UserRole.bh).first()
    if not u:
        raise HTTPException(404, "Business head not found")
    data = body.model_dump(exclude_none=True)
    if "name" in data:
        u.name = data["name"]
    if "email" in data:
        u.email = data["email"]
    db.commit()
    db.refresh(u)
    return _out(u)


@router.delete("/{bh_id}")
def delete_bh(
    bh_id: int, db: Session = Depends(get_db), _=Depends(require_roles("admin")),
):
    from infra.models import Job

    u = db.query(User).filter(User.id == bh_id, User.role == UserRole.bh).first()
    if not u:
        raise HTTPException(404, "Business head not found")
    # Detach from any jobs that pointed at this BH.
    db.query(Job).filter(Job.account_manager_id == bh_id).update(
        {"account_manager_id": None}, synchronize_session=False,
    )
    db.delete(u)
    db.commit()
    return {"message": "Deleted"}
