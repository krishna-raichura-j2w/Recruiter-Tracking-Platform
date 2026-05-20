from uuid import UUID
from sqlalchemy.orm import Session
from fastapi import HTTPException
from infra.hrbp_models import HRBPKraDefinition
from features.hrbp.kra_definitions.schema import KraDefinitionCreate, KraDefinitionUpdate
from core.pagination import paginate, PageResult


def create(db: Session, payload: KraDefinitionCreate) -> HRBPKraDefinition:
    if db.query(HRBPKraDefinition).filter_by(kra_code=payload.kra_code).first():
        raise HTTPException(status_code=409, detail=f"KRA code '{payload.kra_code}' already exists")
    record = HRBPKraDefinition(**payload.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def list_all(db: Session) -> list[HRBPKraDefinition]:
    return db.query(HRBPKraDefinition).order_by(HRBPKraDefinition.kra_code).all()


def list_paginated(db: Session, page_no: int, per_page: int) -> PageResult:
    q = db.query(HRBPKraDefinition).order_by(HRBPKraDefinition.kra_code)
    return paginate(q, page_no, per_page)


def get_by_id(db: Session, id: UUID) -> HRBPKraDefinition:
    record = db.query(HRBPKraDefinition).filter_by(id=id).first()
    if not record:
        raise HTTPException(status_code=404, detail="KRA definition not found")
    return record


def get_by_code(db: Session, kra_code: str) -> HRBPKraDefinition:
    record = db.query(HRBPKraDefinition).filter_by(kra_code=kra_code).first()
    if not record:
        raise HTTPException(status_code=404, detail=f"KRA code '{kra_code}' not found")
    return record


def update(db: Session, id: UUID, payload: KraDefinitionUpdate) -> HRBPKraDefinition:
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
