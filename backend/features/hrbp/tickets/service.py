from __future__ import annotations

from datetime import date, datetime, timezone

from fastapi import HTTPException
from core.deps import hrbp_visible_client_ids
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
from sqlalchemy import Text, cast, func, or_, select
from sqlalchemy.orm import Session

from core.pagination import PageResult, paginate
from features.hrbp.tickets.schema import (
    CloseTicketPayload,
    StepReassignPayload,
    StepSlaExtendPayload,
    TicketCommentCreate,
    TicketCreate,
    TicketUpdate,
)
from infra.hrbp_models import HRBPExitTracking, HRBPPoRevision

# SOPs that automatically initiate an exit record for every linked consultant.
_EXIT_TRIGGER_MAP: dict[str, dict] = {
    "SOP-2": {"exit_reason": "resignation",  "exit_type": "voluntary"},
    "SOP-5": {"exit_reason": "termination",  "exit_type": "involuntary"},
    "SOP-6": {"exit_reason": "termination",  "exit_type": "involuntary"},
    "SOP-7": {"exit_reason": "termination",  "exit_type": "involuntary"},
}


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

def _sla_hours_for_role(role: str, steps_definition: list[dict]) -> int | None:
    """Sum sla_working_hours across all SOP steps owned by this role."""
    total = sum(
        s.get("sla_working_hours", 0)
        for s in steps_definition
        if s.get("owner_role") == role
    )
    return total if total > 0 else None


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

    # Embed computed sla_hours per hierarchy step from the SOP steps_definition
    steps_def: list[dict] = sop.steps_definition or []
    hierarchy = [
        {**step.model_dump(), "sla_hours": _sla_hours_for_role(step.role, steps_def)}
        for step in payload.hierarchy_json
    ]

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
        attachments=payload.attachments or [],
        status="open",
        hierarchy_json=hierarchy,
        current_step=1,
        step_started_at=_now(),
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

    # Auto-initiate exit records for exit-triggering SOPs
    exit_meta = _EXIT_TRIGGER_MAP.get(sop.sop_type)
    if exit_meta:
        for consultant in consultants:
            po_impact = float(consultant.monthly_po) if consultant.monthly_po is not None else None
            db.add(HRBPExitTracking(
                consultant_id=consultant.id,
                client_id=ticket.client_id,
                initiated_by_id=raised_by.id,
                exit_reason=exit_meta["exit_reason"],
                exit_type=exit_meta["exit_type"],
                po_impact=po_impact,
                replacement_needed=False,
                source_ticket_id=ticket.id,
            ))
        db.commit()

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
    # - po_finance → tickets they raised OR tickets assigned/added to them (hierarchy_json / escalation_mgr)
    # - ops_head / coo / ceo / admin → all tickets
    role = current_user.role.value
    if role == "hrbp":
        _client_ids = hrbp_visible_client_ids(db, current_user.id)
        q = q.filter(
            or_(
                HRBPTicket.raised_by_id == current_user.id,
                HRBPTicket.escalation_mgr_id == current_user.id,
                cast(HRBPTicket.hierarchy_json, Text).contains(str(current_user.id)),
                HRBPTicket.client_id.in_(_client_ids),
            )
        )
    elif role == "bh":
        bh_client_ids = [r.id for r in db.query(HRBPClient.id).filter_by(bh_id=current_user.id).all()]
        q = q.filter(HRBPTicket.client_id.in_(bh_client_ids))
    elif role == "po_finance":
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
    # Reset per-step SLA clock for the new step
    ticket.step_started_at = _now()
    ticket.step_sla_alerted_at = None
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

def _tenure_left_months(po_end_date) -> int:
    if not po_end_date:
        return 0
    today = date.today()
    end = po_end_date if isinstance(po_end_date, date) else date.fromisoformat(str(po_end_date))
    months = (end.year - today.year) * 12 + (end.month - today.month)
    return max(0, months)


