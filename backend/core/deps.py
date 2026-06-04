from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from infra.models import User
from sqlalchemy.orm import Session

from core.database import get_db
from core.security import decode_token


def hrbp_visible_client_ids(db: Session, user_id: int) -> list[int]:
    """
    Return IDs of all clients where user_id is an assigned HRBP.
    Checks both the new hrbp_ids array and the legacy hrbp_id scalar.
    """
    from infra.hrbp_models import HRBPClient
    from sqlalchemy import and_, func, or_
    return [
        r.id for r in db.query(HRBPClient.id).filter(
            or_(
                HRBPClient.hrbp_ids.contains([user_id]),
                and_(
                    func.coalesce(func.array_length(HRBPClient.hrbp_ids, 1), 0) == 0,
                    HRBPClient.hrbp_id == user_id,
                ),
            )
        ).all()
    ]


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
    if role in ("admin", "coo", "ops_head", "ceo", "po_finance"):
        return None
    return []


def resolve_hrbp_client_ids(user: User, db: Session) -> list[int] | None:
    """
    Return client IDs this user can see for cadence-style scoping.

    - hrbp  → client IDs where user appears in hrbp_ids (multi-HRBP aware)
    - bh    → client IDs owned by this BH
    - admin / coo / ops_head / ceo → None  (no filter — full access)
    - any other role → []  (empty — sees nothing)
    """
    role = user.role.value
    if role == "hrbp":
        return hrbp_visible_client_ids(db, user.id)
    if role == "bh":
        from infra.hrbp_models import HRBPClient
        return [r.id for r in db.query(HRBPClient.id).filter(HRBPClient.bh_id == user.id).all()]
    if role in ("admin", "coo", "ops_head", "ceo", "po_finance"):
        return None
    return []

bearer = HTTPBearer()


def get_current_user(
    request: Request,
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
    # Record who is making this request, for the access logs (read by the
    # request-timing middleware via request.state, and by the SQL logger via a
    # contextvar for best-effort per-query attribution).
    try:
        request.state.user_email = user.email
        from core.obs import set_current_user
        set_current_user(user.email)
    except Exception:  # noqa: BLE001 — logging attribution must never break auth
        pass
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
