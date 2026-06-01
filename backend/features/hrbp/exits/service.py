from __future__ import annotations

from datetime import date, datetime, timezone

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from core.deps import hrbp_visible_client_ids
from core.pagination import PageResult, paginate
from infra.hrbp_models import HRBPConsultant, HRBPClient, HRBPExitTracking, HRBPTicket
from infra.models import User

from features.hrbp.exits.schema import ExitCreate, ExitUpdate


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _role(user: User) -> str:
    return user.role.value if hasattr(user.role, "value") else str(user.role)


def _enrich(db: Session, record: HRBPExitTracking) -> dict:
    consultant = db.query(HRBPConsultant).filter_by(id=record.consultant_id).first()
    client     = db.query(HRBPClient).filter_by(id=record.client_id).first()
    initiator  = db.query(User).filter_by(id=record.initiated_by_id).first()
    d = {c.name: getattr(record, c.name) for c in record.__table__.columns}
    d["consultant_name"]   = consultant.name if consultant else None
    d["client_name"]       = client.name if client else None
    d["initiated_by_name"] = initiator.name if initiator else None
    d["po_impact"]         = float(d["po_impact"]) if d["po_impact"] is not None else None
    if record.source_ticket_id:
        ticket = db.query(HRBPTicket).filter_by(id=record.source_ticket_id).first()
        d["source_ticket_number"] = ticket.ticket_number if ticket else None
    else:
        d["source_ticket_number"] = None
    return d


def _assert_can_view(db: Session, record: HRBPExitTracking, current_user: User) -> None:
    """Raise 403 if current_user has no business seeing this exit record."""
    role = _role(current_user)
    if role in ("admin", "ops_head", "coo", "ceo", "sa"):
        return
    if role == "hrbp":
        # allow if initiated by this user OR the exit's client is visible to this HRBP
        client_ids = hrbp_visible_client_ids(db, current_user.id)
        if record.initiated_by_id != current_user.id and record.client_id not in client_ids:
            raise HTTPException(status_code=403, detail="Access denied")
        return
    if role == "bh":
        client = db.query(HRBPClient).filter_by(id=record.client_id).first()
        if not client or client.bh_id != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied")
        return
    raise HTTPException(status_code=403, detail="Access denied")


def _assert_can_update(db: Session, record: HRBPExitTracking, current_user: User) -> None:
    """Raise 403 if current_user is not allowed to change this exit's status."""
    role = _role(current_user)
    if role in ("admin", "ops_head", "coo", "ceo", "sa"):
        return
    if role == "hrbp":
        client_ids = hrbp_visible_client_ids(db, current_user.id)
        if record.client_id not in client_ids:
            raise HTTPException(status_code=403, detail="You can only update exits for your own consultants")
        return
    # BH can only acknowledge/complete exits for their own clients
    if role == "bh":
        client = db.query(HRBPClient).filter_by(id=record.client_id).first()
        if not client or client.bh_id != current_user.id:
            raise HTTPException(status_code=403, detail="You can only update exits under your clients")
        return
    raise HTTPException(status_code=403, detail="Access denied")


