from uuid import UUID
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from core.database import get_db
from core.deps import get_current_user
from core.response_format import success_response, success_response_with_pagination, error_response
from features.hrbp.nps_surveys.schema import NpsSurveyCreate, NpsSurveyUpdate
from features.hrbp.nps_surveys import service

router = APIRouter(prefix="/nps-surveys", tags=["hrbp-nps-surveys"])


@router.post("")
def create_survey(
    payload: NpsSurveyCreate,
    db: Session = Depends(get_db),
    _: object   = Depends(get_current_user),
):
    try:
        data = service.create(db, payload)
        return success_response(data=data.__dict__, message="NPS survey created successfully")
    except Exception as exc:
        return error_response(message=str(exc))


@router.get("")
def list_surveys(
    page_no:       int            = Query(default=1,  ge=1),
    per_page:      int            = Query(default=10, ge=1, le=100),
    consultant_id: Optional[UUID] = Query(default=None),
    survey_type:   Optional[str]  = Query(default=None),
    responded:     Optional[bool] = Query(default=None),
    db: Session = Depends(get_db),
    _: object   = Depends(get_current_user),
):
    result = service.list_paginated(db, page_no, per_page, consultant_id, survey_type, responded)
    return success_response_with_pagination(
        data=[r.__dict__ for r in result.items],
        message="NPS surveys fetched successfully",
        page_no=result.page_no,
        per_page=result.per_page,
        total=result.total,
        total_pages=result.total_pages,
    )


@router.get("/{id}")
def get_survey(
    id: UUID,
    db: Session = Depends(get_db),
    _: object   = Depends(get_current_user),
):
    try:
        data = service.get_by_id(db, id)
        return success_response(data=data.__dict__, message="NPS survey fetched successfully")
    except Exception as exc:
        return error_response(message=str(exc))


@router.put("/{id}")
def update_survey(
    id: UUID,
    payload: NpsSurveyUpdate,
    db: Session = Depends(get_db),
    _: object   = Depends(get_current_user),
):
    try:
        data = service.update(db, id, payload)
        return success_response(data=data.__dict__, message="NPS survey updated successfully")
    except Exception as exc:
        return error_response(message=str(exc))


@router.delete("/{id}")
def delete_survey(
    id: UUID,
    db: Session = Depends(get_db),
    _: object   = Depends(get_current_user),
):
    try:
        service.delete(db, id)
        return success_response(data={}, message="NPS survey deleted successfully")
    except Exception as exc:
        return error_response(message=str(exc))
