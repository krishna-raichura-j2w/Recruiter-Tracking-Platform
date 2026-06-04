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


def _po_finance_email_html(
    consultant_name: str,
    client_name: str,
    po_end_date: date,
    ticket_number: str,
    po_amount: str,
    recipient_name: str,
    triggered_on: date,
) -> str:
    return f"""
<html>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 0;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

      <!-- Header -->
      <tr>
        <td style="background:linear-gradient(135deg,#0f2249 0%,#1e40af 100%);padding:28px 36px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td>
                <p style="margin:0 0 4px 0;color:#93c5fd;font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;">J2W · HRBP System</p>
                <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">Contract Closure — Action Required</h1>
                <p style="margin:8px 0 0 0;color:#bfdbfe;font-size:13px;">Ticket <strong style="color:#fff;">{ticket_number}</strong> has been auto-raised by the system</p>
              </td>
              <td align="right" style="vertical-align:top;">
                <div style="background:rgba(255,255,255,0.12);border-radius:8px;padding:10px 16px;text-align:center;">
                  <p style="margin:0;color:#bfdbfe;font-size:10px;text-transform:uppercase;letter-spacing:1px;">PO Ends In</p>
                  <p style="margin:4px 0 0 0;color:#fff;font-size:20px;font-weight:700;">4 months</p>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- Greeting -->
      <tr>
        <td style="padding:28px 36px 0 36px;">
          <p style="margin:0;color:#374151;font-size:15px;">Dear <strong>{recipient_name}</strong>,</p>
          <p style="margin:12px 0 0 0;color:#6b7280;font-size:14px;line-height:1.6;">
            A <strong>SOP-3: Contract Closure and Redeployment</strong> ticket has been automatically created
            because the consultant's PO end date is <strong>4 months away</strong>. Please review and initiate
            the closure or renewal process at the earliest.
          </p>
        </td>
      </tr>

      <!-- Details Card -->
      <tr>
        <td style="padding:24px 36px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
            <tr>
              <td style="padding:16px 20px;border-bottom:1px solid #e2e8f0;">
                <p style="margin:0;color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Ticket Number</p>
                <p style="margin:4px 0 0 0;color:#1e40af;font-size:16px;font-weight:700;font-family:monospace;">{ticket_number}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td width="50%" style="padding:16px 20px;border-right:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;">
                      <p style="margin:0;color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Consultant</p>
                      <p style="margin:4px 0 0 0;color:#111827;font-size:14px;font-weight:600;">{consultant_name}</p>
                    </td>
                    <td width="50%" style="padding:16px 20px;border-bottom:1px solid #e2e8f0;">
                      <p style="margin:0;color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Client</p>
                      <p style="margin:4px 0 0 0;color:#111827;font-size:14px;font-weight:600;">{client_name}</p>
                    </td>
                  </tr>
                  <tr>
                    <td width="50%" style="padding:16px 20px;border-right:1px solid #e2e8f0;">
                      <p style="margin:0;color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">PO End Date</p>
                      <p style="margin:4px 0 0 0;color:#dc2626;font-size:14px;font-weight:700;">{po_end_date.strftime("%d %b %Y")}</p>
                    </td>
                    <td width="50%" style="padding:16px 20px;">
                      <p style="margin:0;color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Monthly PO Value</p>
                      <p style="margin:4px 0 0 0;color:#111827;font-size:14px;font-weight:600;">{po_amount}</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:14px 20px;background:#fef3c7;border-top:1px solid #fde68a;">
                <p style="margin:0;color:#92400e;font-size:12px;">
                  &#128197; <strong>Triggered on:</strong> {triggered_on.strftime("%d %b %Y")} &nbsp;·&nbsp;
                  <strong>4-month window closes:</strong> {po_end_date.strftime("%d %b %Y")}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- Next Steps -->
      <tr>
        <td style="padding:0 36px 24px 36px;">
          <p style="margin:0 0 12px 0;color:#111827;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Next Steps</p>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:8px 0;">
                <table cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="width:28px;vertical-align:top;">
                      <div style="width:22px;height:22px;background:#dbeafe;border-radius:50%;text-align:center;line-height:22px;font-size:11px;font-weight:700;color:#1e40af;">1</div>
                    </td>
                    <td style="padding-left:10px;color:#374151;font-size:13px;line-height:1.5;">Review the ticket in the HRBP portal and confirm the PO details.</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 0;">
                <table cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="width:28px;vertical-align:top;">
                      <div style="width:22px;height:22px;background:#dbeafe;border-radius:50%;text-align:center;line-height:22px;font-size:11px;font-weight:700;color:#1e40af;">2</div>
                    </td>
                    <td style="padding-left:10px;color:#374151;font-size:13px;line-height:1.5;">Coordinate with the HRBP to initiate the renewal or closure conversation with the client.</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 0;">
                <table cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="width:28px;vertical-align:top;">
                      <div style="width:22px;height:22px;background:#dbeafe;border-radius:50%;text-align:center;line-height:22px;font-size:11px;font-weight:700;color:#1e40af;">3</div>
                    </td>
                    <td style="padding-left:10px;color:#374151;font-size:13px;line-height:1.5;">Complete all SOP-3 steps before the PO end date to avoid financial risk.</td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:18px 36px;border-radius:0 0 12px 12px;">
          <p style="margin:0;color:#9ca3af;font-size:11px;text-align:center;">
            This is an automated notification from the <strong>J2W HRBP System</strong>. Do not reply to this email.<br/>
            &copy; {datetime.now().year} Joules to Watts · HR Operations
          </p>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>
"""


