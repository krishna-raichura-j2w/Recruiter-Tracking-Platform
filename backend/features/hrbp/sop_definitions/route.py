from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from core.database import get_db
from core.deps import get_current_user
from core.response_format import success_response, success_response_with_pagination, error_response
from features.hrbp.sop_definitions.schema import SopDefinitionCreate, SopDefinitionUpdate
from features.hrbp.sop_definitions import service

router = APIRouter(prefix="/sop-definitions", tags=["hrbp-sop-definitions"])


@router.post("")
def create_sop(
    payload: SopDefinitionCreate,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    try:
        data = service.create(db, payload)
        return success_response(data=data.__dict__, message="SOP definition created successfully")
    except Exception as exc:
        return error_response(message=str(exc))


@router.get("")
def list_sops(
    page_no: int = Query(default=1, ge=1),
    per_page: int = Query(default=10, ge=-1),
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    result = service.list_paginated(db, page_no, per_page)
    return success_response_with_pagination(
        data=[r.__dict__ for r in result.items],
        message="SOP definitions fetched successfully",
        page_no=result.page_no,
        per_page=result.per_page,
        total=result.total,
        total_pages=result.total_pages,
    )


@router.get("/{id}")
def get_sop_by_id(
    id: int,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    try:
        data = service.get_by_id(db, id)
        return success_response(data=data.__dict__, message="SOP definition fetched successfully")
    except Exception as exc:
        return error_response(message=str(exc))


@router.get("/type/{sop_type}")
def get_sop_by_type(
    sop_type: str,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    try:
        data = service.get_by_type(db, sop_type)
        return success_response(data=data.__dict__, message="SOP definition fetched successfully")
    except Exception as exc:
        return error_response(message=str(exc))


@router.get("/type/{sop_type}/steps")
def get_sop_steps(
    sop_type: str,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    try:
        data = service.get_by_type(db, sop_type)
        return success_response(data=data.steps_definition, message="SOP steps fetched successfully")
    except Exception as exc:
        return error_response(message=str(exc))


@router.get("/type/{sop_type}/hierarchy")
def get_sop_hierarchy(
    sop_type: str,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    try:
        data = service.get_by_type(db, sop_type)
        return success_response(data=data.persons_hierarchy, message="SOP hierarchy fetched successfully")
    except Exception as exc:
        return error_response(message=str(exc))


@router.put("/{id}")
def update_sop(
    id: int,
    payload: SopDefinitionUpdate,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    try:
        data = service.update(db, id, payload)
        return success_response(data=data.__dict__, message="SOP definition updated successfully")
    except Exception as exc:
        return error_response(message=str(exc))


@router.delete("/{id}")
def delete_sop(
    id: int,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    try:
        service.delete(db, id)
        return success_response(data={}, message="SOP definition deleted successfully")
    except Exception as exc:
        return error_response(message=str(exc))
