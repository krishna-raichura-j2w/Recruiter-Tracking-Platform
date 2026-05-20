from fastapi import HTTPException
from infra.models import User
from sqlalchemy.orm import Session

from features.hrbp.auth.schema import UserUpdate


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
