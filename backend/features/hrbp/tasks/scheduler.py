"""
HRBP scheduler — three periodic jobs:

1. check_sla_breaches (every minute):
   Ticket-level: bump priority + escalate when overall SLA deadline passes.

2. check_step_sla_breaches (every minute):
   Per-step: alert step owner + escalation manager when a step's SLA hours expire.

3. check_contract_closures (daily at 08:00 UTC):
   Auto-create a SOP-3 (Contract Closure and Redeployment) ticket for every
   active consultant whose po_end_date is exactly 4 calendar months away.
   Dedup guard: skips if an open SOP-3 ticket already exists for that consultant.
"""

import logging
from datetime import date, datetime, timedelta, timezone

from apscheduler.schedulers.background import BackgroundScheduler
from core.database import SessionLocal
from core.email import send_outlook_email as send_email
from dateutil.relativedelta import relativedelta
from infra.hrbp_models import (
    HRBPClient,
    HRBPConsultant,
    HRBPEmailTemplate,
    HRBPSopDefinition,
    HRBPTicket,
    HRBPTicketActivityLog,
    hrbp_ticket_consultants,
)
from infra.models import User
from sqlalchemy import func, select, text

from features.hrbp.notifications.service import push

log = logging.getLogger(__name__)

# Must differ from the MRR scheduler lock key (3133731337).
_SCHED_LOCK_KEY = 4244842448

_PRIORITY_BUMP = {
    "low":      "medium",
    "medium":   "high",
    "high":     "critical",
    "critical": "critical",
}

_scheduler: BackgroundScheduler | None = None


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _user(db, user_id: int | None) -> User | None:
    if not user_id:
        return None
    return db.query(User).filter_by(id=user_id).first()


def _render(template: str, **ctx: str) -> str:
    """Replace {{var}} placeholders in a template string."""
    for key, val in ctx.items():
        template = template.replace(f"{{{{{key}}}}}", val or "—")
    return template


# ── Ticket-level breach ───────────────────────────────────────────────────────

def _ticket_breach_email_html(ticket: HRBPTicket, new_priority: str) -> str:
    return f"""
<html><body style="font-family:Arial,sans-serif;color:#1a1a1a;max-width:600px;margin:auto;padding:24px">
<div style="background:#dc2626;border-radius:8px 8px 0 0;padding:16px 24px">
  <h2 style="color:#fff;margin:0;font-size:18px">&#9888; SLA Breached — {ticket.ticket_number}</h2>
</div>
<div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;padding:24px">
  <p><strong>Ticket:</strong> {ticket.title}</p>
  <p><strong>Priority escalated to:</strong> <span style="color:#dc2626">{new_priority.upper()}</span></p>
  <p><strong>SLA Deadline:</strong> {ticket.sla_deadline.strftime("%d %b %Y, %H:%M UTC") if ticket.sla_deadline else "—"}</p>
  <p>The ticket status has been changed to <strong>Escalated</strong>. Please take immediate action.</p>
  <p style="color:#6b7280;font-size:12px">Automated alert — J2W HRBP Ticket System.</p>
</div>
</body></html>
"""


def check_sla_breaches():
    db = SessionLocal()
    try:
        acquired = db.execute(
            text("SELECT pg_try_advisory_xact_lock(:k)"),
            {"k": _SCHED_LOCK_KEY},
        ).scalar()
        if not acquired:
            return

        now = _now()

        tickets = (
            db.query(HRBPTicket)
            .filter(
                HRBPTicket.status == "open",
                HRBPTicket.sla_deadline.isnot(None),
                HRBPTicket.sla_deadline < now,
                HRBPTicket.sla_alerted_at.is_(None),
            )
            .all()
        )

        for ticket in tickets:
            new_priority = _PRIORITY_BUMP.get(ticket.priority, ticket.priority)

            ticket.status = "escalated"
            ticket.priority = new_priority
            ticket.sla_alerted_at = now

            db.add(HRBPTicketActivityLog(
                ticket_id=ticket.id,
                actor_id=None,
                action="sla_breached",
                meta_data={
                    "previous_priority": ticket.priority,
                    "new_priority": new_priority,
                    "sla_deadline": ticket.sla_deadline.isoformat() if ticket.sla_deadline else None,
                },
            ))

            notif_title = f"SLA Breached — {ticket.ticket_number}"
            notif_msg = (
                f"SLA breached for ticket {ticket.ticket_number} — "
                f"{ticket.title}. Status escalated, priority bumped to {new_priority}."
            )

            recipient_ids = {ticket.raised_by_id}
            if ticket.escalation_mgr_id:
                recipient_ids.add(ticket.escalation_mgr_id)

            email_addresses: list[str] = []
            for uid in recipient_ids:
                push(db, user_id=uid, title=notif_title, message=notif_msg,
                     notif_type="sla_breach", ticket_id=ticket.id)
                u = _user(db, uid)
                if u and u.email:
                    email_addresses.append(u.email)

            send_email(
                email_addresses,
                f"[ACTION REQUIRED] SLA Breached — {ticket.ticket_number}",
                _ticket_breach_email_html(ticket, new_priority),
            )
            log.info("Ticket SLA breach processed: %s (priority→%s)", ticket.ticket_number, new_priority)

        db.commit()

    except Exception as exc:
        log.error("HRBP ticket SLA scheduler error: %s", exc)
        db.rollback()
    finally:
        db.close()


