from core.database import get_db
from core.deps import get_current_user
from core.response_format import error_response, success_response
from fastapi import APIRouter, Depends, HTTPException, Query
from infra.models import User
from sqlalchemy.orm import Session

from features.hrbp.admin import service
from features.hrbp.admin.schema import (
    AdminAssignPayload,
    AdminResetPassword,
    AdminUserCreate,
    AdminUserUpdate,
)

router = APIRouter(prefix="/admin", tags=["hrbp-admin"])


def _require_admin(current_user: User = Depends(get_current_user)) -> User:
    role = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
    if role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


@router.get("/check-membership")
def check_hrbp_membership(
    email: str = Query(..., description="Email address to check"),
    db: Session = Depends(get_db),
):
    try:
        is_member = service.check_hrbp_membership(db, email)
        return success_response(
            data={"email": email, "is_hrbp_member": is_member},
            message="Membership check successful",
        )
    except Exception as exc:
        return error_response(message=str(exc))


@router.get("/stats")
def get_stats(
    db: Session = Depends(get_db),
    _: User = Depends(_require_admin),
):
    try:
        return success_response(data=service.get_stats(db), message="Stats fetched")
    except Exception as exc:
        return error_response(message=str(exc))


# ── Users ──────────────────────────────────────────────────────────────────

@router.get("/users")
def list_users(
    role: str | None = Query(default=None),
    include_inactive: bool = Query(default=False),
    db: Session = Depends(get_db),
    _: User = Depends(_require_admin),
):
    try:
        users = service.list_users(db, role=role, include_inactive=include_inactive)
        return success_response(
            data=[
                {
                    "id": u.id,
                    "name": u.name,
                    "email": u.email,
                    "role": u.role.value if hasattr(u.role, "value") else u.role,
                    "phone": u.phone,
                    "is_active": u.is_active,
                    "must_change_password": u.must_change_password,
                }
                for u in users
            ],
            message="Users fetched",
        )
    except Exception as exc:
        return error_response(message=str(exc))


@router.post("/users")
def create_user(
    payload: AdminUserCreate,
    db: Session = Depends(get_db),
    _: User = Depends(_require_admin),
):
    try:
        user = service.create_user(db, payload)
        return success_response(
            data={
                "id": user.id,
                "name": user.name,
                "email": user.email,
                "role": user.role.value if hasattr(user.role, "value") else user.role,
                "phone": user.phone,
                "is_active": user.is_active,
                "must_change_password": user.must_change_password,
            },
            message="User created successfully",
        )
    except HTTPException:
        raise
    except Exception as exc:
        return error_response(message=str(exc))


@router.patch("/users/{user_id}")
def update_user(
    user_id: int,
    payload: AdminUserUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(_require_admin),
):
    try:
        user = service.update_user(db, user_id, payload)
        return success_response(
            data={
                "id": user.id,
                "name": user.name,
                "email": user.email,
                "role": user.role.value if hasattr(user.role, "value") else user.role,
                "phone": user.phone,
                "is_active": user.is_active,
            },
            message="User updated successfully",
        )
    except HTTPException:
        raise
    except Exception as exc:
        return error_response(message=str(exc))


@router.post("/users/{user_id}/reset-password")
def reset_password(
    user_id: int,
    payload: AdminResetPassword,
    db: Session = Depends(get_db),
    _: User = Depends(_require_admin),
):
    try:
        service.reset_password(db, user_id, payload)
        return success_response(data={}, message="Password reset. User must change on next login.")
    except HTTPException:
        raise
    except Exception as exc:
        return error_response(message=str(exc))


# ── Client assignment ──────────────────────────────────────────────────────

@router.patch("/clients/{client_id}/assign")
def assign_client(
    client_id: int,
    payload: AdminAssignPayload,
    db: Session = Depends(get_db),
    _: User = Depends(_require_admin),
):
    try:
        client = service.assign_client(db, client_id, payload)
        return success_response(data=client.__dict__, message="Client assignment updated")
    except HTTPException:
        raise
    except Exception as exc:
        return error_response(message=str(exc))


# ── Consultant assignment ──────────────────────────────────────────────────

@router.patch("/consultants/{consultant_id}/assign")
def assign_consultant(
    consultant_id: int,
    payload: AdminAssignPayload,
    db: Session = Depends(get_db),
    _: User = Depends(_require_admin),
):
    try:
        consultant = service.assign_consultant(db, consultant_id, payload)
        return success_response(data=consultant.__dict__, message="Consultant assignment updated")
    except HTTPException:
        raise
    except Exception as exc:
        return error_response(message=str(exc))
