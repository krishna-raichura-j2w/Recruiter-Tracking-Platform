from datetime import datetime, timezone
from sqlalchemy.orm import Session
from sqlalchemy import func
from infra.models import Candidate, Job, Submission, CandidateStatus, User, Notification


PIPELINE_STAGES = [
    ("sourced",              "Sourced"),
    ("pool_verified",        "Pool Verified"),
    ("handed_to_recruiter",  "Handed to Recruiter"),
    ("call_in_progress",     "Call in Progress"),
    ("ready_for_validation", "Ready for Validation"),
    ("validated",            "Validated"),
    ("needs_rework",         "Needs Rework"),
    ("on_hold",              "On Hold"),
    ("rejected",             "Rejected"),
    ("submitted_to_client",  "Submitted to Client"),
    ("interview_stage",      "Interview Stage"),
    ("offer_rolled_out",     "Offer Rolled Out"),
    ("joined",               "Joined"),
    ("backed_out",           "Backed Out"),
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
        Submission.submitted_at >= month_start
    )
    if role == "delivery_lead":
        submitted_q = submitted_q.filter(Submission.delivery_lead_id == user_id)
    submitted_this_month = submitted_q.scalar() or 0

    joined_this_month = db.query(func.count(Candidate.id)).filter(
        Candidate.status == "joined",
        Candidate.updated_at >= month_start,
    ).scalar() or 0

    # Per-recruiter breakdown (pod lead only)
    recruiter_stats = []
    if role in ("delivery_lead", "admin"):
        callers = db.query(User).filter(User.role == "recruiter", User.is_active == True).all()
        for caller in callers:
            sourced = db.query(func.count(Candidate.id)).filter(Candidate.assigned_to_id == caller.id).scalar() or 0
            called = db.query(func.count(Candidate.id)).filter(
                Candidate.assigned_to_id == caller.id,
                Candidate.status.notin_(["sourced", "pool_verified", "handed_to_recruiter"])
            ).scalar() or 0
            validated = db.query(func.count(Candidate.id)).filter(
                Candidate.assigned_to_id == caller.id,
                Candidate.status.in_(["validated", "submitted_to_client", "interview_stage", "offer_rolled_out", "joined"])
            ).scalar() or 0
            recruiter_stats.append({
                "name": caller.name,
                "assigned": sourced,
                "called": called,
                "validated": validated,
            })

    # Unread notifications
    unread_notifs = db.query(func.count(Notification.id)).filter(
        Notification.user_id == user_id,
        Notification.is_read == False,
    ).scalar() or 0

    return {
        "pipeline": pipeline,
        "total_candidates": total_candidates,
        "total_jobs": total_jobs,
        "submitted_this_month": submitted_this_month,
        "joined_this_month": joined_this_month,
        "recruiter_stats": recruiter_stats,
        "unread_notifications": unread_notifs,
    }


def get_notifications(db: Session, user_id: int) -> list:
    notifs = db.query(Notification).filter(
        Notification.user_id == user_id
    ).order_by(Notification.created_at.desc()).limit(50).all()
    return [
        {col.name: getattr(n, col.name) for col in n.__table__.columns}
        for n in notifs
    ]


def mark_read(db: Session, notif_id: int, user_id: int):
    n = db.query(Notification).filter(
        Notification.id == notif_id, Notification.user_id == user_id
    ).first()
    if n:
        n.is_read = True
        db.commit()
