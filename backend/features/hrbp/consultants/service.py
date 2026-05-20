from core.pagination import PageResult, paginate
from fastapi import HTTPException
from infra.hrbp_models import HRBPConsultant
from sqlalchemy.orm import Session

from features.hrbp.consultants.schema import ConsultantCreate, ConsultantUpdate


def create(db: Session, payload: ConsultantCreate) -> HRBPConsultant:
    if db.query(HRBPConsultant).filter_by(emp_id=payload.emp_id).first():
        raise HTTPException(
            status_code=409, detail=f"Employee ID '{payload.emp_id}' already exists",
        )
    record = HRBPConsultant(**payload.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def list_paginated(
    db: Session,
    page_no: int,
    per_page: int,
    hrbp_id: int | None = None,
    client_id: int | None = None,
    cohort: str | None = None,
    perf_tier: str | None = None,
    is_active: bool | None = None,
) -> PageResult:
    q = db.query(HRBPConsultant)
    if hrbp_id is not None:
        q = q.filter(HRBPConsultant.hrbp_id == hrbp_id)
    if client_id is not None:
        q = q.filter(HRBPConsultant.client_id == client_id)
    if cohort is not None:
        q = q.filter(HRBPConsultant.cohort == cohort)
    if perf_tier is not None:
        q = q.filter(HRBPConsultant.perf_tier == perf_tier)
    if is_active is not None:
        q = q.filter(HRBPConsultant.is_active == is_active)
    q = q.order_by(HRBPConsultant.name)
    return paginate(q, page_no, per_page)


def get_by_id(db: Session, id: int) -> HRBPConsultant:
    record = db.query(HRBPConsultant).filter_by(id=id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Consultant not found")
    return record


def get_by_emp_id(db: Session, emp_id: str) -> HRBPConsultant:
    record = db.query(HRBPConsultant).filter_by(emp_id=emp_id).first()
    if not record:
        raise HTTPException(status_code=404, detail=f"Employee ID '{emp_id}' not found")
    return record


def update(db: Session, id: int, payload: ConsultantUpdate) -> HRBPConsultant:
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
