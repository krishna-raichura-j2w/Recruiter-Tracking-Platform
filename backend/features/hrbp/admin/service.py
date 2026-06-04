from fastapi import HTTPException
from infra.hrbp_models import HRBPClient, HRBPConsultant
from infra.models import User
from sqlalchemy.orm import Session

from core.security import hash_password
from features.hrbp.admin.schema import (
    AdminAssignPayload,
    AdminResetPassword,
    AdminUserCreate,
    AdminUserUpdate,
)

ALLOWED_ROLES = {"admin", "hrbp", "bh", "ops_head", "coo", "ceo", "po_finance"}


def check_hrbp_membership(db: Session, email: str) -> bool:
    user = db.query(User).filter(User.email == email, User.role.in_(ALLOWED_ROLES), User.is_active == True).first()  # noqa: E712
    return user is not None


def list_users(db: Session, role: str | None = None, include_inactive: bool = False) -> list[User]:
    q = db.query(User).filter(User.role.in_(ALLOWED_ROLES))
    if not include_inactive:
        q = q.filter(User.is_active == True)  # noqa: E712
    if role:
        q = q.filter(User.role == role)
    return q.order_by(User.name).all()


def get_user(db: Session, user_id: int) -> User:
    user = db.query(User).filter_by(id=user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


def create_user(db: Session, payload: AdminUserCreate) -> User:
    if payload.role not in ALLOWED_ROLES:
        raise HTTPException(status_code=400, detail=f"Invalid role: {payload.role}")
    existing = db.query(User).filter_by(email=payload.email).first()
    if existing:
        raise HTTPException(status_code=409, detail="Email already in use")
    user = User(
        name=payload.name,
        email=payload.email,
        password_hash=hash_password(payload.password),
        role=payload.role,
        phone=payload.phone,
        is_active=True,
        must_change_password=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def update_user(db: Session, user_id: int, payload: AdminUserUpdate) -> User:
    user = get_user(db, user_id)
    data = payload.model_dump(exclude_unset=True)
    if "role" in data and data["role"] not in ALLOWED_ROLES:
        raise HTTPException(status_code=400, detail=f"Invalid role: {data['role']}")
    for field, value in data.items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user


def reset_password(db: Session, user_id: int, payload: AdminResetPassword) -> User:
    user = get_user(db, user_id)
    user.password_hash = hash_password(payload.new_password)
    user.must_change_password = True
    db.commit()
    db.refresh(user)
    return user


def assign_client(db: Session, client_id: int, payload: AdminAssignPayload) -> HRBPClient:
    client = db.query(HRBPClient).filter_by(id=client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    if payload.hrbp_ids is not None:
        client.hrbp_ids = payload.hrbp_ids
    elif payload.hrbp_id is not None:
        client.hrbp_id = payload.hrbp_id
    if payload.bh_id is not None:
        client.bh_id = payload.bh_id
    db.commit()
    db.refresh(client)
    return client


def assign_consultant(db: Session, consultant_id: int, payload: AdminAssignPayload) -> HRBPConsultant:
    consultant = db.query(HRBPConsultant).filter_by(id=consultant_id).first()
    if not consultant:
        raise HTTPException(status_code=404, detail="Consultant not found")
    if payload.hrbp_id is not None:
        consultant.hrbp_id = payload.hrbp_id
    if payload.bh_id is not None:
        consultant.bh_id = payload.bh_id
    db.commit()
    db.refresh(consultant)
    return consultant


def get_stats(db: Session) -> dict:
    from infra.hrbp_models import HRBPTicket
    total_users = db.query(User).filter(User.is_active == True, User.role.in_(ALLOWED_ROLES)).count()  # noqa: E712
    total_clients = db.query(HRBPClient).filter(HRBPClient.is_active == True).count()  # noqa: E712
    total_consultants = db.query(HRBPConsultant).filter(HRBPConsultant.is_active == True).count()  # noqa: E712
    open_tickets = db.query(HRBPTicket).filter(HRBPTicket.status.notin_(["closed", "resolved"])).count()
    return {
        "total_users": total_users,
        "total_clients": total_clients,
        "total_consultants": total_consultants,
        "open_tickets": open_tickets,
    }
