from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from core.database import get_db
from core.deps import get_current_user
from core.response_format import success_response, success_response_with_pagination, error_response
from features.hrbp.kra_definitions.schema import KraDefinitionCreate, KraDefinitionUpdate
from features.hrbp.kra_definitions import service

router = APIRouter(prefix="/kra-definitions", tags=["hrbp-kra-definitions"])


@router.post("")
def create_kra(
    payload: KraDefinitionCreate,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    try:
        data = service.create(db, payload)
        return success_response(data=data.__dict__, message="KRA definition created successfully")
    except Exception as exc:
        return error_response(message=str(exc))


@router.get("")
def list_kras(
    page_no: int = Query(default=1, ge=1),
    per_page: int = Query(default=10, ge=-1),
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    result = service.list_paginated(db, page_no, per_page)
    return success_response_with_pagination(
        data=[r.__dict__ for r in result.items],
        message="KRA definitions fetched successfully",
        page_no=result.page_no,
        per_page=result.per_page,
        total=result.total,
        total_pages=result.total_pages,
    )


@router.get("/{id}")
def get_kra_by_id(
    id: int,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    try:
        data = service.get_by_id(db, id)
        return success_response(data=data.__dict__, message="KRA definition fetched successfully")
    except Exception as exc:
        return error_response(message=str(exc))


@router.get("/code/{kra_code}")
def get_kra_by_code(
    kra_code: str,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    try:
        data = service.get_by_code(db, kra_code)
        return success_response(data=data.__dict__, message="KRA definition fetched successfully")
    except Exception as exc:
        return error_response(message=str(exc))


@router.put("/{id}")
def update_kra(
    id: int,
    payload: KraDefinitionUpdate,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    try:
        data = service.update(db, id, payload)
        return success_response(data=data.__dict__, message="KRA definition updated successfully")
    except Exception as exc:
        return error_response(message=str(exc))


@router.delete("/{id}")
def delete_kra(
    id: int,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    try:
        service.delete(db, id)
        return success_response(data={}, message="KRA definition deleted successfully")
    except Exception as exc:
        return error_response(message=str(exc))
