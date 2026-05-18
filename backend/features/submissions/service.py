from sqlalchemy.orm import Session, joinedload
from infra.models import (
    Submission, SubmissionTimeline, Candidate, CandidateStatus, InterviewStage,
    to_iso_utc, isofy_datetimes,
)

TERMINAL_STAGES = {
    InterviewStage.ta_rejected,
    InterviewStage.hm_rejected,
    InterviewStage.l1_rejected,
    InterviewStage.l2_rejected,
    InterviewStage.final_rejected,
    InterviewStage.offer_declined,
    InterviewStage.joined,
    InterviewStage.no_show,
}

STAGE_LABELS = {
    "submitted":              "Submitted to Client",
    "ta_review":              "Client Review Pending",
    "ta_rejected":            "Client Rejected",
    "hm_review":              "HM Review",
    "hm_rejected":            "HM Rejected",
    "shortlisted":            "Shortlisted",
    "l1_scheduled":           "Interview Scheduled — L1",
    "l1_feedback_pending":    "L1 Feedback Received",
    "l1_cleared":             "L1 Cleared",
    "l1_rejected":            "L1 Rejected",
    "l2_scheduled":           "Interview Scheduled — L2",
    "l2_feedback_pending":    "L2 Feedback Received",
    "l2_cleared":             "L2 Cleared",
    "l2_rejected":            "L2 Rejected",
    "final_scheduled":        "Interview Scheduled — Final",
    "final_feedback_pending": "Final Feedback Received",
    "final_cleared":          "Final Cleared",
    "final_rejected":         "Final Rejected",
    "offer_rolled_out":       "Offer Rolled Out",
    "offer_accepted":         "Offer Accepted",
    "offer_declined":         "Offer Declined",
    "joined":                 "Joined",
    "no_show":                "No Show / Backed Out",
}


def _enrich(s: Submission) -> dict:
    base = {col.name: getattr(s, col.name) for col in s.__table__.columns}
    isofy_datetimes(base)
    c = s.candidate
    if c:
        base["candidate_name"]   = c.full_name
        base["candidate_mobile"] = c.mobile
        base["candidate_email"]  = c.email
        base["candidate_city"]   = c.city
        base["candidate_skills"] = c.skills
        base["exp_range"]        = c.exp_range
        if c.job:
            base["client_name"] = c.job.client_name
            base["job_title"]   = c.job.role_title
        if c.assessment:
            base["overall_score"]       = c.assessment.overall_score
            base["auto_recommendation"] = c.assessment.auto_recommendation
            base["current_ctc"]         = c.assessment.current_ctc
            base["expected_ctc"]        = c.assessment.expected_ctc
            base["hike_pct"]            = c.assessment.hike_pct
            base["notice_period_weeks"] = c.assessment.notice_period_weeks
            base["last_working_day"]    = c.assessment.last_working_day
            base["total_exp"]           = c.assessment.total_exp
            base["relevant_exp"]        = c.assessment.relevant_exp
        if c.assigned_to:
            base["assigned_to_name"] = c.assigned_to.name
    base["delivery_lead_name"] = s.delivery_lead.name if s.delivery_lead else None
    # Inline timeline
    base["timeline"] = [_timeline_row(t) for t in s.timeline]
    return base


def _timeline_row(t: SubmissionTimeline) -> dict:
    return {
        "id":             t.id,
        "stage":          t.stage,
        "stage_label":    t.stage_label or STAGE_LABELS.get(t.stage, t.stage),
        "interview_date": t.interview_date,
        "feedback":       t.feedback,
        "note":           t.note,
        "updated_by":     t.updated_by.name if t.updated_by else None,
        "created_at":     to_iso_utc(t.created_at),
    }


def _add_timeline(db: Session, submission_id: int, stage: str, updated_by_id: int | None,
                   interview_date: str | None = None, feedback: str | None = None,
                   note: str | None = None):
    entry = SubmissionTimeline(
        submission_id  = submission_id,
        stage          = stage,
        stage_label    = STAGE_LABELS.get(stage, stage),
        interview_date = interview_date,
        feedback       = feedback,
        note           = note,
        updated_by_id  = updated_by_id,
    )
    db.add(entry)


def _load(db: Session):
    return db.query(Submission).options(
        joinedload(Submission.candidate).joinedload(Candidate.job),
        joinedload(Submission.candidate).joinedload(Candidate.assessment),
        joinedload(Submission.candidate).joinedload(Candidate.assigned_to),
        joinedload(Submission.delivery_lead),
        joinedload(Submission.timeline).joinedload(SubmissionTimeline.updated_by),
    )


