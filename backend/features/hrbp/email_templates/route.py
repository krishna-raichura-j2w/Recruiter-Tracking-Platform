from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from core.database import get_db
from core.deps import get_current_user
from core.response_format import success_response, success_response_with_pagination, error_response
from features.hrbp.email_templates.schema import (
    EmailTemplateCreate, EmailTemplateUpdate, RenderRequest,
)
from features.hrbp.email_templates import service

router = APIRouter(prefix="/email-templates", tags=["hrbp-email-templates"])


@router.post("")
def create_template(
    payload: EmailTemplateCreate,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    try:
        data = service.create(db, payload)
        return success_response(data=data.__dict__, message="Email template created successfully")
    except Exception as exc:
        return error_response(message=str(exc))


@router.get("")
def list_templates(
    page_no: int = Query(default=1, ge=1),
    per_page: int = Query(default=10, ge=1, le=100),
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    result = service.list_paginated(db, page_no, per_page)
    return success_response_with_pagination(
        data=[r.__dict__ for r in result.items],
        message="Email templates fetched successfully",
        page_no=result.page_no,
        per_page=result.per_page,
        total=result.total,
        total_pages=result.total_pages,
    )


@router.get("/group/{group_name}")
def list_by_group(
    group_name: str,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    data = service.list_by_group(db, group_name)
    return success_response(data=[r.__dict__ for r in data], message="Email templates fetched successfully")


@router.get("/{id}")
def get_template(
    id: str,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    try:
        data = service.get_by_id(db, id)
        return success_response(data=data.__dict__, message="Email template fetched successfully")
    except Exception as exc:
        return error_response(message=str(exc))


@router.put("/{id}")
def update_template(
    id: str,
    payload: EmailTemplateUpdate,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    try:
        data = service.update(db, id, payload)
        return success_response(data=data.__dict__, message="Email template updated successfully")
    except Exception as exc:
        return error_response(message=str(exc))


@router.delete("/{id}")
def delete_template(
    id: str,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    try:
        service.delete(db, id)
        return success_response(data={}, message="Email template deleted successfully")
    except Exception as exc:
        return error_response(message=str(exc))


@router.post("/{id}/render")
def render_template(
    id: str,
    payload: RenderRequest,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    try:
        data = service.render(db, id, payload.consultant_id)
        return success_response(data=data.model_dump(), message="Template rendered successfully")
    except Exception as exc:
        return error_response(message=str(exc))
