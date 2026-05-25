from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException
from infra.hrbp_models import (
    HRBPClient,
    HRBPConsultant,
    HRBPSopDefinition,
    HRBPTicket,
    HRBPTicketActivityLog,
    HRBPTicketComment,
    hrbp_ticket_consultants,
)
from infra.models import User
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from core.pagination import PageResult, paginate
from features.hrbp.tickets.schema import (
    TicketCommentCreate,
    TicketCreate,
    TicketUpdate,
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ── Ticket number generation ─────────────────────────────────────────────────

def _next_ticket_number(db: Session) -> str:
    seq_val = db.execute(select(func.nextval("hrbp_ticket_seq"))).scalar()
    year = datetime.now().year
    return f"TKT-{year}-{str(seq_val).zfill(4)}"


# ── User lookup helpers ──────────────────────────────────────────────────────

def _user_name(db: Session, user_id: int | None) -> str | None:
    if not user_id:
        return None
    u = db.query(User).filter_by(id=user_id).first()
    return u.name if u else None


def _enrich_ticket(db: Session, ticket: HRBPTicket) -> dict:
    d = {c.name: getattr(ticket, c.name) for c in ticket.__table__.columns}

    # raised_by
    d["raised_by_name"] = _user_name(db, ticket.raised_by_id)

    # escalation_mgr
    d["escalation_mgr_name"] = _user_name(db, ticket.escalation_mgr_id)

    # client
    client = db.query(HRBPClient).filter_by(id=ticket.client_id).first()
    d["client_name"] = client.name if client else None

    # sop
    if ticket.sop_id:
        sop = db.query(HRBPSopDefinition).filter_by(id=ticket.sop_id).first()
        d["sop_name"] = sop.name if sop else None
        d["sop_type"] = sop.sop_type if sop else None
    else:
        d["sop_name"] = None
        d["sop_type"] = None

    # linked consultants
    rows = (
        db.execute(
            select(HRBPConsultant).join(
                hrbp_ticket_consultants,
                HRBPConsultant.id == hrbp_ticket_consultants.c.consultant_id,
            ).where(hrbp_ticket_consultants.c.ticket_id == ticket.id)
        ).scalars().all()
    )
    d["consultants"] = [
        {
            "id": c.id,
            "name": c.name,
            "emp_id": c.emp_id,
            "cohort": c.cohort,
            "monthly_po": float(c.monthly_po) if c.monthly_po else None,
            "po_end_date": str(c.po_end_date) if c.po_end_date else None,
            "join_date": str(c.join_date) if c.join_date else None,
            "po_risk": float(c.po_risk) if c.po_risk else None,
        }
        for c in rows
    ]

    # comments
    comments = (
        db.query(HRBPTicketComment)
        .filter_by(ticket_id=ticket.id)
        .order_by(HRBPTicketComment.created_at)
        .all()
    )
    d["comments"] = []
    for cm in comments:
        cd = {col.name: getattr(cm, col.name) for col in cm.__table__.columns}
        cd["author_name"] = _user_name(db, cm.author_id)
        d["comments"].append(cd)

    # activity log
    logs = (
        db.query(HRBPTicketActivityLog)
        .filter_by(ticket_id=ticket.id)
        .order_by(HRBPTicketActivityLog.created_at)
        .all()
    )
    d["activity_log"] = []
    for lg in logs:
        ld = {col.name: getattr(lg, col.name) for col in lg.__table__.columns}
        # col.name is "metadata" (DB column name), but ORM attr is meta_data
        ld["metadata"] = lg.meta_data
        ld["actor_name"] = _user_name(db, lg.actor_id)
        d["activity_log"].append(ld)

    return d


def _log(db: Session, ticket_id: int, actor_id: int | None, action: str, metadata: dict | None = None):
    db.add(HRBPTicketActivityLog(
        ticket_id=ticket_id,
        actor_id=actor_id,
        action=action,
        meta_data=metadata or {},
    ))


# ── Create ───────────────────────────────────────────────────────────────────

def create(db: Session, payload: TicketCreate, raised_by: User) -> dict:
    # Resolve SOP name for the title
    sop = db.query(HRBPSopDefinition).filter_by(id=payload.sop_id).first()
    if not sop:
        raise HTTPException(status_code=404, detail="SOP not found")

    # Build a human title from the consultant names
    consultants = (
        db.query(HRBPConsultant)
        .filter(HRBPConsultant.id.in_(payload.consultant_ids))
        .all()
    )
    if not consultants:
        raise HTTPException(status_code=400, detail="At least one valid consultant is required")

    names = ", ".join(c.name for c in consultants[:3])
    if len(consultants) > 3:
        names += f" +{len(consultants) - 3}"
    title = f"{sop.name} — {names}"

    hierarchy = [step.model_dump() for step in payload.hierarchy_json]

    ticket = HRBPTicket(
        ticket_number=_next_ticket_number(db),
        title=title,
        raised_by_id=raised_by.id,
        escalation_mgr_id=payload.escalation_mgr_id,
        client_id=payload.client_id,
        sop_id=payload.sop_id,
        priority=payload.priority,
        sla_deadline=payload.sla_deadline,
        description=payload.description,
        po_risk_amount=payload.po_risk_amount,
        status="open",
        hierarchy_json=hierarchy,
        current_step=1,
    )
    db.add(ticket)
    db.flush()  # get ticket.id before inserting associations

    # Link consultants
    for c in consultants:
        db.execute(
            hrbp_ticket_consultants.insert().values(
                ticket_id=ticket.id,
                consultant_id=c.id,
            )
        )

    _log(db, ticket.id, raised_by.id, "created", {
        "sop": sop.sop_type,
        "priority": payload.priority,
        "consultant_ids": payload.consultant_ids,
    })

    db.commit()
    db.refresh(ticket)
    return _enrich_ticket(db, ticket)


# ── List (paginated, filterable) ─────────────────────────────────────────────

def list_paginated(
    db: Session,
    current_user: User,
    page_no: int,
    per_page: int,
    status: str | None,
    priority: str | None,
    client_id: int | None,
    sop_id: int | None,
    search: str | None,
) -> PageResult:
    q = db.query(HRBPTicket)

    # Role-based visibility:
    # - hrbp/bh → tickets they raised OR tickets where their user_id appears in hierarchy_json
    # - ops_head / coo / priti / admin → all tickets
    role = current_user.role.value
    if role in ("hrbp", "bh"):
        # Tickets raised by me, OR I appear as a step owner in the hierarchy
        from sqlalchemy import Text, cast, or_
        q = q.filter(
            or_(
                HRBPTicket.raised_by_id == current_user.id,
                HRBPTicket.escalation_mgr_id == current_user.id,
                cast(HRBPTicket.hierarchy_json, Text).contains(str(current_user.id)),
            )
        )

    if status:
        q = q.filter(HRBPTicket.status == status)
    if priority:
        q = q.filter(HRBPTicket.priority == priority)
    if client_id:
        q = q.filter(HRBPTicket.client_id == client_id)
    if sop_id:
        q = q.filter(HRBPTicket.sop_id == sop_id)
    if search:
        q = q.filter(HRBPTicket.ticket_number.ilike(f"%{search}%"))

    q = q.order_by(HRBPTicket.created_at.desc())
    result = paginate(q, page_no, per_page)

    # Enrich each item with names (lightweight — no comments/logs for list view)
    enriched = []
    for t in result.items:
        d = {c.name: getattr(t, c.name) for c in t.__table__.columns}
        d["raised_by_name"] = _user_name(db, t.raised_by_id)
        d["escalation_mgr_name"] = _user_name(db, t.escalation_mgr_id)
        client = db.query(HRBPClient).filter_by(id=t.client_id).first()
        d["client_name"] = client.name if client else None
        if t.sop_id:
            sop = db.query(HRBPSopDefinition).filter_by(id=t.sop_id).first()
            d["sop_name"] = sop.name if sop else None
            d["sop_type"] = sop.sop_type if sop else None
        else:
            d["sop_name"] = None
            d["sop_type"] = None
        # consultant count only for list
        count = db.execute(
            select(func.count()).select_from(hrbp_ticket_consultants)
            .where(hrbp_ticket_consultants.c.ticket_id == t.id)
        ).scalar()
        d["consultant_count"] = count
        d["consultants"] = []
        d["comments"] = []
        d["activity_log"] = []
        enriched.append(d)

    result.items = enriched
    return result


# ── Get by ID ────────────────────────────────────────────────────────────────

def get_by_id(db: Session, ticket_id: int) -> dict:
    ticket = db.query(HRBPTicket).filter_by(id=ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return _enrich_ticket(db, ticket)


# ── Add comment (optionally advance step) ────────────────────────────────────

def add_comment(
    db: Session,
    ticket_id: int,
    payload: TicketCommentCreate,
    current_user: User,
) -> dict:
    ticket = db.query(HRBPTicket).filter_by(id=ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if ticket.status == "closed":
        raise HTTPException(status_code=400, detail="Cannot comment on a closed ticket")

    comment = HRBPTicketComment(
        ticket_id=ticket_id,
        author_id=current_user.id,
        hierarchy_step=ticket.current_step,
        content=payload.content,
        is_resolution=payload.is_resolution,
    )
    db.add(comment)

    _log(db, ticket_id, current_user.id, "commented", {
        "step": ticket.current_step,
        "is_resolution": payload.is_resolution,
    })

    if payload.is_resolution:
        _advance_step(db, ticket, current_user)

    db.commit()
    db.refresh(ticket)
    return _enrich_ticket(db, ticket)


# ── Advance step ─────────────────────────────────────────────────────────────

def _advance_step(db: Session, ticket: HRBPTicket, actor: User):
    hierarchy: list[dict] = ticket.hierarchy_json or []
    step_idx = ticket.current_step - 1  # 0-based

    # Mark current step as resolved in the hierarchy snapshot
    if step_idx < len(hierarchy):
        hierarchy[step_idx]["resolved_at"] = _now().isoformat()
        hierarchy[step_idx]["resolved_by_id"] = actor.id
        hierarchy[step_idx]["resolved_by_name"] = actor.name
        ticket.hierarchy_json = hierarchy

    ticket.current_step += 1
    _log(db, ticket.id, actor.id, "step_advanced", {
        "from_step": ticket.current_step - 1,
        "to_step": ticket.current_step,
    })


def advance_step(db: Session, ticket_id: int, current_user: User) -> dict:
    ticket = db.query(HRBPTicket).filter_by(id=ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if ticket.status == "closed":
        raise HTTPException(status_code=400, detail="Ticket is already closed")

    _advance_step(db, ticket, current_user)
    db.commit()
    db.refresh(ticket)
    return _enrich_ticket(db, ticket)


# ── Close ────────────────────────────────────────────────────────────────────

def close_ticket(db: Session, ticket_id: int, current_user: User) -> dict:
    ticket = db.query(HRBPTicket).filter_by(id=ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if ticket.status == "closed":
        raise HTTPException(status_code=400, detail="Ticket is already closed")
    if ticket.raised_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the ticket creator can close it")

    ticket.status = "closed"
    ticket.closed_at = _now()
    _log(db, ticket_id, current_user.id, "closed", {})
    db.commit()
    db.refresh(ticket)
    return _enrich_ticket(db, ticket)


# ── Update (creator only) ─────────────────────────────────────────────────────

def update_ticket(db: Session, ticket_id: int, payload: TicketUpdate, current_user: User) -> dict:
    ticket = db.query(HRBPTicket).filter_by(id=ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if ticket.raised_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the ticket creator can update it")
    if ticket.status == "closed":
        raise HTTPException(status_code=400, detail="Cannot update a closed ticket")

    changes: dict = {}
    for field, value in payload.model_dump(exclude_unset=True).items():
        old = getattr(ticket, field)
        if old != value:
            setattr(ticket, field, value)
            changes[field] = {"from": str(old), "to": str(value)}

    if changes:
        _log(db, ticket_id, current_user.id, "updated", changes)

    db.commit()
    db.refresh(ticket)
    return _enrich_ticket(db, ticket)