def close_ticket(db: Session, ticket_id: int, payload: CloseTicketPayload, current_user: User) -> dict:
    ticket = db.query(HRBPTicket).filter_by(id=ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if ticket.status == "closed":
        raise HTTPException(status_code=400, detail="Ticket is already closed")
    if ticket.raised_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the ticket creator can close it")

    ticket.status = "closed"
    ticket.po_outcome = payload.po_outcome
    ticket.closed_at = _now()

    log_meta: dict = {}
    if payload.po_outcome:
        log_meta["po_outcome"] = payload.po_outcome

    _log(db, ticket_id, current_user.id, "closed", log_meta)

    # Fetch linked consultants once for side-effects
    consultant_rows = (
        db.execute(
            select(HRBPConsultant).join(
                hrbp_ticket_consultants,
                HRBPConsultant.id == hrbp_ticket_consultants.c.consultant_id,
            ).where(hrbp_ticket_consultants.c.ticket_id == ticket.id)
        ).scalars().all()
    )

    today = date.today()

    if payload.po_outcome == "retained":
        for consultant in consultant_rows:
            old_rate = float(consultant.monthly_po) if consultant.monthly_po is not None else None
            new_rate = float(payload.new_po_monthly) if payload.new_po_monthly is not None else old_rate or 0

            revision = HRBPPoRevision(
                consultant_id   = consultant.id,
                client_id       = ticket.client_id,
                created_by_id   = current_user.id,
                revised_at      = today,
                old_po_rate     = old_rate,
                new_po_rate     = new_rate,
                revision_type   = "po_retained",
                new_po_end_date = payload.new_po_end_date,
                new_margin      = payload.new_margin,
                new_ctc         = payload.new_ctc,
                ticket_id       = ticket.id,
                ticket_number   = ticket.ticket_number,
                status          = "approved",
            )
            db.add(revision)

            # Update consultant live fields with whatever was provided
            if payload.new_po_monthly is not None:
                consultant.monthly_po = payload.new_po_monthly
            if payload.new_po_end_date is not None:
                consultant.po_end_date = payload.new_po_end_date
            if payload.new_margin is not None:
                consultant.margin = payload.new_margin
            if payload.new_ctc is not None:
                consultant.monthly_ctc = payload.new_ctc

    elif payload.po_outcome == "loss" and payload.consultant_exited:
        for consultant in consultant_rows:
            tenure_left = _tenure_left_months(consultant.po_end_date)
            monthly_po = float(consultant.monthly_po) if consultant.monthly_po is not None else 0
            po_impact = monthly_po * tenure_left

            exit_record = HRBPExitTracking(
                consultant_id      = consultant.id,
                client_id          = ticket.client_id,
                initiated_by_id    = current_user.id,
                exit_reason        = payload.exit_reason or "end_of_contract",
                exit_type          = payload.exit_type or "involuntary",
                exit_date          = payload.exit_date,
                po_impact          = po_impact if po_impact > 0 else None,
                status             = "completed",
                replacement_needed = payload.replacement_needed,
                notes              = payload.notes,
                source_ticket_id   = ticket.id,
            )
            db.add(exit_record)

            consultant.is_active = False

    db.commit()
    db.refresh(ticket)
    return _enrich_ticket(db, ticket)


# ── Step SLA extension ───────────────────────────────────────────────────────

_SLA_EXTEND_ROLES = {"admin", "ops_head", "coo", "ceo"}


def _can_manage_step(ticket: HRBPTicket, current_user: User) -> bool:
    """True for creator, escalation manager, and senior roles."""
    role = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
    return (
        current_user.id == ticket.raised_by_id
        or current_user.id == ticket.escalation_mgr_id
        or role in _SLA_EXTEND_ROLES
    )


def extend_step_sla(
    db: Session, ticket_id: int, payload: StepSlaExtendPayload, current_user: User
) -> dict:
    ticket = db.query(HRBPTicket).filter_by(id=ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if ticket.status not in ("open", "escalated"):
        raise HTTPException(status_code=400, detail="Ticket is not open")
    if not _can_manage_step(ticket, current_user):
        raise HTTPException(status_code=403, detail="Not authorised to extend step SLA")

    hierarchy: list[dict] = ticket.hierarchy_json or []
    step_idx = ticket.current_step - 1
    step_label = hierarchy[step_idx].get("label", f"Step {ticket.current_step}") if step_idx < len(hierarchy) else "—"

    ticket.step_sla_extended_until = payload.extend_until
    ticket.step_sla_alerted_at = None      # re-arm so alert fires again if extension also expires
    if ticket.status == "escalated":
        ticket.status = "open"             # un-escalate when SLA is explicitly extended

    _log(db, ticket_id, current_user.id, "step_sla_extended", {
        "step": ticket.current_step,
        "step_label": step_label,
        "extend_until": payload.extend_until.isoformat(),
        "reason": payload.reason,
    })

    db.commit()
    db.refresh(ticket)
    return _enrich_ticket(db, ticket)


# ── Step reassignment ─────────────────────────────────────────────────────────

def reassign_step(
    db: Session, ticket_id: int, payload: StepReassignPayload, current_user: User
) -> dict:
    ticket = db.query(HRBPTicket).filter_by(id=ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if ticket.status not in ("open", "escalated"):
        raise HTTPException(status_code=400, detail="Ticket is not open")
    if not _can_manage_step(ticket, current_user):
        raise HTTPException(status_code=403, detail="Not authorised to reassign step")

    hierarchy: list[dict] = list(ticket.hierarchy_json or [])
    step_idx = ticket.current_step - 1
    if step_idx < 0 or step_idx >= len(hierarchy):
        raise HTTPException(status_code=400, detail="Invalid current step")

    prev_owner = hierarchy[step_idx].get("user_name", "—")
    hierarchy[step_idx]["user_id"]    = payload.user_id
    hierarchy[step_idx]["user_name"]  = payload.user_name
    hierarchy[step_idx]["user_email"] = payload.user_email
    ticket.hierarchy_json = hierarchy

    # Reset the step SLA clock from now for the new owner
    ticket.step_started_at = _now()
    ticket.step_sla_alerted_at = None
    ticket.step_sla_extended_until = None

    _log(db, ticket_id, current_user.id, "step_reassigned", {
        "step": ticket.current_step,
        "step_label": hierarchy[step_idx].get("label", "—"),
        "prev_owner": prev_owner,
        "new_owner": payload.user_name,
        "reason": payload.reason,
    })

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
            if field != "attachments":
                changes[field] = {"from": str(old), "to": str(value)}
            else:
                changes[field] = {"count": len(value or [])}

    if changes:
        _log(db, ticket_id, current_user.id, "updated", changes)

    db.commit()
    db.refresh(ticket)
    return _enrich_ticket(db, ticket)
