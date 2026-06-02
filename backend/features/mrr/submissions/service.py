import json as _json

from infra.models import (
    Candidate,
    CandidateStatus,
    InterviewStage,
    Submission,
    SubmissionTimeline,
    isofy_datetimes,
    to_iso_utc,
)
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload


def _dl_owns_job(job, dl_id: int) -> bool:
    """Return True if dl_id is assigned to this job (primary or multi-DL array)."""
    dl_ids = (
        _json.loads(job.delivery_lead_ids or "[]")
        if isinstance(job.delivery_lead_ids, str)
        else (job.delivery_lead_ids or [])
    )
    return job.delivery_lead_id == dl_id or dl_id in dl_ids


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
    "submitted": "Submitted to Client",
    "ta_review": "Client Review Pending",
    "ta_rejected": "Client Rejected",
    "hm_review": "HM Review",
    "hm_rejected": "HM Rejected",
    "shortlisted": "Shortlisted",
    "l1_scheduled": "Interview Scheduled — L1",
    "l1_feedback_pending": "L1 Feedback Received",
    "l1_cleared": "L1 Cleared",
    "l1_rejected": "L1 Rejected",
    "l2_scheduled": "Interview Scheduled — L2",
    "l2_feedback_pending": "L2 Feedback Received",
    "l2_cleared": "L2 Cleared",
    "l2_rejected": "L2 Rejected",
    "final_scheduled": "Interview Scheduled — Final",
    "final_feedback_pending": "Final Feedback Received",
    "final_cleared": "Final Cleared",
    "final_rejected": "Final Rejected",
    "offer_rolled_out": "Offer Rolled Out",
    "offer_accepted": "Offer Accepted",
    "offer_declined": "Offer Declined",
    "joined": "Joined",
    "no_show": "No Show / Backed Out",
}


def _enrich(s: Submission) -> dict:
    base = {col.name: getattr(s, col.name) for col in s.__table__.columns}
    isofy_datetimes(base)
    c = s.candidate
    if c:
        base["candidate_name"] = c.full_name
        base["candidate_mobile"] = c.mobile
        base["candidate_email"] = c.email
        base["candidate_city"] = c.city
        base["candidate_skills"] = c.skills
        base["exp_range"] = c.exp_range
        if c.job:
            base["client_name"] = c.job.client_name
            base["job_title"] = c.job.role_title
        if c.assessment:
            base["overall_score"] = c.assessment.overall_score
            base["auto_recommendation"] = c.assessment.auto_recommendation
            base["current_ctc"] = c.assessment.current_ctc
            base["expected_ctc"] = c.assessment.expected_ctc
            base["hike_pct"] = c.assessment.hike_pct
            base["notice_period_weeks"] = c.assessment.notice_period_weeks
            base["last_working_day"] = c.assessment.last_working_day
            base["total_exp"] = c.assessment.total_exp
            base["relevant_exp"] = c.assessment.relevant_exp
        if c.assigned_to:
            base["assigned_to_name"] = c.assigned_to.name
    base["delivery_lead_name"] = s.delivery_lead.name if s.delivery_lead else None
    # Inline timeline
    base["timeline"] = [_timeline_row(t) for t in s.timeline]
    return base


def _timeline_row(t: SubmissionTimeline) -> dict:
    return {
        "id": t.id,
        "stage": t.stage,
        "stage_label": t.stage_label or STAGE_LABELS.get(t.stage, t.stage),
        "interview_date": t.interview_date,
        "feedback": t.feedback,
        "note": t.note,
        "updated_by": t.updated_by.name if t.updated_by else None,
        "created_at": to_iso_utc(t.created_at),
    }