# ── Per-step SLA breach ───────────────────────────────────────────────────────

def check_step_sla_breaches():
    db = SessionLocal()
    try:
        acquired = db.execute(
            text("SELECT pg_try_advisory_xact_lock(:k)"),
            {"k": _SCHED_LOCK_KEY + 1},   # different lock key from ticket-level check
        ).scalar()
        if not acquired:
            return

        now = _now()

        # Only open tickets that have a step clock running and haven't been alerted yet
        tickets = (
            db.query(HRBPTicket)
            .filter(
                HRBPTicket.status == "open",
                HRBPTicket.step_started_at.isnot(None),
                HRBPTicket.step_sla_alerted_at.is_(None),
            )
            .all()
        )

        # Fetch templates once
        est1 = db.query(HRBPEmailTemplate).filter_by(id="EST1").first()
        est2 = db.query(HRBPEmailTemplate).filter_by(id="EST2").first()

        for ticket in tickets:
            hierarchy: list[dict] = ticket.hierarchy_json or []
            step_idx = ticket.current_step - 1

            if step_idx < 0 or step_idx >= len(hierarchy):
                continue

            current_step = hierarchy[step_idx]
            sla_hours: int | None = current_step.get("sla_hours")

            if not sla_hours:
                continue  # no SLA defined for this step — skip

            step_started = _as_utc(ticket.step_started_at)
            calculated_deadline = step_started + timedelta(hours=sla_hours)

            # Honour explicit extension: if an admin/manager pushed the deadline out, skip
            if ticket.step_sla_extended_until:
                extended_until = _as_utc(ticket.step_sla_extended_until)
                if now < extended_until:
                    continue  # still within the granted extension

            if now < calculated_deadline:
                continue  # still within original SLA window

            # ── Step SLA breached ─────────────────────────────────────────────

            step_label     = current_step.get("label", f"Step {ticket.current_step}")
            step_owner_id  = current_step.get("user_id")
            step_owner_name = current_step.get("user_name") or "Step Owner"
            step_started_fmt = step_started.strftime("%d %b %Y, %H:%M UTC")

            escalation_mgr = _user(db, ticket.escalation_mgr_id)
            escalation_mgr_name = escalation_mgr.name if escalation_mgr else "Escalation Manager"

            ticket.step_sla_alerted_at = now

            db.add(HRBPTicketActivityLog(
                ticket_id=ticket.id,
                actor_id=None,
                action="step_sla_breached",
                meta_data={
                    "step": ticket.current_step,
                    "step_label": step_label,
                    "step_owner_id": step_owner_id,
                    "step_owner_name": step_owner_name,
                    "sla_hours": sla_hours,
                    "step_started_at": step_started.isoformat(),
                },
            ))

            ctx = dict(
                ticket_number=ticket.ticket_number,
                ticket_title=ticket.title,
                step_label=step_label,
                sla_hours=str(sla_hours),
                step_owner_name=step_owner_name,
                step_started_at=step_started_fmt,
                escalation_mgr_name=escalation_mgr_name,
            )

            # ── In-app: step owner ────────────────────────────────────────────
            if step_owner_id:
                push(
                    db,
                    user_id=step_owner_id,
                    title=f"Action Required — Step SLA Breached ({ticket.ticket_number})",
                    message=(
                        f"Your step '{step_label}' on ticket {ticket.ticket_number} "
                        f"has exceeded its {sla_hours}h SLA window. Please act immediately."
                    ),
                    notif_type="step_sla_breach",
                    ticket_id=ticket.id,
                )

            # ── In-app: escalation manager ────────────────────────────────────
            if ticket.escalation_mgr_id:
                push(
                    db,
                    user_id=ticket.escalation_mgr_id,
                    title=f"Escalation — Step SLA Breached ({ticket.ticket_number})",
                    message=(
                        f"Step '{step_label}' owned by {step_owner_name} on ticket "
                        f"{ticket.ticket_number} has breached its {sla_hours}h SLA window."
                    ),
                    notif_type="step_sla_breach",
                    ticket_id=ticket.id,
                )

            # ── Email: step owner (EST1) ──────────────────────────────────────
            step_owner_user = _user(db, step_owner_id)
            if step_owner_user and step_owner_user.email and est1:
                subject = _render(est1.subject_tpl, **ctx)
                body    = _render(est1.body_tpl,    **ctx)
                send_email([step_owner_user.email], subject, body)

            # ── Email: escalation manager (EST2) ──────────────────────────────
            if escalation_mgr and escalation_mgr.email and est2:
                subject = _render(est2.subject_tpl, **ctx)
                body    = _render(est2.body_tpl,    **ctx)
                send_email([escalation_mgr.email], subject, body)

            log.info(
                "Step SLA breach processed: %s step=%s owner=%s sla=%sh",
                ticket.ticket_number, ticket.current_step, step_owner_name, sla_hours,
            )

        db.commit()

    except Exception as exc:
        log.error("HRBP step SLA scheduler error: %s", exc)
        db.rollback()
    finally:
        db.close()