def list_validated_candidates(
    db: Session,
    kam_id: int | None = None,
    dl_id: int | None = None,
    search: str | None = None,
    skip: int = 0,
    limit: int = 0,
) -> tuple[list, int]:
    """Candidates validated, not yet submitted. KAM/DL each see only their own JDs."""
    q = db.query(Candidate).options(
        joinedload(Candidate.job),
        joinedload(Candidate.assessment),
        joinedload(Candidate.assigned_to),
        joinedload(Candidate.submission),
    ).filter(Candidate.status == CandidateStatus.validated)

    candidates = q.all()
    result = []
    sq = search.lower() if search else None
    for c in candidates:
        if c.submission:
            continue
        if kam_id and c.job and c.job.created_by_id != kam_id:
            continue
        if dl_id and c.job and c.job.delivery_lead_id != dl_id:
            continue
        if sq:
            haystack = ' '.join(filter(None, [
                c.full_name,
                c.job.client_name if c.job else None,
                c.job.role_title if c.job else None,
            ])).lower()
            if sq not in haystack:
                continue
        item = {col.name: getattr(c, col.name) for col in c.__table__.columns}
        isofy_datetimes(item)
        item["job_title"]        = c.job.role_title if c.job else None
        item["client_name"]      = c.job.client_name if c.job else None
        item["assigned_to_name"] = c.assigned_to.name if c.assigned_to else None
        if c.assessment:
            item["overall_score"]       = c.assessment.overall_score
            item["auto_recommendation"] = c.assessment.auto_recommendation
            item["current_ctc"]         = c.assessment.current_ctc
            item["expected_ctc"]        = c.assessment.expected_ctc
            item["hike_pct"]            = c.assessment.hike_pct
            item["notice_period_weeks"] = c.assessment.notice_period_weeks
            item["last_working_day"]    = c.assessment.last_working_day
            item["total_exp"]           = c.assessment.total_exp
            item["relevant_exp"]        = c.assessment.relevant_exp
        result.append(item)
    total = len(result)
    if limit > 0:
        result = result[skip:skip + limit]
    return result, total


def list_submissions(
    db: Session,
    kam_id: int | None = None,
    dl_id: int | None = None,
    closed: bool = False,
    search: str | None = None,
    skip: int = 0,
    limit: int = 0,
) -> tuple[list, int]:
    subs = _load(db).order_by(Submission.updated_at.desc()).all()
    if kam_id:
        subs = [s for s in subs if s.candidate and s.candidate.job and s.candidate.job.created_by_id == kam_id]
    if dl_id:
        subs = [s for s in subs if s.candidate and s.candidate.job and s.candidate.job.delivery_lead_id == dl_id]
    if closed:
        subs = [s for s in subs if s.current_stage in TERMINAL_STAGES]
    else:
        subs = [s for s in subs if s.current_stage not in TERMINAL_STAGES]
    if search:
        q = search.lower()
        subs = [s for s in subs if
                q in (s.candidate.full_name or '').lower() or
                q in (s.candidate.job.client_name if s.candidate and s.candidate.job else '').lower() or
                q in (s.candidate.job.role_title if s.candidate and s.candidate.job else '').lower()]
    total = len(subs)
    if limit > 0:
        subs = subs[skip:skip + limit]
    return [_enrich(s) for s in subs], total


def submit_to_client(db: Session, candidate_id: int, notes: str | None,
                     submitted_by_id: int) -> dict | None:
    candidate = db.query(Candidate).options(
        joinedload(Candidate.job),
        joinedload(Candidate.assessment),
        joinedload(Candidate.assigned_to),
    ).filter(Candidate.id == candidate_id).first()

    if not candidate:
        return None

    submission = db.query(Submission).filter(Submission.candidate_id == candidate_id).first()
    if not submission:
        submission = Submission(
            candidate_id     = candidate_id,
            job_id           = candidate.job_id,
            delivery_lead_id = submitted_by_id,
            last_notes       = notes,
            current_stage    = InterviewStage.submitted,
        )
        db.add(submission)
        db.flush()  # get submission.id

    candidate.status = CandidateStatus.submitted_to_client

    # First timeline entry
    _add_timeline(db, submission.id, "submitted", submitted_by_id, note=notes)
    db.commit()

    return _enrich(_load(db).filter(Submission.id == submission.id).first())


def update_stage(db: Session, submission_id: int, data: dict,
                 updated_by_id: int | None = None) -> dict | None:
    submission = _load(db).filter(Submission.id == submission_id).first()
    if not submission:
        return None

    new_stage = data.get("current_stage")

    for k, v in data.items():
        if v is not None:
            setattr(submission, k, v)

    # Sync candidate status
    if new_stage and submission.candidate:
        c = submission.candidate
        if new_stage in (InterviewStage.joined,):
            c.status = CandidateStatus.joined
        elif new_stage in (InterviewStage.offer_rolled_out,):
            c.status = CandidateStatus.offer_rolled_out
        elif new_stage in (InterviewStage.no_show, InterviewStage.offer_declined):
            c.status = CandidateStatus.backed_out
        else:
            c.status = CandidateStatus.interview_stage

    # Record timeline entry for every stage change — notes is compulsory
    if new_stage:
        _add_timeline(
            db, submission_id, new_stage, updated_by_id,
            interview_date = data.get("interview_date"),
            feedback       = data.get("feedback"),
            note           = data.get("notes") or data.get("last_notes"),
        )

    db.commit()

    # Notify DL of stage update; notify KAM if offer/join stage reached
    try:
        from features.notifications.service import push, push_to_role
        from infra.models import NotifType, UserRole
        cand_name = submission.candidate.full_name if submission.candidate else "Candidate"
        job_label = ""
        if submission.candidate and submission.candidate.job:
            j = submission.candidate.job
            job_label = f"{j.role_title} ({j.client_name})"
        stage_label = new_stage.replace("_", " ").title() if new_stage else "updated"
        if submission.delivery_lead_id:
            push(db, submission.delivery_lead_id,
                f"KAM updated {cand_name} to stage '{stage_label}' — {job_label}.",
                NotifType.stage_updated, entity_id=submission_id)
        db.commit()
    except Exception:
        pass

    return _enrich(_load(db).filter(Submission.id == submission_id).first())


def get_timeline(db: Session, submission_id: int) -> list:
    entries = db.query(SubmissionTimeline).options(
        joinedload(SubmissionTimeline.updated_by),
    ).filter(
        SubmissionTimeline.submission_id == submission_id,
    ).order_by(SubmissionTimeline.created_at).all()
    return [_timeline_row(t) for t in entries]
