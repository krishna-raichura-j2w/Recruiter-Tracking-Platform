from core.pagination import paginate_raw
from fastapi import HTTPException
from infra.hrbp_models import HRBPClient, HRBPConsultant
from infra.models import User
from sqlalchemy import func
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
    hrbp_ids: list[int] | None = None,
    bh_id: int | None = None,
    is_active: bool | None = None,
) -> dict:
    consultant_sub = (
        db.query(
            HRBPConsultant.client_id,
            func.count(HRBPConsultant.id).label("headcount"),
            func.coalesce(func.sum(HRBPConsultant.monthly_po), 0).label("total_monthly_po"),
        )
        .group_by(HRBPConsultant.client_id)
        .subquery()
    )

    q = (
        db.query(
            HRBPClient.id,
            HRBPClient.name,
            HRBPClient.industry,
            HRBPClient.bh_id,
            User.name.label("bh_name"),
            HRBPClient.is_active,
            HRBPClient.created_at,
            HRBPClient.updated_at,
            func.coalesce(consultant_sub.c.headcount, 0).label("headcount"),
            func.coalesce(consultant_sub.c.total_monthly_po, 0).label("total_monthly_po"),
        )
        .outerjoin(User, HRBPClient.bh_id == User.id)
        .outerjoin(consultant_sub, HRBPClient.id == consultant_sub.c.client_id)
    )

    # hrbp sees their own clients; bh sees clients where they are the owner
    if hrbp_ids is not None:
        q = q.filter(HRBPClient.hrbp_id.in_(hrbp_ids))
    elif bh_id is not None:
        q = q.filter(HRBPClient.bh_id == bh_id)
    if is_active is not None:
        q = q.filter(HRBPClient.is_active == is_active)
    q = q.order_by(HRBPClient.name)
    return paginate_raw(q, page_no, per_page)


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
