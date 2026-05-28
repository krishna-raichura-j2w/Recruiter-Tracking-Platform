from core.pagination import paginate_raw
from fastapi import HTTPException
from infra.hrbp_models import HRBPClient, HRBPConsultant
from infra.models import User
from sqlalchemy import func
from sqlalchemy.orm import Session, aliased

from features.hrbp.clients.schema import ClientCreate, ClientUpdate


def get_summary(db: Session, current_user: User) -> dict:
    role = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)

    q = db.query(HRBPClient)
    if role == "hrbp":
        q = q.filter(HRBPClient.hrbp_id == current_user.id)
    elif role == "bh":
        q = q.filter(HRBPClient.bh_id == current_user.id)

    client_ids = [c.id for c in q.with_entities(HRBPClient.id).all()]

    total    = len(client_ids)
    active   = q.filter(HRBPClient.is_active.is_(True)).count()
    inactive = total - active

    total_consultants = (
        db.query(func.count(HRBPConsultant.id))
        .filter(HRBPConsultant.client_id.in_(client_ids))
        .scalar() or 0
    ) if client_ids else 0

    return {
        "total":             total,
        "active":            active,
        "inactive":          inactive,
        "total_consultants": total_consultants,
    }


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

    HrbpUser = aliased(User)
    BhUser = aliased(User)

    q = (
        db.query(
            HRBPClient.id,
            HRBPClient.name,
            HRBPClient.industry,
            HRBPClient.hrbp_id,
            HrbpUser.name.label("hrbp_name"),
            HRBPClient.bh_id,
            BhUser.name.label("bh_name"),
            HRBPClient.is_active,
            HRBPClient.created_at,
            HRBPClient.updated_at,
            func.coalesce(consultant_sub.c.headcount, 0).label("headcount"),
            func.coalesce(consultant_sub.c.total_monthly_po, 0).label("total_monthly_po"),
        )
        .outerjoin(HrbpUser, HRBPClient.hrbp_id == HrbpUser.id)
        .outerjoin(BhUser, HRBPClient.bh_id == BhUser.id)
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
