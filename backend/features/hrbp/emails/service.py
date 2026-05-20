from uuid import UUID
from sqlalchemy.orm import Session
from fastapi import HTTPException
from infra.hrbp_models import HRBPEmail
from features.hrbp.emails.schema import EmailCreate, EmailUpdate
from core.pagination import paginate, PageResult


def create(db: Session, payload: EmailCreate) -> HRBPEmail:
    record = HRBPEmail(**payload.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def list_paginated(
    db: Session,
    page_no: int,
    per_page: int,
    direction: str | None = None,
    consultant_id: UUID | None = None,
    incident_id: UUID | None = None,
    processed: bool | None = None,
) -> PageResult:
    q = db.query(HRBPEmail)
    if direction is not None:
        q = q.filter(HRBPEmail.direction == direction)
    if consultant_id is not None:
        q = q.filter(HRBPEmail.consultant_id == consultant_id)
    if incident_id is not None:
        q = q.filter(HRBPEmail.incident_id == incident_id)
    if processed is not None:
        q = q.filter(HRBPEmail.processed == processed)
    q = q.order_by(HRBPEmail.created_at.desc())
    return paginate(q, page_no, per_page)


def get_by_id(db: Session, id: UUID) -> HRBPEmail:
    record = db.query(HRBPEmail).filter_by(id=id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Email record not found")
    return record


def update(db: Session, id: UUID, payload: EmailUpdate) -> HRBPEmail:
    record = get_by_id(db, id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(record, field, value)
    db.commit()
    db.refresh(record)
    return record


def delete(db: Session, id: UUID) -> None:
    record = get_by_id(db, id)
    db.delete(record)
    db.commit()
