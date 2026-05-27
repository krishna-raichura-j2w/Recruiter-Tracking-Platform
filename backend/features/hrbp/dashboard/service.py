from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from sqlalchemy import Text, cast, func, or_
from sqlalchemy.orm import Session

from infra.hrbp_models import (
    HRBPCadenceSchedule,
    HRBPCadenceSession,
    HRBPClient,
    HRBPConsultant,
    HRBPExitTracking,
    HRBPTicket,
    HRBPTicketActivityLog,
    HRBPUserPinnedTicket,
    hrbp_ticket_consultants,
)
from infra.models import User


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _today() -> date:
    return date.today()


# ── RBAC scope helpers ────────────────────────────────────────────────────────

def _ticket_scope(q, current_user: User):
    role = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
    if role in ("hrbp", "bh"):
        q = q.filter(
            or_(
                HRBPTicket.raised_by_id == current_user.id,
                HRBPTicket.escalation_mgr_id == current_user.id,
                cast(HRBPTicket.hierarchy_json, Text).contains(str(current_user.id)),
            )
        )
    # admin / ops_head / coo / ceo / sa → all tickets
    return q


def _cadence_scope(q, current_user: User):
    role = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
    if role == "hrbp":
        q = q.filter(HRBPCadenceSession.schedule_id.in_(
            _cadence_schedule_ids_for_hrbp(q.session, current_user.id)
        ))
    elif role == "bh":
        q = q.filter(HRBPCadenceSession.schedule_id.in_(
            _cadence_schedule_ids_for_bh(q.session, current_user.id)
        ))
    return q


def _cadence_schedule_ids_for_hrbp(db: Session, user_id: int):
    return [r.id for r in db.query(HRBPCadenceSchedule.id).filter_by(hrbp_id=user_id).all()]


def _cadence_schedule_ids_for_bh(db: Session, user_id: int):
    return [r.id for r in db.query(HRBPCadenceSchedule.id).filter_by(bh_id=user_id).all()]


# ── KPI counters ──────────────────────────────────────────────────────────────

