from core.database import get_db
from core.response_format import error_response, success_response
from fastapi import APIRouter, Depends
from infra.models import User
from sqlalchemy.orm import Session

from features.hrbp.auth import service
from features.hrbp.auth.schema import UserUpdate
from features.hrbp.utils.auth import get_hrbp_user

router = APIRouter(prefix="/users", tags=["hrbp-users"])


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