# ── Contract closure auto-ticket ─────────────────────────────────────────────

_CONTRACT_CLOSURE_LOCK_KEY = 4244842450   # unique — must not clash with other locks


def _sla_hours_for_role(role: str, steps_def: list[dict]) -> int | None:
    total = sum(s.get("sla_working_hours", 0) for s in steps_def if s.get("owner_role") == role)
    return total if total > 0 else None


def _next_ticket_number_raw(db) -> str:
    seq_val = db.execute(select(func.nextval("hrbp_ticket_seq"))).scalar()
    year = datetime.now().year
    return f"TKT-{year}-{str(seq_val).zfill(4)}"


def _contract_closure_email_html(consultant_name: str, po_end_date: date, ticket_number: str) -> str:
    return f"""
<html><body style="font-family:Arial,sans-serif;color:#1a1a1a;max-width:600px;margin:auto;padding:24px">
<div style="background:#0369a1;border-radius:8px 8px 0 0;padding:16px 24px">
  <h2 style="color:#fff;margin:0;font-size:18px">&#128197; Contract Closure Flagged — {ticket_number}</h2>
</div>
<div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;padding:24px">
  <p><strong>Consultant:</strong> {consultant_name}</p>
  <p><strong>PO End Date:</strong> {po_end_date.strftime("%d %b %Y")}</p>
  <p>A <strong>SOP-3: Contract Closure and Redeployment</strong> ticket has been automatically
     created 4 months before the PO end date.</p>
  <p>Please initiate the renewal conversation with the client and begin redeployment planning now.</p>
  <p style="color:#6b7280;font-size:12px">Automated alert — J2W HRBP Ticket System.</p>
</div>
</body></html>
"""