def get_kpis(db: Session, current_user: User) -> dict:
    role = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)

    # Base active tickets query — open + escalated (scoped)
    _active = HRBPTicket.status.in_(["open", "escalated"])
    tq = db.query(HRBPTicket).filter(_active)
    tq = _ticket_scope(tq, current_user)

    open_tickets = tq.count()

    sla_breaches = (
        tq.filter(HRBPTicket.sla_deadline < _now()).count()
    )

    po_at_risk_row = (
        db.query(func.coalesce(func.sum(HRBPTicket.po_risk_amount), 0))
        .filter(_active)
    )
    po_at_risk_row = _ticket_scope(po_at_risk_row, current_user)
    po_at_risk = float(po_at_risk_row.scalar() or 0)

    # Cadence overdue: sessions that were scheduled before today and still not_started
    today = _today()
    if role in ("hrbp", "bh"):
        schedule_ids = (
            _cadence_schedule_ids_for_hrbp(db, current_user.id)
            if role == "hrbp"
            else _cadence_schedule_ids_for_bh(db, current_user.id)
        )
        cadence_overdue = (
            db.query(HRBPCadenceSession)
            .filter(
                HRBPCadenceSession.schedule_id.in_(schedule_ids),
                HRBPCadenceSession.status == "not_started",
                HRBPCadenceSession.scheduled_date < today,
            )
            .count()
        )
    else:
        cadence_overdue = (
            db.query(HRBPCadenceSession)
            .filter(
                HRBPCadenceSession.status == "not_started",
                HRBPCadenceSession.scheduled_date < today,
            )
            .count()
        )

    today_date    = _today()
    month_start   = today_date.replace(day=1)
    quarter_month = ((today_date.month - 1) // 3) * 3 + 1
    quarter_start = today_date.replace(month=quarter_month, day=1)

    exits_initiated = (
        db.query(func.count(HRBPExitTracking.id))
        .filter(HRBPExitTracking.status == "initiated")
        .scalar() or 0
    )

    exits_this_month = (
        db.query(func.count(HRBPExitTracking.id))
        .filter(func.date(HRBPExitTracking.created_at) >= month_start)
        .scalar() or 0
    )

    exits_this_quarter = (
        db.query(func.count(HRBPExitTracking.id))
        .filter(func.date(HRBPExitTracking.created_at) >= quarter_start)
        .scalar() or 0
    )

    exits_completed = (
        db.query(func.count(HRBPExitTracking.id))
        .filter(HRBPExitTracking.status == "completed")
        .scalar() or 0
    )

    return {
        "open_tickets":       open_tickets,
        "sla_breaches":       sla_breaches,
        "po_at_risk":         po_at_risk,
        "cadence_overdue":    cadence_overdue,
        "exits_initiated":    exits_initiated,
        "exits_this_month":   exits_this_month,
        "exits_this_quarter": exits_this_quarter,
        "exits_completed":    exits_completed,
    }


# ── My open tickets (mini listing) ───────────────────────────────────────────

def _sla_status(deadline: datetime | None) -> str:
    if not deadline:
        return "none"
    now = _now()
    if deadline.tzinfo is None:
        deadline = deadline.replace(tzinfo=timezone.utc)
    diff = (deadline - now).total_seconds()
    if diff < 0:
        return "breached"
    if diff < 24 * 3600:
        return "warning"
    return "ok"


def get_my_tickets(db: Session, current_user: User, limit: int = 5) -> list[dict]:
    q = db.query(HRBPTicket).filter(HRBPTicket.status.in_(["open", "escalated"]))
    q = _ticket_scope(q, current_user)
    q = q.order_by(HRBPTicket.created_at.desc()).limit(limit)
    tickets = q.all()

    result = []
    for t in tickets:
        client = db.query(HRBPClient).filter_by(id=t.client_id).first()
        result.append({
            "id":             t.id,
            "ticket_number":  t.ticket_number,
            "title":          t.title,
            "sop_type":       None,  # enriched below if sop_id set
            "client_name":    client.name if client else None,
            "sla_deadline":   t.sla_deadline.isoformat() if t.sla_deadline else None,
            "sla_status":     _sla_status(t.sla_deadline),
            "status":         t.status,
            "priority":       t.priority,
            "current_step":   t.current_step,
        })
    return result


# ── Today's cadence ───────────────────────────────────────────────────────────

def get_today_cadence(db: Session, current_user: User) -> list[dict]:
    role = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
    today = _today()

    sessions_q = (
        db.query(HRBPCadenceSession)
        .filter(
            HRBPCadenceSession.scheduled_date == today,
            HRBPCadenceSession.status.in_(["not_started", "in_progress"]),
        )
    )

    if role == "hrbp":
        ids = _cadence_schedule_ids_for_hrbp(db, current_user.id)
        sessions_q = sessions_q.filter(HRBPCadenceSession.schedule_id.in_(ids))
    elif role == "bh":
        ids = _cadence_schedule_ids_for_bh(db, current_user.id)
        sessions_q = sessions_q.filter(HRBPCadenceSession.schedule_id.in_(ids))

    sessions = sessions_q.order_by(HRBPCadenceSession.cadence_number).all()

    result = []
    for s in sessions:
        schedule = db.query(HRBPCadenceSchedule).filter_by(id=s.schedule_id).first()
        if not schedule:
            continue
        consultant = db.query(HRBPConsultant).filter_by(id=schedule.consultant_id).first()
        client = db.query(HRBPClient).filter_by(id=schedule.client_id).first()

        initials = ""
        if consultant:
            parts = consultant.name.split()
            initials = "".join(p[0].upper() for p in parts[:2])

        result.append({
            "id":               s.id,
            "schedule_id":      s.schedule_id,
            "cadence_number":   s.cadence_number,
            "consultant_name":  consultant.name if consultant else None,
            "consultant_initials": initials,
            "consultant_email": consultant.email if consultant else None,
            "consultant_phone": consultant.phone if consultant else None,
            "client_name":      client.name if client else None,
            "meeting_type":     schedule.meeting_type,
            "meeting_time":     str(schedule.meeting_time) if schedule.meeting_time else None,
            "project_name":     schedule.project_name,
            "status":           s.status,
            "scheduled_date":   str(s.scheduled_date),
        })
    return result


# ── Pinned ticket ─────────────────────────────────────────────────────────────

def _enrich_pinned(db: Session, ticket: HRBPTicket) -> dict:
    from features.hrbp.tickets.service import _enrich_ticket
    d = _enrich_ticket(db, ticket)
    return d


def get_pinned_ticket(db: Session, current_user: User) -> dict | None:
    pin = db.query(HRBPUserPinnedTicket).filter_by(user_id=current_user.id).first()
    if not pin:
        return None
    ticket = db.query(HRBPTicket).filter_by(id=pin.ticket_id).first()
    if not ticket:
        db.delete(pin)
        db.commit()
        return None
    return _enrich_pinned(db, ticket)


def pin_ticket(db: Session, current_user: User, ticket_id: int) -> dict:
    ticket = db.query(HRBPTicket).filter_by(id=ticket_id).first()
    if not ticket:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Ticket not found")

    existing = db.query(HRBPUserPinnedTicket).filter_by(user_id=current_user.id).first()
    if existing:
        existing.ticket_id = ticket_id
    else:
        db.add(HRBPUserPinnedTicket(user_id=current_user.id, ticket_id=ticket_id))
    db.commit()
    return {"pinned": True, "ticket_id": ticket_id}


def unpin_ticket(db: Session, current_user: User) -> dict:
    pin = db.query(HRBPUserPinnedTicket).filter_by(user_id=current_user.id).first()
    if pin:
        db.delete(pin)
        db.commit()
    return {"pinned": False}


# ── Consultants at risk ───────────────────────────────────────────────────────

def get_consultants_at_risk(db: Session, current_user: User, limit: int = 8) -> list[dict]:
    role = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
    today = _today()
    cutoff = today + timedelta(days=60)

    q = db.query(HRBPConsultant).filter(
        HRBPConsultant.is_active.is_(True),
        or_(
            HRBPConsultant.po_risk > 0,
            HRBPConsultant.po_end_date <= cutoff,
        ),
    )

    if role == "hrbp":
        q = q.filter(HRBPConsultant.hrbp_id == current_user.id)
    elif role == "bh":
        bh_client_ids = [
            r.id for r in db.query(HRBPClient.id).filter_by(bh_id=current_user.id).all()
        ]
        q = q.filter(HRBPConsultant.client_id.in_(bh_client_ids))

    consultants = q.order_by(HRBPConsultant.po_risk.desc().nullslast()).limit(limit).all()

    result = []
    for c in consultants:
        client = db.query(HRBPClient).filter_by(id=c.client_id).first()
        days_left: int | None = None
        if c.po_end_date:
            days_left = (c.po_end_date - today).days
        result.append({
            "id":              c.id,
            "name":            c.name,
            "client_name":     client.name if client else None,
            "po_end_date":     c.po_end_date.isoformat() if c.po_end_date else None,
            "po_risk":         float(c.po_risk) if c.po_risk is not None else 0.0,
            "monthly_po":      float(c.monthly_po) if c.monthly_po is not None else 0.0,
            "days_until_expiry": days_left,
        })
    return result


# ── Recent activity feed ──────────────────────────────────────────────────────

def get_recent_activity(db: Session, current_user: User, limit: int = 10) -> list[dict]:
    role = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)

    q = db.query(HRBPTicketActivityLog).join(
        HRBPTicket, HRBPTicket.id == HRBPTicketActivityLog.ticket_id
    )

    if role in ("hrbp", "bh"):
        q = q.filter(
            or_(
                HRBPTicket.raised_by_id == current_user.id,
                HRBPTicket.escalation_mgr_id == current_user.id,
                cast(HRBPTicket.hierarchy_json, Text).contains(str(current_user.id)),
            )
        )

    logs = q.order_by(HRBPTicketActivityLog.created_at.desc()).limit(limit).all()

    result = []
    for log in logs:
        ticket = db.query(HRBPTicket).filter_by(id=log.ticket_id).first()
        actor = db.query(User).filter_by(id=log.actor_id).first() if log.actor_id else None
        result.append({
            "id":             log.id,
            "ticket_id":      log.ticket_id,
            "ticket_number":  ticket.ticket_number if ticket else None,
            "actor_name":     actor.name if actor else "System",
            "action":         log.action,
            "meta_data":      log.meta_data or {},
            "created_at":     log.created_at.isoformat() if log.created_at else None,
        })
    return result
