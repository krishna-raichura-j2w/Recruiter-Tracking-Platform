"""
Background scheduler — runs every minute, checks sourcing/calling deadlines.

For each open job with a deadline set:
  • 15 min before deadline  → warn the assigned recruiter(s)
  • Past deadline           → alert DL + recruiter(s), mark as alerted
"""
import json
import logging
from datetime import datetime, timezone, timedelta
from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy import text

from core.database import SessionLocal
from infra.models import Job, JobStatus, User, UserRole, NotifType
from features.notifications.service import push

# Cluster-wide lock key — picked at random, must stay stable across versions.
# Used by pg_try_advisory_lock so only ONE uvicorn worker runs the deadline
# check per tick. Prevents duplicate notifications when uvicorn runs with
# --workers > 1.
_SCHED_LOCK_KEY = 3133731337

log = logging.getLogger(__name__)

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
            text("SELECT pg_try_advisory_xact_lock(:k)"),
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
                (Job.sourcing_deadline.isnot(None)) |
                (Job.calling_deadline.isnot(None))
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
                        push(db, uid,
                            f"⏰ 15 minutes left to complete sourcing for {label}.",
                            NotifType.general, entity_id=job.id)
                    job.sourcing_warned = True

                # Overdue alert (fire once)
                if not job.sourcing_alerted and now > sd:
                    for uid in sourcer_ids:
                        push(db, uid,
                            f"🚨 Sourcing deadline passed for {label}. Please update your progress.",
                            NotifType.general, entity_id=job.id)
                    if dl_id:
                        names = _recruiter_names(db, sourcer_ids)
                        push(db, dl_id,
                            f"🚨 Sourcing overdue for {label}. Recruiter(s): {names}.",
                            NotifType.general, entity_id=job.id)
                    job.sourcing_alerted = True

            # ── Calling deadline ───────────────────────────────────────────
            if job.calling_deadline:
                cd = _as_utc(job.calling_deadline)
                caller_ids = _user_ids(db, job.caller_ids, job.assigned_caller_id)

                # 15-min warning
                if not job.calling_warned and now < cd <= warn_at:
                    for uid in caller_ids:
                        push(db, uid,
                            f"⏰ 15 minutes left to complete calling for {label}.",
                            NotifType.general, entity_id=job.id)
                    job.calling_warned = True

                # Overdue alert
                if not job.calling_alerted and now > cd:
                    for uid in caller_ids:
                        push(db, uid,
                            f"🚨 Calling deadline passed for {label}. Please update your progress.",
                            NotifType.general, entity_id=job.id)
                    if dl_id:
                        names = _recruiter_names(db, caller_ids)
                        push(db, dl_id,
                            f"🚨 Calling overdue for {label}. Caller(s): {names}.",
                            NotifType.general, entity_id=job.id)
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
    _scheduler.add_job(check_deadlines, "interval", minutes=1, id="deadline_check",
                       max_instances=1, coalesce=True)
    _scheduler.start()
    log.info("Deadline scheduler started.")


def stop():
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
