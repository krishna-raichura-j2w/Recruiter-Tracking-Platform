from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from core.database import get_db
from core.deps import get_current_user
from core.response_format import error_response, success_response
from features.hrbp.governance import service
from features.hrbp.governance.constants import GOVERNANCE_CATEGORIES
from features.hrbp.governance.schemas import CommentRequest, ManualScoreUpdate
from infra.models import User

router = APIRouter(prefix="/governance", tags=["hrbp-governance"])


class CustomCategoryCreate(BaseModel):
    label: str
    max_score: int
    description: str = ""


@router.get("/categories")
def get_categories(_: User = Depends(get_current_user)):
    return success_response(data=GOVERNANCE_CATEGORIES, message="Categories fetched")


@router.get("/consultants/{consultant_id}/summary")
def get_summary(
    consultant_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    try:
        data = service.get_score_summary(db, consultant_id)
        db.commit()
        return success_response(data=data, message="Score summary fetched")
    except Exception as exc:
        db.rollback()
        return error_response(message=str(exc))


@router.get("/consultants/{consultant_id}/scores")
def get_scores(
    consultant_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    try:
        data = service.get_full_scores(db, consultant_id)
        db.commit()
        return success_response(data=data, message="Scores fetched")
    except Exception as exc:
        db.rollback()
        return error_response(message=str(exc))


@router.post("/consultants/{consultant_id}/scores")
def update_scores(
    consultant_id: int,
    payload: ManualScoreUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    try:
        data = service.update_scores_manual(db, consultant_id, payload.scores)
        db.commit()
        return success_response(data=data, message="Scores updated")
    except Exception as exc:
        db.rollback()
        return error_response(message=str(exc))


# ── Category management ───────────────────────────────────────────────────────

@router.delete("/consultants/{consultant_id}/categories/{category_key}")
def deactivate_category(
    consultant_id: int,
    category_key: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    try:
        service.deactivate_category(db, consultant_id, category_key)
        db.commit()
        return success_response(data={}, message="Category removed")
    except Exception as exc:
        db.rollback()
        return error_response(message=str(exc))


@router.post("/consultants/{consultant_id}/categories/{category_key}/restore")
def restore_category(
    consultant_id: int,
    category_key: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    try:
        service.restore_category(db, consultant_id, category_key)
        db.commit()
        return success_response(data={}, message="Category restored")
    except Exception as exc:
        db.rollback()
        return error_response(message=str(exc))


@router.post("/consultants/{consultant_id}/categories/custom")
def add_custom_category(
    consultant_id: int,
    payload: CustomCategoryCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    try:
        data = service.add_custom_category(
            db, consultant_id, payload.label, payload.max_score, payload.description
        )
        db.commit()
        return success_response(data=data, message="Custom category added")
    except Exception as exc:
        db.rollback()
        return error_response(message=str(exc))


@router.delete("/consultants/{consultant_id}/categories/custom/{category_key}")
def delete_custom_category(
    consultant_id: int,
    category_key: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    try:
        service.delete_custom_category(db, consultant_id, category_key)
        db.commit()
        return success_response(data={}, message="Custom category deleted")
    except Exception as exc:
        db.rollback()
        return error_response(message=str(exc))


# ── Comment analysis ──────────────────────────────────────────────────────────

@router.post("/consultants/{consultant_id}/analyze-comment")
def analyze_comment(
    consultant_id: int,
    payload: CommentRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        data = service.analyze_comment(
            db=db,
            consultant_id=consultant_id,
            comment=payload.comment,
            consultant_name=payload.consultant_name,
            created_by=current_user.id,
        )
        db.commit()
        return success_response(data=data, message="Comment analysed and scores updated")
    except Exception as exc:
        db.rollback()
        return error_response(message=str(exc))


@router.get("/consultants/{consultant_id}/comment-history")
def get_comment_history(
    consultant_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    try:
        data = service.get_comment_history(db, consultant_id)
        return success_response(data=data, message="Comment history fetched")
    except Exception as exc:
        return error_response(message=str(exc))
