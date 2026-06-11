"""
Background scheduler — runs every minute, checks sourcing/calling deadlines.

For each open job with a deadline set:
  • 15 min before deadline  → warn the assigned recruiter(s)
  • Past deadline           → alert DL + recruiter(s), mark as alerted
"""

import json
import logging
import os
from datetime import datetime, timedelta, timezone

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from core.database import SessionLocal
from core.sql_loader import load_sql
from infra.models import Job, JobStatus, NotifType, User
from sqlalchemy import text

from features.mrr.notifications.service import push

# Cluster-wide lock key — picked at random, must stay stable across versions.
# Used by pg_try_advisory_lock so only ONE uvicorn worker runs the deadline
# check per tick. Prevents duplicate notifications when uvicorn runs with
# --workers > 1.
_SCHED_LOCK_KEY = 3133731337
# Separate lock key for the hourly BH-target email job.
_BH_EMAIL_LOCK_KEY = 3133731338

log = logging.getLogger(__name__)


def send_bh_target_email():
    """Send the BH Target Tracking daily email. Scheduled hourly 10:00–20:00 IST.

    Multi-worker safe: a transaction-scoped advisory lock lets only ONE worker
    proceed, and a per-(date,hour) row in bh_email_send_log guarantees exactly
    one email per hour even if the job somehow fires twice. Recipients come from
    the BH_REPORT_EMAILS_SEND env var (comma-separated).
    """
    from core.email import send_outlook_email
    from features.mrr.bh_target_email import service

    db = SessionLocal()
    try:
        # Idempotency ledger (created lazily — no migration needed).
        db.execute(text(
            "CREATE TABLE IF NOT EXISTS bh_email_send_log ("
            "sent_key TEXT PRIMARY KEY, sent_at TIMESTAMPTZ DEFAULT now())",
        ))
        db.commit()

        # Only one worker proceeds per tick; others fail the lock and return.
        acquired = db.execute(
            text("SELECT pg_try_advisory_xact_lock(:k)"),
            {"k": _BH_EMAIL_LOCK_KEY},
        ).scalar()
        if not acquired:
            return

        ist_now = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
        sent_key = ist_now.strftime("%Y-%m-%d-%H")  # one send per IST hour

        # Claim this hour; if already claimed, another worker/tick handled it.
        claimed = db.execute(
            text(
                "INSERT INTO bh_email_send_log (sent_key) VALUES (:k) "
                "ON CONFLICT (sent_key) DO NOTHING RETURNING sent_key",
            ),
            {"k": sent_key},
        ).rowcount
        if not claimed:
            db.commit()  # release lock
            return

        recipients = [
            e.strip()
            for e in (os.getenv("BH_REPORT_EMAILS_SEND") or "").split(",")
            if e.strip()
        ]
        if not recipients:
            log.warning("BH email: BH_REPORT_EMAILS_SEND is empty — skipping send.")
            db.rollback()  # don't persist the claim so it can retry later
            return

        data = service.collect_bh_rows(db, ist_now.date())
        html = service.render_html(data["date"], data["rows"], data["totals"])
        pretty = datetime.strptime(data["date"], "%Y-%m-%d").strftime("%d %b %Y")
        # IST time the snapshot reflects, e.g. "10 AM", "11 AM", "8 PM".
        hour12 = ((ist_now.hour - 1) % 12) + 1
        ampm = "AM" if ist_now.hour < 12 else "PM"
        time_label = f"{hour12} {ampm}"
        subject = f"BH Target Tracking — {time_label} IST Snapshot ({pretty})"

        send_outlook_email(recipients, subject, html)
        db.commit()  # persist the claim + release lock only after a successful send
        log.info("BH target email sent to %s for %s", recipients, sent_key)

    except Exception as e:  # noqa: BLE001
        log.error("BH target email error: %s", e)
        db.rollback()
    finally:
        db.close()

_scheduler: BackgroundScheduler | None = None


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _user_ids(db, ids_json: str | None, fallback_id: int | None) -> list[int]:
    try:
        ids = json.loads(ids_json or "[]")
        if isinstance(ids, list) and ids:
            return [int(i) for i in ids]
    except Exception:
        pass
    return [fallback_id] if fallback_id else []