def create(db: Session, payload: ExitCreate, current_user: User) -> dict:
    role = _role(current_user)

    consultant = db.query(HRBPConsultant).filter_by(id=payload.consultant_id).first()
    if not consultant:
        raise HTTPException(status_code=404, detail="Consultant not found")

    # HRBP can only log exits for consultants under their visible clients
    if role == "hrbp":
        client_ids = hrbp_visible_client_ids(db, current_user.id)
        if consultant.client_id not in client_ids:
            raise HTTPException(status_code=403, detail="You can only log exits for your own consultants")

    # Snapshot the monthly PO at the moment of exit initiation
    po_impact = float(consultant.monthly_po) if consultant.monthly_po is not None else None

    record = HRBPExitTracking(
        **payload.model_dump(),
        po_impact=po_impact,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return _enrich(db, record)


def _apply_scope(q, db: Session, current_user: User):
    """Narrow a query to only the records this user is permitted to see."""
    role = _role(current_user)
    if role in ("admin", "ops_head", "coo", "ceo", "sa"):
        return q
    if role == "hrbp":
        # exits for clients visible to this HRBP (multi-HRBP aware)
        client_ids = hrbp_visible_client_ids(db, current_user.id)
        return q.filter(HRBPExitTracking.client_id.in_(client_ids))
    if role == "bh":
        # exits for clients owned by this BH
        bh_client_ids = [
            r.id for r in db.query(HRBPClient.id).filter_by(bh_id=current_user.id).all()
        ]
        return q.filter(HRBPExitTracking.client_id.in_(bh_client_ids))
    return q.filter(False)  # unknown role → no records


def list_paginated(
    db: Session,
    current_user: User,
    page_no: int,
    per_page: int,
    status: str | None = None,
    client_id: int | None = None,
    consultant_id: int | None = None,
    exit_reason: str | None = None,
) -> PageResult:
    q = db.query(HRBPExitTracking)
    q = _apply_scope(q, db, current_user)
    if status:
        q = q.filter(HRBPExitTracking.status == status)
    if client_id is not None:
        q = q.filter(HRBPExitTracking.client_id == client_id)
    if consultant_id is not None:
        q = q.filter(HRBPExitTracking.consultant_id == consultant_id)
    if exit_reason:
        q = q.filter(HRBPExitTracking.exit_reason == exit_reason)
    q = q.order_by(HRBPExitTracking.created_at.desc())
    result = paginate(q, page_no, per_page)
    result.items = [_enrich(db, r) for r in result.items]
    return result


def get_by_id(db: Session, exit_id: int, current_user: User) -> dict:
    record = db.query(HRBPExitTracking).filter_by(id=exit_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Exit record not found")
    _assert_can_view(db, record, current_user)
    return _enrich(db, record)


def update(db: Session, exit_id: int, payload: ExitUpdate, current_user: User) -> dict:
    record = db.query(HRBPExitTracking).filter_by(id=exit_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Exit record not found")

    _assert_can_update(db, record, current_user)

    role = _role(current_user)

    # Status transition rules:
    # initiated → acknowledged: only BH or Admin
    # acknowledged → completed:  only BH or Admin
    # Any → initiated (rollback): only Admin
    new_status = payload.status
    if new_status and new_status != record.status:
        if new_status in ("acknowledged", "completed") and role == "hrbp":
            raise HTTPException(
                status_code=403,
                detail="Only BH or Admin can acknowledge or complete an exit",
            )

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(record, field, value)

    # When completed, deactivate the consultant
    if record.status == "completed":
        consultant = db.query(HRBPConsultant).filter_by(id=record.consultant_id).first()
        if consultant:
            consultant.is_active = False

    db.commit()
    db.refresh(record)
    return _enrich(db, record)


def delete(db: Session, exit_id: int, current_user: User) -> None:
    record = db.query(HRBPExitTracking).filter_by(id=exit_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Exit record not found")
    _assert_can_view(db, record, current_user)
    db.delete(record)
    db.commit()


def get_stats(db: Session, current_user: User) -> dict:
    today         = date.today()
    month_start   = today.replace(day=1)
    quarter_month = ((today.month - 1) // 3) * 3 + 1
    quarter_start = today.replace(month=quarter_month, day=1)

    base = db.query(HRBPExitTracking)
    base = _apply_scope(base, db, current_user)

    total = base.with_entities(func.count(HRBPExitTracking.id)).scalar() or 0

    exits_this_month = (
        base.with_entities(func.count(HRBPExitTracking.id))
        .filter(func.date(HRBPExitTracking.created_at) >= month_start)
        .scalar() or 0
    )

    exits_this_quarter = (
        base.with_entities(func.count(HRBPExitTracking.id))
        .filter(func.date(HRBPExitTracking.created_at) >= quarter_start)
        .scalar() or 0
    )

    total_po_impact = float(
        base.with_entities(func.coalesce(func.sum(HRBPExitTracking.po_impact), 0)).scalar() or 0
    )

    by_status_rows = (
        base.with_entities(HRBPExitTracking.status, func.count(HRBPExitTracking.id))
        .group_by(HRBPExitTracking.status)
        .all()
    )
    by_status = {row[0]: row[1] for row in by_status_rows}

    by_reason_rows = (
        base.with_entities(HRBPExitTracking.exit_reason, func.count(HRBPExitTracking.id))
        .group_by(HRBPExitTracking.exit_reason)
        .all()
    )
    by_reason = {row[0]: row[1] for row in by_reason_rows}

    return {
        "total_exits":        total,
        "exits_this_month":   exits_this_month,
        "exits_this_quarter": exits_this_quarter,
        "total_po_impact":    total_po_impact,
        "by_status":          by_status,
        "by_reason":          by_reason,
    }
