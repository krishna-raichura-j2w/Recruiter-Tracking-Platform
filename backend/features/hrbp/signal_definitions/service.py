from core.pagination import PageResult, paginate
from fastapi import HTTPException
from infra.hrbp_models import HRBPSignalDefinition
from sqlalchemy.orm import Session

from features.hrbp.signal_definitions.schema import (
    SignalDefinitionCreate,
    SignalDefinitionUpdate,
)


def create(db: Session, payload: SignalDefinitionCreate) -> HRBPSignalDefinition:
    if (
        db.query(HRBPSignalDefinition)
        .filter_by(signal_code=payload.signal_code)
        .first()
    ):
        raise HTTPException(
            status_code=409,
            detail=f"Signal code '{payload.signal_code}' already exists",
        )
    record = HRBPSignalDefinition(**payload.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def list_all(db: Session) -> list[HRBPSignalDefinition]:
    return db.query(HRBPSignalDefinition).order_by(HRBPSignalDefinition.number).all()


def list_paginated(db: Session, page_no: int, per_page: int) -> PageResult:
    q = db.query(HRBPSignalDefinition).order_by(HRBPSignalDefinition.number)
    return paginate(q, page_no, per_page)


def get_by_id(db: Session, id: int) -> HRBPSignalDefinition:
    record = db.query(HRBPSignalDefinition).filter_by(id=id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Signal definition not found")
    return record


def get_by_code(db: Session, signal_code: str) -> HRBPSignalDefinition:
    record = db.query(HRBPSignalDefinition).filter_by(signal_code=signal_code).first()
    if not record:
        raise HTTPException(
            status_code=404,
            detail=f"Signal code '{signal_code}' not found",
        )
    return record


def list_by_urgency(db: Session, urgency: str) -> list[HRBPSignalDefinition]:
    return (
        db.query(HRBPSignalDefinition)
        .filter_by(urgency=urgency)
        .order_by(HRBPSignalDefinition.number)
        .all()
    )


def update(
    db: Session,
    id: int,
    payload: SignalDefinitionUpdate,
) -> HRBPSignalDefinition:
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