def check_deadlines():
    db = SessionLocal()
    try:
        # Transaction-scoped advisory lock. Only ONE worker per tick runs the
        # body; the others get False and return immediately. The lock auto-
        # releases when this transaction commits or rolls back, so there's no
        # cleanup path to leak — even if the worker crashes or the connection
        # is recycled by the pool.
        acquired = db.execute(
            text(load_sql("011-advisory_lock.sql")),
            {"k": _SCHED_LOCK_KEY},
        ).scalar()
        if not acquired:
            return

        now = _now()
        warn_at = now + timedelta(minutes=15)

        jobs = (
            db.query(Job)
            .filter(Job.status == JobStatus.open)
            .filter(
                (Job.sourcing_deadline.isnot(None))
                | (Job.calling_deadline.isnot(None)),
            )
            .all()
        )

        for job in jobs:
            label = f"{job.role_title} — {job.client_name}"
            dl_id = job.delivery_lead_id

            # ── Sourcing deadline ──────────────────────────────────────────
            if job.sourcing_deadline:
                sd = _as_utc(job.sourcing_deadline)
                sourcer_ids = _user_ids(db, job.sourcer_ids, job.assigned_sourcer_id)

                # 15-min warning (fire once)
                if not job.sourcing_warned and now < sd <= warn_at:
                    for uid in sourcer_ids:
                        push(
                            db,
                            uid,
                            f"⏰ 15 minutes left to complete sourcing for {label}.",
                            NotifType.general,
                            entity_id=job.id,
                        )
                    job.sourcing_warned = True

                # Overdue alert (fire once)
                if not job.sourcing_alerted and now > sd:
                    for uid in sourcer_ids:
                        push(
                            db,
                            uid,
                            f"🚨 Sourcing deadline passed for {label}. Please update your progress.",
                            NotifType.general,
                            entity_id=job.id,
                        )
                    if dl_id:
                        names = _recruiter_names(db, sourcer_ids)
                        push(
                            db,
                            dl_id,
                            f"🚨 Sourcing overdue for {label}. Recruiter(s): {names}.",
                            NotifType.general,
                            entity_id=job.id,
                        )
                    job.sourcing_alerted = True

            # ── Calling deadline ───────────────────────────────────────────
            if job.calling_deadline:
                cd = _as_utc(job.calling_deadline)
                caller_ids = _user_ids(db, job.caller_ids, job.assigned_caller_id)

                # 15-min warning
                if not job.calling_warned and now < cd <= warn_at:
                    for uid in caller_ids:
                        push(
                            db,
                            uid,
                            f"⏰ 15 minutes left to complete calling for {label}.",
                            NotifType.general,
                            entity_id=job.id,
                        )
                    job.calling_warned = True

                # Overdue alert
                if not job.calling_alerted and now > cd:
                    for uid in caller_ids:
                        push(
                            db,
                            uid,
                            f"🚨 Calling deadline passed for {label}. Please update your progress.",
                            NotifType.general,
                            entity_id=job.id,
                        )
                    if dl_id:
                        names = _recruiter_names(db, caller_ids)
                        push(
                            db,
                            dl_id,
                            f"🚨 Calling overdue for {label}. Caller(s): {names}.",
                            NotifType.general,
                            entity_id=job.id,
                        )
                    job.calling_alerted = True

        # Always commit so the advisory_xact_lock releases. No-op if no rows
        # were touched.
        db.commit()

    except Exception as e:
        log.error("Deadline scheduler error: %s", e)
        db.rollback()
    finally:
        db.close()


def _recruiter_names(db, user_ids: list[int]) -> str:
    if not user_ids:
        return "Unknown"
    users = db.query(User).filter(User.id.in_(user_ids)).all()
    return ", ".join(u.name for u in users) or "Unknown"


def start():
    global _scheduler
    if _scheduler and _scheduler.running:
        return
    _scheduler = BackgroundScheduler(timezone="UTC")
    _scheduler.add_job(
        check_deadlines,
        "interval",
        minutes=1,
        id="deadline_check",
        max_instances=1,
        coalesce=True,
    )
    # BH target email — hourly from 10:00 to 20:00 IST.
    # Container clock is UTC; IST = UTC+5:30, so 10:00–20:00 IST = 04:30–14:30 UTC
    # at minute 30 (hours 4..14 inclusive → 11 sends/day). Using UTC avoids any
    # tzdata dependency in the slim image.
    _scheduler.add_job(
        send_bh_target_email,
        CronTrigger(hour="4-14", minute=30),
        id="bh_target_email",
        max_instances=1,
        coalesce=True,
    )
    _scheduler.start()
    log.info("MRR scheduler started (deadline_check + bh_target_email).")


def stop():
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
