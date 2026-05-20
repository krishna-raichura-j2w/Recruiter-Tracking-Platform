from uuid import UUID
from sqlalchemy.orm import Session
from fastapi import HTTPException
from infra.hrbp_models import HRBPSopDefinition
from features.hrbp.sop_definitions.schema import SopDefinitionCreate, SopDefinitionUpdate
from core.pagination import paginate, PageResult


def create(db: Session, payload: SopDefinitionCreate) -> HRBPSopDefinition:
    if db.query(HRBPSopDefinition).filter_by(sop_type=payload.sop_type).first():
        raise HTTPException(status_code=409, detail=f"SOP type '{payload.sop_type}' already exists")
    record = HRBPSopDefinition(**payload.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def list_all(db: Session) -> list[HRBPSopDefinition]:
    return db.query(HRBPSopDefinition).order_by(HRBPSopDefinition.number).all()


def list_paginated(db: Session, page_no: int, per_page: int) -> PageResult:
    q = db.query(HRBPSopDefinition).order_by(HRBPSopDefinition.number)
    return paginate(q, page_no, per_page)


def get_by_id(db: Session, id: UUID) -> HRBPSopDefinition:
    record = db.query(HRBPSopDefinition).filter_by(id=id).first()
    if not record:
        raise HTTPException(status_code=404, detail="SOP definition not found")
    return record


def get_by_type(db: Session, sop_type: str) -> HRBPSopDefinition:
    record = db.query(HRBPSopDefinition).filter_by(sop_type=sop_type).first()
    if not record:
        raise HTTPException(status_code=404, detail=f"SOP type '{sop_type}' not found")
    return record


def update(db: Session, id: UUID, payload: SopDefinitionUpdate) -> HRBPSopDefinition:
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
