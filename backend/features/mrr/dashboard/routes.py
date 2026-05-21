import json as _json

from core.database import get_db
from core.deps import get_current_user
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from features.mrr.dashboard import service

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/nav-counts")
def nav_counts(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Sidebar badge counts — role-aware, lightweight, polled every minute."""
    from infra.models import (
        Candidate,
        CandidateStatus,
        Job,
        JobStatus,
        Submission,
    )

    from features.mrr.submissions.service import TERMINAL_STAGES

    role = current_user.role.value
    uid = current_user.id

    counts: dict[str, int] = {
        "jobs": 0,
        "validation": 0,
        "submissions": 0,
        "candidates": 0,
        "pipeline": 0,
    }

    if role == "admin":
        counts["jobs"] = (
            db.query(Job).filter(Job.status == JobStatus.pending_review).count()
        )
        counts["validation"] = (
            db.query(Candidate)
            .filter(Candidate.status == CandidateStatus.ready_for_validation)
            .count()
        )
        # validated but no submission yet
        submitted_ids = db.query(Submission.candidate_id)
        counts["submissions"] = (
            db.query(Candidate)
            .filter(
                Candidate.status == CandidateStatus.validated,
                ~Candidate.id.in_(submitted_ids),
            )
            .count()
        )
        # active submissions in pipeline (non-terminal)
        counts["pipeline"] = (
            db.query(Submission)
            .filter(
                ~Submission.current_stage.in_(TERMINAL_STAGES),
            )
            .count()
        )

    elif role == "delivery_lead":
        # Collect all job IDs this DL owns (primary delivery_lead_id + multi-DL array)
        dl_job_ids = []
        for j in db.query(Job).all():
            ids = (
                _json.loads(j.delivery_lead_ids or "[]")
                if isinstance(j.delivery_lead_ids, str)
                else (j.delivery_lead_ids or [])
            )
            if j.delivery_lead_id == uid or uid in ids:
                dl_job_ids.append(j.id)

        if dl_job_ids:
            counts["jobs"] = (
                db.query(Job)
                .filter(
                    Job.id.in_(dl_job_ids),
                    Job.status == JobStatus.pending_review,
                )
                .count()
            )
            # Validation queue: ready_for_validation candidates in DL's jobs,
            # excluding candidates the DL personally sourced or called
            counts["validation"] = (
                db.query(Candidate)
                .filter(
                    Candidate.job_id.in_(dl_job_ids),
                    Candidate.status == CandidateStatus.ready_for_validation,
                    Candidate.sourced_by_id != uid,
                    Candidate.assigned_to_id != uid,
                )
                .count()
            )
            submitted_ids = db.query(Submission.candidate_id)
            counts["submissions"] = (
                db.query(Candidate)
                .filter(
                    Candidate.job_id.in_(dl_job_ids),
                    Candidate.status == CandidateStatus.validated,
                    ~Candidate.id.in_(submitted_ids),
                )
                .count()
            )
            counts["pipeline"] = (
                db.query(Submission)
                .join(Candidate, Submission.candidate_id == Candidate.id)
                .filter(
                    Candidate.job_id.in_(dl_job_ids),
                    ~Submission.current_stage.in_(TERMINAL_STAGES),
                )
                .count()
            )

    elif role == "kam":
        counts["jobs"] = (
            db.query(Job)
            .filter(
                Job.created_by_id == uid,
                Job.status == JobStatus.pending_review,
            )
            .count()
        )
        kam_job_ids = [
            j.id for j in db.query(Job.id).filter(Job.created_by_id == uid).all()
        ]
        if kam_job_ids:
            submitted_ids = db.query(Submission.candidate_id)
            counts["submissions"] = (
                db.query(Candidate)
                .filter(
                    Candidate.job_id.in_(kam_job_ids),
                    Candidate.status == CandidateStatus.validated,
                    ~Candidate.id.in_(submitted_ids),
                )
                .count()
            )
            counts["pipeline"] = (
                db.query(Submission)
                .join(Candidate, Submission.candidate_id == Candidate.id)
                .filter(
                    Candidate.job_id.in_(kam_job_ids),
                    ~Submission.current_stage.in_(TERMINAL_STAGES),
                )
                .count()
            )

    elif role == "recruiter":
        # Open JDs where recruiter is in sourcer_ids
        open_jobs = db.query(Job).filter(Job.status == JobStatus.open).all()
        jd_count = 0
        for j in open_jobs:
            ids = (
                _json.loads(j.sourcer_ids or "[]")
                if isinstance(j.sourcer_ids, str)
                else (j.sourcer_ids or [])
            )
            if uid in ids:
                jd_count += 1
        counts["jobs"] = jd_count

        active_statuses = [
            CandidateStatus.sourced,
            CandidateStatus.call_in_progress,
            CandidateStatus.ready_for_validation,
        ]
        counts["candidates"] = (
            db.query(Candidate)
            .filter(
                Candidate.sourced_by_id == uid,
                Candidate.status.in_(active_statuses),
            )
            .count()
        )

    return counts


@router.get("")
def dashboard(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return service.get_dashboard(db, current_user.id, current_user.role.value)


@router.get("/notifications")
def notifications(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return service.get_notifications(db, current_user.id)


@router.post("/notifications/{notif_id}/read")
def mark_read(
    notif_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    service.mark_read(db, notif_id, current_user.id)
    return {"message": "marked read"}