def check_contract_closures():
    """
    Runs daily. Creates SOP-3 tickets for consultants whose po_end_date falls
    within the next 4 calendar months (inclusive). Using a rolling window instead
    of an exact-date match ensures no consultant is missed if the server was down
    on the day their 4-month trigger would have fired.
    Dedup guard: skips if a non-closed SOP-3 ticket already exists for that consultant.
    """
    db = SessionLocal()
    try:
        acquired = db.execute(
            text("SELECT pg_try_advisory_xact_lock(:k)"),
            {"k": _CONTRACT_CLOSURE_LOCK_KEY},
        ).scalar()
        if not acquired:
            return

        today = date.today()
        window_end = today + relativedelta(months=4)

        sop = db.query(HRBPSopDefinition).filter_by(sop_type="SOP-3").first()
        if not sop:
            log.error("SOP-3 definition not found — contract closure job skipped.")
            return

        steps_def: list[dict] = sop.steps_definition or []
        persons_hierarchy: list[dict] = sop.persons_hierarchy or []

        consultants = (
            db.query(HRBPConsultant)
            .filter(
                HRBPConsultant.is_active == True,
                HRBPConsultant.po_end_date >= today,
                HRBPConsultant.po_end_date <= window_end,
            )
            .all()
        )

        for consultant in consultants:
            # Dedup: skip if a non-closed SOP-3 ticket already exists for this consultant
            existing_count = db.execute(
                select(func.count())
                .select_from(HRBPTicket)
                .join(
                    hrbp_ticket_consultants,
                    HRBPTicket.id == hrbp_ticket_consultants.c.ticket_id,
                )
                .where(
                    hrbp_ticket_consultants.c.consultant_id == consultant.id,
                    HRBPTicket.sop_id == sop.id,
                    HRBPTicket.status != "closed",
                )
            ).scalar()
            if existing_count:
                log.info(
                    "Contract closure: skipping %s — open SOP-3 ticket exists.",
                    consultant.name,
                )
                continue

            # Resolve role → user for hierarchy population
            hrbp_user = db.query(User).filter_by(id=consultant.hrbp_id).first()
            client    = db.query(HRBPClient).filter_by(id=consultant.client_id).first()
            bh_user   = db.query(User).filter_by(id=client.bh_id).first() if client else None
            ops_head  = db.query(User).filter(User.role == "ops_head").first()
            coo_user  = db.query(User).filter(User.role == "coo").first()

            role_user_map = {
                "hrbp":     hrbp_user,
                "bh":       bh_user,
                "ops_head": ops_head,
                "coo":      coo_user,
            }

            hierarchy = [
                {
                    **step,
                    "user_id":          role_user_map.get(step["role"]) and role_user_map[step["role"]].id,
                    "user_name":        role_user_map.get(step["role"]) and role_user_map[step["role"]].name,
                    "user_email":       role_user_map.get(step["role"]) and role_user_map[step["role"]].email,
                    "sla_hours":        _sla_hours_for_role(step["role"], steps_def),
                    "resolved_at":      None,
                    "resolved_by_id":   None,
                    "resolved_by_name": None,
                }
                for step in persons_hierarchy
            ]

            po_impact = float(consultant.monthly_po) if consultant.monthly_po else None
            sla_dt    = datetime.combine(consultant.po_end_date, datetime.min.time()).replace(tzinfo=timezone.utc)

            ticket = HRBPTicket(
                ticket_number  = _next_ticket_number_raw(db),
                title          = f"SOP-3: Contract Closure — {consultant.name}",
                raised_by_id   = consultant.hrbp_id,
                escalation_mgr_id = client.bh_id if client else None,
                client_id      = consultant.client_id,
                sop_id         = sop.id,
                priority       = "high",
                sla_deadline   = sla_dt,
                po_risk_amount = po_impact,
                description    = (
                    f"Auto-generated by the contract closure scheduler.\n"
                    f"PO end date: {consultant.po_end_date.strftime('%d %b %Y')}. "
                    f"4-month flag triggered on {today.strftime('%d %b %Y')}."
                ),
                status         = "open",
                hierarchy_json = hierarchy,
                current_step   = 1,
                step_started_at = _now(),
                attachments    = [],
            )
            db.add(ticket)
            db.flush()

            db.execute(
                hrbp_ticket_consultants.insert().values(
                    ticket_id=ticket.id,
                    consultant_id=consultant.id,
                )
            )

            db.add(HRBPTicketActivityLog(
                ticket_id=ticket.id,
                actor_id=None,
                action="auto_created",
                meta_data={
                    "trigger":       "contract_closure_4m",
                    "po_end_date":   consultant.po_end_date.isoformat(),
                    "triggered_on":  today.isoformat(),
                },
            ))

            db.commit()
            db.refresh(ticket)

            # Notify HRBP
            if hrbp_user:
                push(
                    db,
                    user_id=hrbp_user.id,
                    title=f"Contract Closure Flagged — {consultant.name}",
                    message=(
                        f"SOP-3 ticket {ticket.ticket_number} auto-created. "
                        f"{consultant.name}'s PO ends {consultant.po_end_date.strftime('%d %b %Y')}. "
                        f"Initiate renewal with client."
                    ),
                    notif_type="contract_closure",
                    ticket_id=ticket.id,
                )
                if hrbp_user.email:
                    send_email(
                        [hrbp_user.email],
                        f"[Action Required] Contract Closure Flagged — {consultant.name} ({ticket.ticket_number})",
                        _contract_closure_email_html(consultant.name, consultant.po_end_date, ticket.ticket_number),
                    )

            log.info(
                "Contract closure ticket created: %s for consultant %s (PO end: %s)",
                ticket.ticket_number, consultant.name, consultant.po_end_date,
            )

    except Exception as exc:
        log.error("HRBP contract closure scheduler error: %s", exc)
        db.rollback()
    finally:
        db.close()


# ── Scheduler lifecycle ───────────────────────────────────────────────────────

def start():
    global _scheduler
    if _scheduler and _scheduler.running:
        return
    _scheduler = BackgroundScheduler(timezone="UTC")

    _scheduler.add_job(
        check_sla_breaches,
        "interval",
        minutes=1,
        id="hrbp_sla_check",
        max_instances=1,
        coalesce=True,
    )

    _scheduler.add_job(
        check_step_sla_breaches,
        "interval",
        minutes=1,
        id="hrbp_step_sla_check",
        max_instances=1,
        coalesce=True,
    )

    _scheduler.add_job(
        check_contract_closures,
        "cron",
        hour=8,
        minute=0,
        id="hrbp_contract_closure",
        max_instances=1,
        coalesce=True,
    )

    _scheduler.start()
    log.info("HRBP schedulers started (SLA breach, step SLA breach, contract closure).")


def stop():
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
