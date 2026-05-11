from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload
from core.database import get_db
from core.deps import get_current_user
from infra.models import (
    Job, Candidate, CallLog, Assessment, Validation,
    ConsultantMail, Submission, SubmissionTimeline, JobStatus,
)

router = APIRouter(prefix="/followup", tags=["followup"])


def _iso(dt):
    return dt.isoformat() if dt else None


def _candidate_story(c: Candidate) -> dict:
    # First call
    first_call_at   = None
    first_call_by   = None
    first_call_note = None
    if c.call_logs:
        ordered = sorted(c.call_logs, key=lambda l: l.call_date or l.created_at)
        first = ordered[0]
        first_call_at   = _iso(first.call_date or first.created_at)
        first_call_by   = first.caller.name if first.caller else None
        first_call_note = first.outcome.value if first.outcome else None

    # Assessment
    a = c.assessment
    assessment_at    = _iso(a.updated_at) if a else None
    assessment_score = a.overall_score    if a else None

    # Mail
    m = c.consultant_mail
    email_sent_at   = _iso(m.sent_at)            if m else None
    email_sent_by   = m.sent_by.name             if (m and m.sent_by) else None
    acknowledged_at = _iso(m.acknowledgement_at) if (m and m.acknowledgement_received) else None
    dl_verified_at  = _iso(m.dl_verified_at)     if (m and m.dl_verified) else None

    # Validation
    v = c.validation
    validation_at     = _iso(v.updated_at)       if v else None
    validation_status = v.status.value           if (v and v.status) else None
    validated_by      = v.delivery_lead.name     if (v and v.delivery_lead) else None
    validation_note   = v.comments               if v else None

    # Submission + KAM timeline notes
    s = c.submission
    submitted_at     = _iso(s.submitted_at)      if s else None
    submitted_by     = s.delivery_lead.name      if (s and s.delivery_lead) else None
    interview_stage  = s.current_stage.value     if (s and s.current_stage) else None
    kam_updates: list[dict] = []
    if s and s.timeline:
        for t in sorted(s.timeline, key=lambda x: x.created_at or ""):
            if t.note:
                kam_updates.append({
                    "stage":      t.stage_label or t.stage,
                    "note":       t.note,
                    "updated_by": t.updated_by.name if t.updated_by else None,
                    "at":         _iso(t.created_at),
                })

    return {
        "id":               c.id,
        "full_name":        c.full_name,
        "mobile":           c.mobile,
        "email":            c.email,
        "status":           c.status.value if c.status else None,
        "rejected_by":      c.rejected_by,
        "rejection_reason": c.rejection_reason,
        "sourced_by_name":  c.sourced_by.name  if c.sourced_by  else None,
        "assigned_to_name": c.assigned_to.name if c.assigned_to else None,
        # Timeline
        "sourced_at":       _iso(c.sourced_at),
        "first_call_at":    first_call_at,
        "first_call_by":    first_call_by,
        "first_call_note":  first_call_note,
        "assessment_at":    assessment_at,
        "assessment_score": assessment_score,
        "email_sent_at":    email_sent_at,
        "email_sent_by":    email_sent_by,
        "acknowledged_at":  acknowledged_at,
        "dl_verified_at":   dl_verified_at,
        "validation_at":    validation_at,
        "validation_status":validation_status,
        "validated_by":     validated_by,
        "validation_note":  validation_note,
        "submitted_at":     submitted_at,
        "submitted_by":     submitted_by,
        "interview_stage":  interview_stage,
        "kam_updates":      kam_updates,
    }


def _job_story(db: Session, job: Job) -> dict:
    candidates = (
        db.query(Candidate)
        .options(
            joinedload(Candidate.sourced_by),
            joinedload(Candidate.assigned_to),
            joinedload(Candidate.call_logs).joinedload(CallLog.caller),
            joinedload(Candidate.assessment),
            joinedload(Candidate.consultant_mail).joinedload(ConsultantMail.sent_by),
            joinedload(Candidate.validation).joinedload(Validation.delivery_lead),
            joinedload(Candidate.submission).joinedload(Submission.delivery_lead),
            joinedload(Candidate.submission).joinedload(Submission.timeline).joinedload(SubmissionTimeline.updated_by),
        )
        .filter(Candidate.job_id == job.id)
        .order_by(Candidate.sourced_at)
        .all()
    )
    from infra.models import User as UserModel
    created_by = db.query(UserModel).get(job.created_by_id) if job.created_by_id else None
    return {
        "job_id":            job.id,
        "role_title":        job.role_title,
        "client_name":       job.client_name,
        "status":            job.status.value if job.status else None,
        "created_at":        _iso(job.created_at),
        "created_by":        created_by.name if created_by else None,
        "confirmed_at":      _iso(job.updated_at) if job.status == JobStatus.open else None,
        "delivery_lead":     job.delivery_lead.name    if job.delivery_lead    else None,
        "business_head":     job.business_head.name    if job.business_head    else None,
        "sourcer_names":     [],
        "caller_names":      [],
        "deadline":          _iso(job.deadline),
        "headcount":         job.headcount,
        "skill_stack":       job.skill_stack,
        "candidate_count":   len(candidates),
        "candidates":        [_candidate_story(c) for c in candidates],
    }


@router.get("/jobs")
def get_followup_jobs(
    db: Session  = Depends(get_db),
    current_user = Depends(get_current_user),
):
    role = current_user.role.value
    q = (
        db.query(Job)
        .options(
            joinedload(Job.delivery_lead),
            joinedload(Job.business_head),
        )
        .filter(Job.status != JobStatus.closed)
        .order_by(Job.created_at.desc())
    )

    if role == "recruiter":
        import json as _json
        all_jobs = q.all()
        uid = current_user.id
        jobs = []
        for j in all_jobs:
            sourcer_ids = _json.loads(j.sourcer_ids or '[]') if isinstance(j.sourcer_ids, str) else []
            caller_ids  = _json.loads(j.caller_ids  or '[]') if isinstance(j.caller_ids,  str) else []
            if uid in sourcer_ids or uid in caller_ids or j.assigned_sourcer_id == uid or j.assigned_caller_id == uid:
                jobs.append(j)
    elif role == "delivery_lead":
        jobs = q.filter(Job.delivery_lead_id == current_user.id).all()
    else:
        jobs = q.all()

    # Build sourcer_names / caller_names per job on-the-fly (same as _job_dict)
    from infra.models import User as UserModel
    import json as _json
    result = []
    for job in jobs:
        story = _job_story(db, job)
        s_ids = _json.loads(job.sourcer_ids or '[]') if isinstance(job.sourcer_ids, str) else []
        c_ids = _json.loads(job.caller_ids  or '[]') if isinstance(job.caller_ids,  str) else []
        story["sourcer_names"] = [u.name for uid in s_ids if (u := db.query(UserModel).get(uid))]
        story["caller_names"]  = [u.name for uid in c_ids if (u := db.query(UserModel).get(uid))]
        result.append(story)

    return result