def _hrbp_contract_closure_email_html(
    consultant_name: str,
    client_name: str,
    po_end_date: date,
    ticket_number: str,
    recipient_name: str,
    triggered_on: date,
) -> str:
    return f"""
<html>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 0;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

      <!-- Header -->
      <tr>
        <td style="background:linear-gradient(135deg,#064e3b 0%,#059669 100%);padding:28px 36px;">
          <p style="margin:0 0 4px 0;color:#a7f3d0;font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;">J2W · HRBP System</p>
          <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">Contract Closure — FYI Notification</h1>
          <p style="margin:8px 0 0 0;color:#d1fae5;font-size:13px;">Ticket <strong style="color:#fff;">{ticket_number}</strong> has been raised for your consultant</p>
        </td>
      </tr>

      <!-- Body -->
      <tr>
        <td style="padding:28px 36px 24px 36px;">
          <p style="margin:0;color:#374151;font-size:15px;">Dear <strong>{recipient_name}</strong>,</p>
          <p style="margin:12px 0 0 0;color:#6b7280;font-size:14px;line-height:1.6;">
            A <strong>SOP-3: Contract Closure and Redeployment</strong> ticket has been automatically raised by
            the PO Finance team for your consultant. Please be aware of the upcoming contract end and
            coordinate with the PO Finance team to ensure a smooth process.
          </p>
        </td>
      </tr>

      <!-- Details Card -->
      <tr>
        <td style="padding:0 36px 28px 36px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;overflow:hidden;">
            <tr>
              <td style="padding:16px 20px;border-bottom:1px solid #bbf7d0;">
                <p style="margin:0;color:#6b7280;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Ticket Number</p>
                <p style="margin:4px 0 0 0;color:#059669;font-size:16px;font-weight:700;font-family:monospace;">{ticket_number}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td width="50%" style="padding:16px 20px;border-right:1px solid #bbf7d0;">
                      <p style="margin:0;color:#6b7280;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Consultant</p>
                      <p style="margin:4px 0 0 0;color:#111827;font-size:14px;font-weight:600;">{consultant_name}</p>
                    </td>
                    <td width="50%" style="padding:16px 20px;">
                      <p style="margin:0;color:#6b7280;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Client</p>
                      <p style="margin:4px 0 0 0;color:#111827;font-size:14px;font-weight:600;">{client_name}</p>
                    </td>
                  </tr>
                  <tr>
                    <td colspan="2" style="padding:14px 20px;background:#fef3c7;border-top:1px solid #fde68a;">
                      <p style="margin:0;color:#92400e;font-size:12px;">
                        &#128197; <strong>PO End Date:</strong> {po_end_date.strftime("%d %b %Y")} &nbsp;·&nbsp;
                        <strong>Flagged on:</strong> {triggered_on.strftime("%d %b %Y")}
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:18px 36px;border-radius:0 0 12px 12px;">
          <p style="margin:0;color:#9ca3af;font-size:11px;text-align:center;">
            This is an automated notification from the <strong>J2W HRBP System</strong>. Do not reply to this email.<br/>
            &copy; {datetime.now().year} Joules to Watts · HR Operations
          </p>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>
"""


