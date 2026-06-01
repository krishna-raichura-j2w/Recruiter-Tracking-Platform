from core.config import settings
from core.database import get_db
from core.response_format import error_response, success_response
from core.security import create_access_token
from fastapi import APIRouter, Depends, HTTPException, status
from infra.models import User
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from features.hrbp.auth import service
from features.hrbp.auth.schema import ForgotPasswordRequest, RefreshTokenRequest, ResetPasswordRequest, UserUpdate
from features.hrbp.utils.auth import get_hrbp_user

router = APIRouter(prefix="/users", tags=["hrbp-users"])


@router.get("")
def list_users(
    role: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_hrbp_user),
):
    try:
        users = service.list_users(db, role=role)
        return success_response(
            data=[
                {
                    "id": u.id,
                    "name": u.name,
                    "email": u.email,
                    "role": u.role.value if hasattr(u.role, "value") else u.role,
                }
                for u in users
            ],
            message="Users fetched successfully",
        )
    except Exception as exc:
        return error_response(message=str(exc))


@router.post("/refresh_token")
def refresh_token(payload: RefreshTokenRequest, db: Session = Depends(get_db)):
    try:
        data = jwt.decode(
            payload.token,
            settings.secret_key,
            algorithms=[settings.algorithm],
            options={"verify_exp": False},
        )
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user_id = data.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    user = db.query(User).filter(User.id == int(user_id), User.is_active).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")

    new_token = create_access_token({"sub": str(user.id), "role": user.role.value})
    return success_response(data={"access_token": new_token, "token_type": "bearer"}, message="Token refreshed successfully")


@router.post("/forgot-password")
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    """
    Send a password-reset link to the given email.
    Always returns 200 — even if the email doesn't exist — to prevent user enumeration.
    """
    try:
        service.request_password_reset(db, payload.email)
    except Exception:
        pass  # never expose internal errors to the caller
    return success_response(data={}, message="If that email exists, a reset link has been sent.")


@router.post("/reset-password")
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    """Validate the reset token and set the new password."""
    try:
        service.reset_password(db, payload.token, payload.new_password)
        return success_response(data={}, message="Password updated successfully. You can now sign in.")
    except Exception as exc:
        return error_response(message=str(exc))


@router.get("/{user_id}")
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_hrbp_user),
):
    try:
        user = service.get_by_id(db, user_id)
        return success_response(data=user.__dict__, message="User fetched successfully")
    except Exception as exc:
        return error_response(message=str(exc))


@router.put("/{user_id}")
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_hrbp_user),
):
    try:
        user = service.update(db, user_id, payload)
        return success_response(data=user.__dict__, message="User updated successfully")
    except Exception as exc:
        return error_response(message=str(exc))
