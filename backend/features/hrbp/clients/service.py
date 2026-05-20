from core.pagination import PageResult, paginate
from fastapi import HTTPException
from infra.hrbp_models import HRBPClient
from sqlalchemy.orm import Session

from features.hrbp.clients.schema import ClientCreate, ClientUpdate


def create(db: Session, payload: ClientCreate) -> HRBPClient:
    record = HRBPClient(**payload.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def list_paginated(
    db: Session,
    page_no: int,
    per_page: int,
    hrbp_id: int | None = None,
    is_active: bool | None = None,
) -> PageResult:
    q = db.query(HRBPClient)
    if hrbp_id is not None:
        q = q.filter(HRBPClient.hrbp_id == hrbp_id)
    if is_active is not None:
        q = q.filter(HRBPClient.is_active == is_active)
    q = q.order_by(HRBPClient.name)
    return paginate(q, page_no, per_page)


def get_by_id(db: Session, id: int) -> HRBPClient:
    record = db.query(HRBPClient).filter_by(id=id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Client not found")
    return record


def update(db: Session, id: int, payload: ClientUpdate) -> HRBPClient:
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
