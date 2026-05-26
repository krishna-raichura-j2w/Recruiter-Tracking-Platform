"""
HRBP SLA breach scheduler — runs every minute.

Ticket-level breach (check_sla_breaches):
  For each open ticket whose sla_deadline has passed and has not yet been alerted:
  1. Bump priority one level (low→medium→high→critical).
  2. Set status = "escalated".
  3. Set sla_alerted_at = now() so this fires exactly once per ticket.
  4. Log action="sla_breached" to the activity log.
  5. Push in-app notification + send email to ticket creator and escalation manager.

Per-step breach (check_step_sla_breaches):
  For each open ticket where the current step owner has exceeded their sla_hours
  and step_sla_alerted_at is still NULL:
  1. Log action="step_sla_breached".
  2. Set step_sla_alerted_at = now() so this fires exactly once per step.
  3. Push in-app notification + send email (EST1) to the step owner.
  4. Push in-app notification + send email (EST2) to the escalation manager.
  (Alert resets automatically when the ticket advances to the next step.)
"""

import logging
from datetime import datetime, timedelta, timezone

from apscheduler.schedulers.background import BackgroundScheduler
from core.database import SessionLocal
from core.email import send_email
from infra.hrbp_models import HRBPEmailTemplate, HRBPTicket, HRBPTicketActivityLog
from infra.models import User
from sqlalchemy import text

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

    _scheduler.start()
    log.info("HRBP SLA breach schedulers started (ticket-level + per-step).")


def stop():
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
