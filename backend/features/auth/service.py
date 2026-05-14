from sqlalchemy.orm import Session
from infra.models import User
from core.security import verify_password, create_access_token


def authenticate_user(db: Session, email: str, password: str) -> User | None:
    user = db.query(User).filter(User.email == email, User.is_active == True).first()
    if not user or not verify_password(password, user.password_hash):
        return None
    return user


def build_token(user: User) -> dict:
    token = create_access_token({"sub": str(user.id), "role": user.role.value})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user_id": user.id,
        "name": user.name,
        "role": user.role.value,
        "secondary_role": user.secondary_role,
        "email": user.email,
        "must_change_password": bool(user.must_change_password),
    }
