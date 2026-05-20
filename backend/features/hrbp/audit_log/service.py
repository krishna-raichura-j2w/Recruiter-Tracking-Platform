from core.pagination import PageResult, paginate
from fastapi import HTTPException
from infra.hrbp_models import HRBPAuditLog
from sqlalchemy.orm import Session


def list_paginated(
    db: Session,
    page_no: int,
    per_page: int,
    entity_type: str | None = None,
    entity_id: int | None = None,
    actor_id: int | None = None,
) -> PageResult:
    q = db.query(HRBPAuditLog)
    if entity_type is not None:
        q = q.filter(HRBPAuditLog.entity_type == entity_type)
    if entity_id is not None:
        q = q.filter(HRBPAuditLog.entity_id == entity_id)
    if actor_id is not None:
        q = q.filter(HRBPAuditLog.actor_id == actor_id)
    q = q.order_by(HRBPAuditLog.ts.desc())
    return paginate(q, page_no, per_page)


def get_by_id(db: Session, id: int) -> HRBPAuditLog:
    record = db.query(HRBPAuditLog).filter_by(id=id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Audit log entry not found")
    return record
