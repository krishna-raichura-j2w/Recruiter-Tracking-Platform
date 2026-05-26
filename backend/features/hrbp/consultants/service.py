from core.pagination import PageResult, paginate
from datetime import date, timedelta
from fastapi import HTTPException
from infra.hrbp_models import HRBPClient, HRBPConsultant, HRBPTicket, hrbp_ticket_consultants
from infra.models import User
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from features.hrbp.consultants.schema import ConsultantCreate, ConsultantUpdate


def get_summary(db: Session, current_user: User, client_id: int | None = None) -> dict:
    role = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)

    q = db.query(HRBPConsultant)
    if role == "hrbp":
        q = q.filter(HRBPConsultant.hrbp_id == current_user.id)
    elif role == "bh":
        bh_client_ids = [
            r.id for r in db.query(HRBPClient.id).filter_by(bh_id=current_user.id).all()
        ]
        q = q.filter(HRBPConsultant.client_id.in_(bh_client_ids))

    if client_id is not None:
        q = q.filter(HRBPConsultant.client_id == client_id)

    total  = q.count()
    active = q.filter(HRBPConsultant.is_active.is_(True)).count()

    cutoff = date.today() + timedelta(days=30)
    expiring_soon = q.filter(
        HRBPConsultant.is_active.is_(True),
        HRBPConsultant.po_end_date <= cutoff,
        HRBPConsultant.po_end_date >= date.today(),
    ).count()

    po_at_risk = q.filter(
        HRBPConsultant.is_active.is_(True),
        HRBPConsultant.po_risk > 0,
    ).count()

    return {
        "total":          total,
        "active":         active,
        "expiring_soon":  expiring_soon,
        "po_at_risk":     po_at_risk,
    }


def create(db: Session, payload: ConsultantCreate) -> HRBPConsultant:
    if db.query(HRBPConsultant).filter_by(emp_id=payload.emp_id).first():
        raise HTTPException(
            status_code=409,
            detail=f"Employee ID '{payload.emp_id}' already exists",
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
    hrbp_ids: list[int] | None = None,
    bh_client_ids: list[int] | None = None,
    client_id: int | None = None,
    cohort: str | None = None,
    perf_tier: str | None = None,
    is_active: bool | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> PageResult:
    q = db.query(HRBPConsultant)
    # hrbp sees their own consultants; bh sees consultants via their client_ids
    if hrbp_ids is not None:
        q = q.filter(HRBPConsultant.hrbp_id.in_(hrbp_ids))
    elif bh_client_ids is not None:
        q = q.filter(HRBPConsultant.client_id.in_(bh_client_ids))
    if client_id is not None:
        q = q.filter(HRBPConsultant.client_id == client_id)
    if cohort is not None:
        q = q.filter(HRBPConsultant.cohort == cohort)
    if perf_tier is not None:
        q = q.filter(HRBPConsultant.perf_tier == perf_tier)
    if is_active is not None:
        q = q.filter(HRBPConsultant.is_active == is_active)
    if date_from is not None:
        q = q.filter(HRBPConsultant.created_at >= date_from)
    if date_to is not None:
        q = q.filter(HRBPConsultant.created_at <= date_to)
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
    update_data = payload.model_dump(exclude_unset=True)

    # Skip po_risk update if the consultant has any open/escalated tickets
    if "po_risk" in update_data:
        has_active_ticket = db.execute(
            select(hrbp_ticket_consultants.c.ticket_id)
            .join(HRBPTicket, HRBPTicket.id == hrbp_ticket_consultants.c.ticket_id)
            .where(
                hrbp_ticket_consultants.c.consultant_id == id,
                HRBPTicket.status.in_(["open", "escalated"]),
            )
            .limit(1)
        ).first()
        if has_active_ticket:
            del update_data["po_risk"]

    for field, value in update_data.items():
        setattr(record, field, value)
    db.commit()
    db.refresh(record)
    return record


def delete(db: Session, id: int) -> None:
    record = get_by_id(db, id)
    db.delete(record)
    db.commit()