def _add_timeline(
    db: Session,
    submission_id: int,
    stage: str,
    updated_by_id: int | None,
    interview_date: str | None = None,
    feedback: str | None = None,
    note: str | None = None,
):
    entry = SubmissionTimeline(
        submission_id=submission_id,
        stage=stage,
        stage_label=STAGE_LABELS.get(stage, stage),
        interview_date=interview_date,
        feedback=feedback,
        note=note,
        updated_by_id=updated_by_id,
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


def _parse_date(s):
    if not s:
        return None
    from datetime import datetime

    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        try:
            return datetime.strptime(s, "%Y-%m-%d")
        except Exception:
            return None


def list_validated_candidates(
    db: Session,
    kam_id: int | None = None,
    dl_id: int | None = None,
    search: str | None = None,
    # Admin-facing filters
    client_name: str | None = None,
    business_head_id: int | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
    skip: int = 0,
    limit: int = 0,
) -> tuple[list, int]:
    """Candidates validated, not yet submitted. KAM/DL each see only their own JDs."""
    from datetime import timedelta

    from infra.models import Job as _Job, Submission as _Sub
    from sqlalchemy import cast, or_
    from sqlalchemy.dialects.postgresql import JSONB

    # Lightweight filter query — only fetches candidate IDs
    filter_q = (
        db.query(Candidate.id)
        .outerjoin(_Sub, Candidate.id == _Sub.candidate_id)
        .join(_Job, Candidate.job_id == _Job.id)
        .filter(
            Candidate.status == CandidateStatus.validated,
            _Sub.id == None,  # noqa: E711 — not yet submitted
        )
    )

    if kam_id:
        filter_q = filter_q.filter(_Job.created_by_id == kam_id)
    if dl_id:
        filter_q = filter_q.filter(
            or_(
                _Job.delivery_lead_id == dl_id,
                cast(func.coalesce(_Job.delivery_lead_ids, "[]"), JSONB).op("@>")(cast(f"[{dl_id}]", JSONB)),
            )
        )
    if client_name:
        filter_q = filter_q.filter(
            func.lower(_Job.client_name) == client_name.strip().lower()
        )
    if business_head_id:
        filter_q = filter_q.filter(_Job.account_manager_id == business_head_id)

    fd = _parse_date(from_date)
    td = _parse_date(to_date)
    if fd:
        filter_q = filter_q.filter(
            Candidate.updated_at >= fd.replace(tzinfo=None)
        )
    if td:
        filter_q = filter_q.filter(
            Candidate.updated_at < (td + timedelta(days=1)).replace(tzinfo=None)
        )
    if search:
        s = f"%{search.lower()}%"
        filter_q = filter_q.filter(
            or_(
                func.lower(Candidate.full_name).like(s),
                func.lower(_Job.client_name).like(s),
                func.lower(_Job.role_title).like(s),
            )
        )

    filter_q = filter_q.order_by(Candidate.updated_at.desc())
    total = filter_q.count()

    if limit > 0:
        cand_ids = [row[0] for row in filter_q.offset(skip).limit(limit).all()]
    else:
        cand_ids = [row[0] for row in filter_q.all()]

    if not cand_ids:
        return [], total

    id_order = {cid: i for i, cid in enumerate(cand_ids)}
    candidates = (
        db.query(Candidate)
        .options(
            joinedload(Candidate.job),
            joinedload(Candidate.assessment),
            joinedload(Candidate.assigned_to),
            joinedload(Candidate.submission),
        )
        .filter(Candidate.id.in_(cand_ids))
        .all()
    )
    candidates.sort(key=lambda c: id_order.get(c.id, 0))

    result = []
    for c in candidates:
        item = {col.name: getattr(c, col.name) for col in c.__table__.columns}
        isofy_datetimes(item)
        item["job_title"] = c.job.role_title if c.job else None
        item["client_name"] = c.job.client_name if c.job else None
        item["assigned_to_name"] = c.assigned_to.name if c.assigned_to else None
        if c.assessment:
            item["overall_score"] = c.assessment.overall_score
            item["auto_recommendation"] = c.assessment.auto_recommendation
            item["current_ctc"] = c.assessment.current_ctc
            item["expected_ctc"] = c.assessment.expected_ctc
            item["hike_pct"] = c.assessment.hike_pct
            item["notice_period_weeks"] = c.assessment.notice_period_weeks
            item["last_working_day"] = c.assessment.last_working_day
            item["total_exp"] = c.assessment.total_exp
            item["relevant_exp"] = c.assessment.relevant_exp
        result.append(item)
    return result, total


def list_submissions(
    db: Session,
    kam_id: int | None = None,
    dl_id: int | None = None,
    closed: bool = False,
    search: str | None = None,
    # Admin-facing filters
    client_name: str | None = None,
    business_head_id: int | None = None,
    delivery_lead_id: int | None = None,
    kam_filter_id: int | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
    skip: int = 0,
    limit: int = 0,
) -> tuple[list, int]:
    from datetime import timedelta

    from infra.models import Job as _Job
    from sqlalchemy import cast, func, or_
    from sqlalchemy.dialects.postgresql import JSONB

    # Lightweight ID-filter query — avoids loading full ORM graph before pagination
    filter_q = (
        db.query(Submission.id)
        .join(Candidate, Submission.candidate_id == Candidate.id)
        .join(_Job, Candidate.job_id == _Job.id)
    )

    if kam_id:
        filter_q = filter_q.filter(_Job.created_by_id == kam_id)
    if dl_id:
        filter_q = filter_q.filter(
            or_(
                _Job.delivery_lead_id == dl_id,
                cast(func.coalesce(_Job.delivery_lead_ids, "[]"), JSONB).op("@>")(cast(f"[{dl_id}]", JSONB)),
            )
        )
    if client_name:
        filter_q = filter_q.filter(
            func.lower(_Job.client_name) == client_name.strip().lower()
        )
    if business_head_id:
        filter_q = filter_q.filter(_Job.account_manager_id == business_head_id)
    if delivery_lead_id:
        filter_q = filter_q.filter(
            or_(
                _Job.delivery_lead_id == int(delivery_lead_id),
                cast(func.coalesce(_Job.delivery_lead_ids, "[]"), JSONB).op("@>")(
                    cast(f"[{int(delivery_lead_id)}]", JSONB)
                ),
            )
        )
    if kam_filter_id:
        filter_q = filter_q.filter(_Job.created_by_id == kam_filter_id)

    fd = _parse_date(from_date)
    td = _parse_date(to_date)
    if fd:
        filter_q = filter_q.filter(
            Submission.updated_at >= fd.replace(tzinfo=None)
        )
    if td:
        filter_q = filter_q.filter(
            Submission.updated_at < (td + timedelta(days=1)).replace(tzinfo=None)
        )

    terminal_values = [s.value for s in TERMINAL_STAGES]
    if closed:
        filter_q = filter_q.filter(Submission.current_stage.in_(terminal_values))
    else:
        filter_q = filter_q.filter(Submission.current_stage.notin_(terminal_values))

    if search:
        s = f"%{search.lower()}%"
        filter_q = filter_q.filter(
            or_(
                func.lower(Candidate.full_name).like(s),
                func.lower(_Job.client_name).like(s),
                func.lower(_Job.role_title).like(s),
            )
        )

    filter_q = filter_q.order_by(Submission.updated_at.desc())
    total = filter_q.count()

    if limit > 0:
        sub_ids = [row[0] for row in filter_q.offset(skip).limit(limit).all()]
    else:
        sub_ids = [row[0] for row in filter_q.all()]

    if not sub_ids:
        return [], total

    id_order = {sid: i for i, sid in enumerate(sub_ids)}
    subs = (
        _load(db)
        .filter(Submission.id.in_(sub_ids))
        .all()
    )
    subs.sort(key=lambda s: id_order.get(s.id, 0))
    return [_enrich(s) for s in subs], total


def submit_to_client(
    db: Session,
    candidate_id: int,
    notes: str | None,
    submitted_by_id: int,
) -> dict | None:
    candidate = (
        db.query(Candidate)
        .options(
            joinedload(Candidate.job),
            joinedload(Candidate.assessment),
            joinedload(Candidate.assigned_to),
        )
        .filter(Candidate.id == candidate_id)
        .first()
    )

    if not candidate:
        return None

    submission = (
        db.query(Submission).filter(Submission.candidate_id == candidate_id).first()
    )
    if not submission:
        submission = Submission(
            candidate_id=candidate_id,
            job_id=candidate.job_id,
            delivery_lead_id=submitted_by_id,
            last_notes=notes,
            current_stage=InterviewStage.submitted,
        )
        db.add(submission)
        db.flush()  # get submission.id

    candidate.status = CandidateStatus.submitted_to_client

    # First timeline entry
    _add_timeline(db, submission.id, "submitted", submitted_by_id, note=notes)
    db.commit()

    return _enrich(_load(db).filter(Submission.id == submission.id).first())


def update_stage(
    db: Session,
    submission_id: int,
    data: dict,
    updated_by_id: int | None = None,
) -> dict | None:
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
            db,
            submission_id,
            new_stage,
            updated_by_id,
            interview_date=data.get("interview_date"),
            feedback=data.get("feedback"),
            note=data.get("notes") or data.get("last_notes"),
        )

    db.commit()

    # Notify DL of stage update; notify KAM if offer/join stage reached
    try:
        from infra.models import NotifType

        from features.mrr.notifications.service import push

        cand_name = (
            submission.candidate.full_name if submission.candidate else "Candidate"
        )
        job_label = ""
        if submission.candidate and submission.candidate.job:
            j = submission.candidate.job
            job_label = f"{j.role_title} ({j.client_name})"
        stage_label = new_stage.replace("_", " ").title() if new_stage else "updated"
        if submission.delivery_lead_id:
            push(
                db,
                submission.delivery_lead_id,
                f"KAM updated {cand_name} to stage '{stage_label}' — {job_label}.",
                NotifType.stage_updated,
                entity_id=submission_id,
            )
        db.commit()
    except Exception:
        pass

    return _enrich(_load(db).filter(Submission.id == submission_id).first())


def get_timeline(db: Session, submission_id: int) -> list:
    entries = (
        db.query(SubmissionTimeline)
        .options(
            joinedload(SubmissionTimeline.updated_by),
        )
        .filter(
            SubmissionTimeline.submission_id == submission_id,
        )
        .order_by(SubmissionTimeline.created_at)
        .all()
    )
    return [_timeline_row(t) for t in entries]
