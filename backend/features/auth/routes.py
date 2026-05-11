from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from core.database import get_db
from core.deps import get_current_user
from features.auth.schema import LoginRequest, TokenResponse
from features.auth.service import authenticate_user, build_token

router = APIRouter(prefix="/auth", tags=["auth"])


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
    }
