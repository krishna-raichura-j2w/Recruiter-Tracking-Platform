from core.database import get_db
from core.deps import get_current_user
from core.response_format import (
    error_response,
    success_response,
    success_response_with_pagination,
)
from fastapi import APIRouter, Depends, Query
from infra.models import User
from sqlalchemy.orm import Session

from features.hrbp.audit_log.service import log_action
from features.hrbp.clients import service
from features.hrbp.clients.schema import ClientCreate, ClientUpdate
from features.hrbp.clients.export import build_and_upload as export_clients

router = APIRouter(prefix="/clients", tags=["hrbp-clients"])


@router.get("/summary")
def get_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        data = service.get_summary(db, current_user)
        return success_response(data=data, message="Clients summary fetched")
    except Exception as exc:
        return error_response(message=str(exc))


@router.post("")
def create_client(
    payload: ClientCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        data = service.create(db, payload)
        log_action(db, actor_id=current_user.id, entity_type="client", entity_id=data.id,
                   action="create", new_value={"name": data.name, "industry": data.industry})
        db.commit()
        return success_response(data=data.__dict__, message="Client created successfully")
    except Exception as exc:
        return error_response(message=str(exc))


@router.get("/export")
def export_clients_excel(
    search: str | None = Query(default=None),
    industry: str | None = Query(default=None),
    is_active: bool | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        url = export_clients(db, current_user, search=search, industry=industry, is_active=is_active)
        return success_response(data={"url": url}, message="Excel exported successfully")
    except Exception as exc:
        return error_response(message=str(exc))


@router.get("")
def list_clients(
    page_no: int = Query(default=1, ge=1),
    per_page: int = Query(default=10, ge=-1),
    is_active: bool | None = Query(default=None),
    search: str | None = Query(default=None),
    industry: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    role = current_user.role.value
    hrbp_ids = [current_user.id] if role == "hrbp" else None
    bh_id = current_user.id if role == "bh" else None
    result = service.list_paginated(db, page_no, per_page, hrbp_ids, bh_id, is_active, search, industry)
    return success_response_with_pagination(
        data=result["items"],
        message="Clients fetched successfully",
        page_no=result["page_no"],
        per_page=result["per_page"],
        total=result["total"],
        total_pages=result["total_pages"],
    )


@router.get("/{id}")
def get_client(
    id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    try:
        data = service.get_by_id(db, id)
        return success_response(data=data.__dict__, message="Client fetched successfully")
    except Exception as exc:
        return error_response(message=str(exc))


@router.put("/{id}")
def update_client(
    id: int,
    payload: ClientUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        old = service.get_by_id(db, id)
        update_data = payload.model_dump(exclude_unset=True)
        old_snapshot = {k: getattr(old, k, None) for k in update_data}
        data = service.update(db, id, payload)
        log_action(db, actor_id=current_user.id, entity_type="client", entity_id=id,
                   action="update", old_value=old_snapshot, new_value=update_data)
        db.commit()
        return success_response(data=data.__dict__, message="Client updated successfully")
    except Exception as exc:
        return error_response(message=str(exc))


@router.delete("/{id}")
def delete_client(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        record = service.get_by_id(db, id)
        name = record.name
        service.delete(db, id)
        log_action(db, actor_id=current_user.id, entity_type="client", entity_id=id,
                   action="delete", old_value={"name": name})
        db.commit()
        return success_response(data={}, message="Client deleted successfully")
    except Exception as exc:
        return error_response(message=str(exc))
