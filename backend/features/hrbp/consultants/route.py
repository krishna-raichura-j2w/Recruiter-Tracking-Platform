from datetime import date

from core.database import get_db
from core.deps import get_current_user
from infra.hrbp_models import HRBPClient
from sqlalchemy import and_, func, or_
from core.response_format import (
    error_response,
    success_response,
    success_response_with_pagination,
)
from fastapi import APIRouter, Depends, File, Query, UploadFile
from fastapi.responses import StreamingResponse
from infra.models import User
from sqlalchemy.orm import Session

from features.hrbp.audit_log.service import log_action
from features.hrbp.consultants import service
from features.hrbp.consultants.schema import ConsultantCreate, ConsultantUpdate

router = APIRouter(prefix="/consultants", tags=["hrbp-consultants"])


@router.get("/summary")
def get_summary(
    client_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        data = service.get_summary(db, current_user, client_id)
        return success_response(data=data, message="Consultants summary fetched")
    except Exception as exc:
        return error_response(message=str(exc))


@router.get("/download-template")
def download_template(
    client_id: int | None = Query(default=None),
    current_user: User = Depends(get_current_user),
):
    try:
        file_bytes = service.build_template(hrbp_id=current_user.id, client_id=client_id)
        filename = "Consultants_Bulk_Upload_Template.xlsx"
        headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
        return StreamingResponse(
            file_bytes,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers=headers,
        )
    except Exception as exc:
        return error_response(message=str(exc))


@router.post("/bulk-upsert")
async def bulk_upsert_consultants(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    allowed = {"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
               "application/vnd.ms-excel"}
    if file.content_type and file.content_type not in allowed:
        return error_response(message="Only .xlsx files are supported")
    try:
        file_bytes = await file.read()
        result = service.bulk_upsert_from_excel(db, file_bytes)
        log_action(db, actor_id=current_user.id, entity_type="consultant", entity_id=0,
                   action="bulk_upsert", new_value=result)
        db.commit()
        return success_response(data=result, message=f"Bulk upsert complete: {result['inserted']} inserted, {result['updated']} updated")
    except Exception as exc:
        return error_response(message=str(exc))


@router.post("")
def create_consultant(
    payload: ConsultantCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        data = service.create(db, payload)
        log_action(db, actor_id=current_user.id, entity_type="consultant", entity_id=data.id,
                   action="create", new_value={"name": data.name, "emp_id": data.emp_id})
        db.commit()
        return success_response(data=data.__dict__, message="Consultant created successfully")
    except Exception as exc:
        return error_response(message=str(exc))


@router.get("")
def list_consultants(
    page_no: int = Query(default=1, ge=1),
    per_page: int = Query(default=10, ge=-1),
    client_id: int | None = Query(default=None),
    cohort: str | None = Query(default=None),
    perf_tier: str | None = Query(default=None),
    is_active: bool | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    role = current_user.role.value
    hrbp_ids: list[int] | None = None
    bh_client_ids: list[int] | None = None

    if role == "hrbp":
        uid = current_user.id
        rows = db.query(HRBPClient.id).filter(
            or_(
                HRBPClient.hrbp_ids.contains([uid]),
                and_(
                    func.coalesce(func.array_length(HRBPClient.hrbp_ids, 1), 0) == 0,
                    HRBPClient.hrbp_id == uid,
                ),
            )
        ).all()
        bh_client_ids = [r[0] for r in rows]
    elif role == "bh":
        rows = db.query(HRBPClient.id).filter(HRBPClient.bh_id == current_user.id).all()
        bh_client_ids = [r[0] for r in rows]

    result = service.list_paginated(
        db, page_no, per_page, hrbp_ids, bh_client_ids,
        client_id, cohort, perf_tier, is_active, date_from, date_to,
    )
    return success_response_with_pagination(
        data=[r.__dict__ for r in result.items],
        message="Consultants fetched successfully",
        page_no=result.page_no,
        per_page=result.per_page,
        total=result.total,
        total_pages=result.total_pages,
    )


@router.get("/emp/{emp_id}")
def get_consultant_by_emp_id(
    emp_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    try:
        data = service.get_by_emp_id(db, emp_id)
        return success_response(data=data.__dict__, message="Consultant fetched successfully")
    except Exception as exc:
        return error_response(message=str(exc))


@router.get("/{id}")
def get_consultant(
    id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    try:
        data = service.get_by_id(db, id)
        return success_response(data=data.__dict__, message="Consultant fetched successfully")
    except Exception as exc:
        return error_response(message=str(exc))


@router.put("/{id}")
def update_consultant(
    id: int,
    payload: ConsultantUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        old = service.get_by_id(db, id)
        old_data = payload.model_dump(exclude_unset=True)
        old_snapshot = {k: getattr(old, k, None) for k in old_data}
        data = service.update(db, id, payload)
        log_action(db, actor_id=current_user.id, entity_type="consultant", entity_id=id,
                   action="update", old_value=old_snapshot, new_value=old_data)
        db.commit()
        return success_response(data=data.__dict__, message="Consultant updated successfully")
    except Exception as exc:
        return error_response(message=str(exc))


@router.delete("/{id}")
def delete_consultant(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        record = service.get_by_id(db, id)
        name = record.name
        service.delete(db, id)
        log_action(db, actor_id=current_user.id, entity_type="consultant", entity_id=id,
                   action="delete", old_value={"name": name})
        db.commit()
        return success_response(data={}, message="Consultant deleted successfully")
    except Exception as exc:
        return error_response(message=str(exc))
