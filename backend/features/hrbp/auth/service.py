from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from infra.models import User
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from core.config import settings
from core.email import send_outlook_email
from features.hrbp.auth.schema import UserUpdate

_RESET_PURPOSE = "password_reset"


def _make_reset_token(user_id: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.password_reset_expire_minutes
    )
    return jwt.encode(
        {"sub": str(user_id), "purpose": _RESET_PURPOSE, "exp": expire},
        settings.secret_key,
        algorithm=settings.algorithm,
    )


def _decode_reset_token(token: str) -> int:
    try:
        data = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except JWTError:
        raise HTTPException(status_code=400, detail="Reset link is invalid or has expired")
    if data.get("purpose") != _RESET_PURPOSE:
        raise HTTPException(status_code=400, detail="Invalid reset token")
    return int(data["sub"])


def list_users(db: Session, role: str | None = None) -> list[User]:
    q = db.query(User).filter(User.is_active == True)  # noqa: E712
    if role:
        q = q.filter(User.role == role)
    return q.order_by(User.name).all()


def get_by_id(db: Session, user_id: int) -> User:
    user = db.query(User).filter_by(id=user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


def update(db: Session, user_id: int, payload: UserUpdate) -> User:
    user = get_by_id(db, user_id)
    data = payload.model_dump(exclude_unset=True)

    password = data.pop("password", None)
    if password:
        from core.security import hash_password

        user.password_hash = hash_password(password)

    for field, value in data.items():
        setattr(user, field, value)

    db.commit()
    db.refresh(user)
    return user


def request_password_reset(db: Session, email: str) -> None:
    """
    Generate a reset token and email it to the user.
    Always returns silently even if the email is not found (prevents user enumeration).
    """
    user = db.query(User).filter(
        User.email == email.lower().strip(),
        User.is_active == True,  # noqa: E712
    ).first()
    if not user:
        return  # silent no-op

    token = _make_reset_token(user.id)
    reset_url = f"{settings.frontend_url}/reset-password?token={token}"

    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0">
      <div style="text-align:center;margin-bottom:24px">
        <h2 style="color:#0f2249;margin:0">J2W HRBP System</h2>
        <p style="color:#64748b;font-size:14px;margin:4px 0 0">Password Reset Request</p>
      </div>
      <p style="color:#334155;font-size:15px">Hi <strong>{user.name}</strong>,</p>
      <p style="color:#475569;font-size:14px;line-height:1.6">
        We received a request to reset your password. Click the button below to set a new one.
        This link is valid for <strong>{settings.password_reset_expire_minutes} minutes</strong>.
      </p>
      <div style="text-align:center;margin:32px 0">
        <a href="{reset_url}"
           style="background:#0f2249;color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:600;font-size:15px;display:inline-block">
          Reset My Password
        </a>
      </div>
      <p style="color:#94a3b8;font-size:12px;line-height:1.6">
        If you didn't request this, you can safely ignore this email — your password won't change.<br>
        Or copy this link: <a href="{reset_url}" style="color:#0ea5e9">{reset_url}</a>
      </p>
    </div>
    """

    send_outlook_email(
        [user.email],
        "Reset your J2W HRBP password",
        html,
    )


def reset_password(db: Session, token: str, new_password: str) -> None:
    """Validate the reset token and update the user's password."""
    if len(new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    user_id = _decode_reset_token(token)
    user = db.query(User).filter_by(id=user_id, is_active=True).first()
    if not user:
        raise HTTPException(status_code=400, detail="User not found or inactive")

    from core.security import hash_password
    user.password_hash = hash_password(new_password)
    user.must_change_password = False
    db.commit()
