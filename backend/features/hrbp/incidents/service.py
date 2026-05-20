from core.pagination import PageResult, paginate
from fastapi import HTTPException
from infra.hrbp_models import HRBPIncident
from sqlalchemy.orm import Session

from features.hrbp.incidents.schema import IncidentCreate, IncidentUpdate


def create(db: Session, payload: IncidentCreate) -> HRBPIncident:
    record = HRBPIncident(**payload.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def list_paginated(
    db: Session,
    page_no: int,
    per_page: int,
    status: str | None = None,
    risk_level: str | None = None,
    consultant_id: int | None = None,
    client_id: int | None = None,
) -> PageResult:
    q = db.query(HRBPIncident)
    if status is not None:
        q = q.filter(HRBPIncident.status == status)
    if risk_level is not None:
        q = q.filter(HRBPIncident.risk_level == risk_level)
    if consultant_id is not None:
        q = q.filter(HRBPIncident.consultant_id == consultant_id)
    if client_id is not None:
        q = q.filter(HRBPIncident.client_id == client_id)
    q = q.order_by(HRBPIncident.opened_at.desc())
    return paginate(q, page_no, per_page)


def get_by_id(db: Session, id: int) -> HRBPIncident:
    record = db.query(HRBPIncident).filter_by(id=id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Incident not found")
    return record


def get_by_ticket_ref(db: Session, ticket_ref: str) -> HRBPIncident:
    record = db.query(HRBPIncident).filter_by(ticket_ref=ticket_ref).first()
    if not record:
        raise HTTPException(status_code=404, detail=f"Ticket '{ticket_ref}' not found")
    return record


def update(db: Session, id: int, payload: IncidentUpdate) -> HRBPIncident:
    record = get_by_id(db, id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(record, field, value)
    db.commit()
    db.refresh(record)
    return record


def delete(db: Session, id: int) -> None:
    record = get_by_id(db, id)
    db.delete(record)
    db.commit()
