from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from core.database import get_db
from core.deps import get_current_user
from features.auth.schema import LoginRequest, TokenResponse
from features.auth.service import authenticate_user, build_token

router = APIRouter(prefix="/auth", tags=["auth"])


class ChangePasswordRequest(BaseModel):
    new_password: str
    confirm_password: str


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = authenticate_user(db, body.email, body.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    return build_token(user)


@router.get("/me")
def me(current_user=Depends(get_current_user)):
    return {
        "user_id": current_user.id,
        "name": current_user.name,
        "role": current_user.role.value,
        "email": current_user.email,
        "is_active": current_user.is_active,
        "must_change_password": bool(current_user.must_change_password),
    }


@router.post("/change-password")
def change_password(
    body: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    if body.new_password != body.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match")
    if len(body.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    from features.users.service import change_password as svc_change
    user = svc_change(db, current_user.id, body.new_password)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return build_token(user)
