from core.pagination import PageResult, paginate
from fastapi import HTTPException
from infra.hrbp_models import HRBPSopStep
from sqlalchemy.orm import Session

from features.hrbp.sop_steps.schema import SopStepCreate, SopStepUpdate


def create(db: Session, payload: SopStepCreate) -> HRBPSopStep:
    existing = (
        db.query(HRBPSopStep)
        .filter_by(incident_id=payload.incident_id, step_number=payload.step_number)
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Step {payload.step_number} already exists for this incident",
        )
    record = HRBPSopStep(**payload.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def list_paginated(
    db: Session,
    page_no: int,
    per_page: int,
    incident_id: int | None = None,
    status: str | None = None,
) -> PageResult:
    q = db.query(HRBPSopStep)
    if incident_id is not None:
        q = q.filter(HRBPSopStep.incident_id == incident_id)
    if status is not None:
        q = q.filter(HRBPSopStep.status == status)
    q = q.order_by(HRBPSopStep.incident_id, HRBPSopStep.step_number)
    return paginate(q, page_no, per_page)


def get_by_id(db: Session, id: int) -> HRBPSopStep:
    record = db.query(HRBPSopStep).filter_by(id=id).first()
    if not record:
        raise HTTPException(status_code=404, detail="SOP step not found")
    return record


def update(db: Session, id: int, payload: SopStepUpdate) -> HRBPSopStep:
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
