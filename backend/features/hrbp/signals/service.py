from core.pagination import PageResult, paginate
from fastapi import HTTPException
from infra.hrbp_models import HRBPSignal
from sqlalchemy.orm import Session

from features.hrbp.signals.schema import SignalCreate, SignalUpdate


def create(db: Session, payload: SignalCreate) -> HRBPSignal:
    record = HRBPSignal(**payload.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def list_paginated(
    db: Session,
    page_no: int,
    per_page: int,
    consultant_id: int | None = None,
    signal_type: str | None = None,
    incident_id: int | None = None,
) -> PageResult:
    q = db.query(HRBPSignal)
    if consultant_id is not None:
        q = q.filter(HRBPSignal.consultant_id == consultant_id)
    if signal_type is not None:
        q = q.filter(HRBPSignal.signal_type == signal_type)
    if incident_id is not None:
        q = q.filter(HRBPSignal.incident_id == incident_id)
    q = q.order_by(HRBPSignal.logged_at.desc())
    return paginate(q, page_no, per_page)


def get_by_id(db: Session, id: int) -> HRBPSignal:
    record = db.query(HRBPSignal).filter_by(id=id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Signal not found")
    return record


def update(db: Session, id: int, payload: SignalUpdate) -> HRBPSignal:
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
