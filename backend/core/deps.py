from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from infra.models import User
from sqlalchemy.orm import Session

from core.database import get_db
from core.security import decode_token


def resolve_hrbp_ids(user: User, db: Session) -> list[int] | None:
    """
    Returns the hrbp_ids this user is allowed to see, based on their role.

    - hrbp  → [user.id]  (own data only)
    - bh    → all hrbp_ids from hrbp_clients where bh_id = user.id
    - admin / coo / ops_head → None  (no filter — full access)
    - any other role → []  (empty — sees nothing)
    """
    role = user.role.value
    if role == "hrbp":
        return [user.id]
    if role == "bh":
        from infra.hrbp_models import HRBPClient
        rows = (
            db.query(HRBPClient.hrbp_id)
            .filter(HRBPClient.bh_id == user.id)
            .distinct()
            .all()
        )
        return [r[0] for r in rows]
    if role in ("admin", "coo", "ops_head"):
        return None
    return []

bearer = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )
    user = db.query(User).filter(User.id == payload.get("sub")).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )
    return user


def require_roles(*roles: str):
    def checker(current_user: User = Depends(get_current_user)) -> User:
        user_roles = {current_user.role.value}
        if current_user.secondary_role:
            user_roles.add(current_user.secondary_role)
        if not user_roles.intersection(set(roles)):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return current_user

    return checker


def user_has_role(user: User, *roles: str) -> bool:
    """Helper to check if a user has any of the given roles (primary or secondary)."""
    user_roles = {user.role.value}
    if user.secondary_role:
        user_roles.add(user.secondary_role)
    return bool(user_roles.intersection(set(roles)))