def check_contract_closures():
    """
    Runs daily at 08:00 UTC. Creates SOP-3 tickets for consultants whose po_end_date
    falls within the next 4 calendar months (inclusive).
    - Ticket is raised by the PO Finance team (first active po_finance user).
    - Hierarchy is populated from the SOP-3 persons_hierarchy (now includes po_finance).
    - All active po_finance users are notified via in-app + email.
    - All HRBPs assigned to the client are notified via in-app + email.
    - Escalation manager remains the BH.
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

        # All active po_finance users — first one is used as raiser, all get notified
        po_finance_users: list[User] = (
            db.query(User)
            .filter(User.role == "po_finance", User.is_active == True)  # noqa: E712
            .order_by(User.id)
            .all()
        )
        if not po_finance_users:
            log.error("No active po_finance user found — contract closure job skipped.")
            return

        raiser = po_finance_users[0]

        steps_def: list[dict] = sop.steps_definition or []
        persons_hierarchy: list[dict] = sop.persons_hierarchy or []

        consultants = (
            db.query(HRBPConsultant)
            .filter(
                HRBPConsultant.is_active == True,  # noqa: E712
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

            client    = db.query(HRBPClient).filter_by(id=consultant.client_id).first()
            bh_user   = db.query(User).filter_by(id=client.bh_id).first() if client else None
            ops_head  = db.query(User).filter(User.role == "ops_head", User.is_active == True).first()  # noqa: E712
            coo_user  = db.query(User).filter(User.role == "coo", User.is_active == True).first()  # noqa: E712

            # Resolve all HRBPs assigned to this client (multi-HRBP aware)
            hrbp_ids_on_client: list[int] = []
            if client:
                if client.hrbp_ids:
                    hrbp_ids_on_client = list(client.hrbp_ids)
                elif client.hrbp_id:
                    hrbp_ids_on_client = [client.hrbp_id]
            # Always include the consultant's own HRBP
            if consultant.hrbp_id and consultant.hrbp_id not in hrbp_ids_on_client:
                hrbp_ids_on_client.append(consultant.hrbp_id)

            hrbp_users: list[User] = (
                db.query(User).filter(User.id.in_(hrbp_ids_on_client)).all()
                if hrbp_ids_on_client else []
            )
            # Primary HRBP for hierarchy (consultant's own HRBP)
            primary_hrbp = db.query(User).filter_by(id=consultant.hrbp_id).first()

            role_user_map: dict[str, User | None] = {
                "po_finance": raiser,
                "hrbp":       primary_hrbp,
                "bh":         bh_user,
                "ops_head":   ops_head,
                "coo":        coo_user,
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

            po_impact  = float(consultant.monthly_po) if consultant.monthly_po else None
            sla_dt     = datetime.combine(consultant.po_end_date, datetime.min.time()).replace(tzinfo=timezone.utc)
            client_name = client.name if client else "—"
            po_amount_fmt = f"₹{po_impact:,.2f}" if po_impact else "—"

            ticket = HRBPTicket(
                ticket_number     = _next_ticket_number_raw(db),
                title             = f"SOP-3: Contract Closure — {consultant.name}",
                raised_by_id      = raiser.id,
                escalation_mgr_id = client.bh_id if client else None,
                client_id         = consultant.client_id,
                sop_id            = sop.id,
                priority          = "high",
                sla_deadline      = sla_dt,
                po_risk_amount    = po_impact,
                description       = (
                    f"Auto-generated by the contract closure scheduler.\n"
                    f"PO end date: {consultant.po_end_date.strftime('%d %b %Y')}. "
                    f"4-month flag triggered on {today.strftime('%d %b %Y')}."
                ),
                status            = "open",
                hierarchy_json    = hierarchy,
                current_step      = 1,
                step_started_at   = _now(),
                attachments       = [],
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
                    "trigger":        "contract_closure_4m",
                    "raised_by_role": "po_finance",
                    "raised_by_id":   raiser.id,
                    "po_end_date":    consultant.po_end_date.isoformat(),
                    "triggered_on":   today.isoformat(),
                },
            ))

            db.commit()
            db.refresh(ticket)

            notif_title = f"Contract Closure Flagged — {consultant.name}"

            # ── Notify all po_finance users ───────────────────────────────────
            po_finance_emails: list[str] = []
            for pf_user in po_finance_users:
                push(
                    db,
                    user_id=pf_user.id,
                    title=notif_title,
                    message=(
                        f"SOP-3 ticket {ticket.ticket_number} auto-raised. "
                        f"{consultant.name} ({client_name}) PO ends "
                        f"{consultant.po_end_date.strftime('%d %b %Y')}. "
                        f"Please initiate the contract closure process."
                    ),
                    notif_type="contract_closure",
                    ticket_id=ticket.id,
                )
                if pf_user.email:
                    po_finance_emails.append(pf_user.email)

            if po_finance_emails:
                send_email(
                    po_finance_emails,
                    f"[Action Required] Contract Closure — {consultant.name} | {ticket.ticket_number}",
                    _po_finance_email_html(
                        consultant_name=consultant.name,
                        client_name=client_name,
                        po_end_date=consultant.po_end_date,
                        ticket_number=ticket.ticket_number,
                        po_amount=po_amount_fmt,
                        recipient_name="PO Finance Team",
                        triggered_on=today,
                    ),
                )

            # ── Notify all HRBPs assigned to this client ──────────────────────
            for hrbp_u in hrbp_users:
                push(
                    db,
                    user_id=hrbp_u.id,
                    title=notif_title,
                    message=(
                        f"SOP-3 ticket {ticket.ticket_number} has been raised by PO Finance for "
                        f"{consultant.name} ({client_name}). "
                        f"PO ends {consultant.po_end_date.strftime('%d %b %Y')}. "
                        f"Please coordinate with the PO Finance team."
                    ),
                    notif_type="contract_closure",
                    ticket_id=ticket.id,
                )
                if hrbp_u.email:
                    send_email(
                        [hrbp_u.email],
                        f"[FYI] Contract Closure Ticket Raised — {consultant.name} | {ticket.ticket_number}",
                        _hrbp_contract_closure_email_html(
                            consultant_name=consultant.name,
                            client_name=client_name,
                            po_end_date=consultant.po_end_date,
                            ticket_number=ticket.ticket_number,
                            recipient_name=hrbp_u.name,
                            triggered_on=today,
                        ),
                    )

            log.info(
                "Contract closure ticket created: %s for consultant %s (PO end: %s) raised_by=po_finance",
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

    # 4-month contract closure scheduler — temporarily disabled
    # _scheduler.add_job(
    #     check_contract_closures,
    #     "cron",
    #     hour=8,
    #     minute=0,
    #     id="hrbp_contract_closure",
    #     max_instances=1,
    #     coalesce=True,
    # )

    _scheduler.start()
    log.info("HRBP schedulers started (SLA breach, step SLA breach).")


def stop():
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
