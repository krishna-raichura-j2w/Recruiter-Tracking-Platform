from datetime import datetime, timezone

from infra.models import (
    Candidate,
    Job,
    Notification,
    Submission,
    User,
    isofy_datetimes,
)
from sqlalchemy import func
from sqlalchemy.orm import Session

PIPELINE_STAGES = [
    ("sourced", "Sourced"),
    ("handed_to_recruiter", "Handed to Recruiter"),
    ("call_in_progress", "Call in Progress"),
    ("ready_for_validation", "Ready for Validation"),
    ("validated", "Validated"),
    ("needs_rework", "Needs Rework"),
    ("on_hold", "On Hold"),
    ("rejected", "Rejected"),
    ("submitted_to_client", "Submitted to Client"),
    ("interview_stage", "Interview Stage"),
    ("offer_rolled_out", "Offer Rolled Out"),
    ("joined", "Joined"),
    ("backed_out", "Backed Out"),
]


def get_dashboard(db: Session, user_id: int, role: str) -> dict:
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    pipeline = []
    for stage_val, stage_label in PIPELINE_STAGES:
        q = db.query(func.count(Candidate.id)).filter(Candidate.status == stage_val)
        if role == "recruiter":
            q = q.filter(Candidate.assigned_to_id == user_id)
        count = q.scalar() or 0
        pipeline.append({"stage": stage_label, "count": count})

    total_candidates = db.query(func.count(Candidate.id)).scalar() or 0
    total_jobs = db.query(func.count(Job.id)).filter(Job.status == "open").scalar() or 0

    submitted_q = db.query(func.count(Submission.id)).filter(
        Submission.submitted_at >= month_start,
    )
    if role == "delivery_lead":
        submitted_q = submitted_q.filter(Submission.delivery_lead_id == user_id)
    submitted_this_month = submitted_q.scalar() or 0

    joined_this_month = (
        db.query(func.count(Candidate.id))
        .filter(
            Candidate.status == "joined",
            Candidate.updated_at >= month_start,
        )
        .scalar()
        or 0
    )

    # Per-recruiter breakdown (pod lead only)
    recruiter_stats = []
    if role in ("delivery_lead", "admin"):
        callers = db.query(User).filter(User.role == "recruiter", User.is_active).all()
        if callers:
            caller_ids = [c.id for c in callers]
            # Single GROUP BY query replaces N×3 individual COUNT queries
            rows = (
                db.query(
                    Candidate.assigned_to_id,
                    func.count(Candidate.id).label("assigned"),
                    func.count(Candidate.id).filter(
                        Candidate.status.notin_(["sourced", "handed_to_recruiter"])
                    ).label("called"),
                    func.count(Candidate.id).filter(
                        Candidate.status.in_([
                            "validated", "submitted_to_client", "interview_stage",
                            "offer_rolled_out", "joined",
                        ])
                    ).label("validated"),
                )
                .filter(Candidate.assigned_to_id.in_(caller_ids))
                .group_by(Candidate.assigned_to_id)
                .all()
            )
            counts_by_id = {r[0]: r for r in rows}
            for caller in callers:
                r = counts_by_id.get(caller.id)
                recruiter_stats.append({
                    "name": caller.name,
                    "assigned": r[1] if r else 0,
                    "called": r[2] if r else 0,
                    "validated": r[3] if r else 0,
                })

    # Unread notifications
    unread_notifs = (
        db.query(func.count(Notification.id))
        .filter(
            Notification.user_id == user_id,
            Notification.is_read == False,  # noqa: E712
        )
        .scalar()
        or 0
    )

    return {
        "pipeline": pipeline,
        "total_candidates": total_candidates,
        "total_jobs": total_jobs,
        "submitted_this_month": submitted_this_month,
        "joined_this_month": joined_this_month,
        "recruiter_stats": recruiter_stats,
        "unread_notifications": unread_notifs,
    }


def get_notifications(db: Session, user_id: int) -> dict:
    notifs = (
        db.query(Notification)
        .filter(Notification.user_id == user_id)
        .order_by(Notification.created_at.desc())
        .limit(50)
        .all()
    )
    rows = []
    for n in notifs:
        d = {col.name: getattr(n, col.name) for col in n.__table__.columns}
        isofy_datetimes(d)
        rows.append(d)
    unread = sum(1 for r in rows if not r["is_read"])
    return {"notifications": rows, "unread_count": unread}


def mark_read(db: Session, notif_id: int, user_id: int):
    n = (
        db.query(Notification)
        .filter(Notification.id == notif_id, Notification.user_id == user_id)
        .first()
    )
    if n:
        n.is_read = True
        db.commit()
