from datetime import datetime

from infra.models import (
    Candidate,
    CandidateStatus,
    ConsultantMail,
    Drive,
    DriveTrackerStage,
    Job,
    NotifType,
    UserRole,
    Validation,
    ValidationStatus,
    now_utc,
)
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from features.mrr.notifications.service import push, push_to_role


def _parse_date(s: str | None):
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        try:
            return datetime.strptime(s, "%Y-%m-%d")
        except Exception:
            return None


def _apply_filters(
    q,
    *,
    search=None,
    client_name=None,
    business_head_id=None,
    kam_id=None,
    delivery_lead_id=None,
    validator_id=None,
    from_date=None,
    to_date=None,
):
    """Apply optional admin filters to a Candidate query. Joins Job lazily."""
    from sqlalchemy import or_

    needs_job_join = any(
        v is not None
        for v in (client_name, business_head_id, kam_id, delivery_lead_id, search)
    )
    if needs_job_join:
        q = q.join(Job, Candidate.job_id == Job.id)
        if client_name:
            q = q.filter(func.lower(Job.client_name) == client_name.strip().lower())
        if business_head_id:
            q = q.filter(Job.account_manager_id == business_head_id)
        if kam_id:
            q = q.filter(Job.created_by_id == kam_id)
        if delivery_lead_id:
            q = q.filter(Job.delivery_lead_id == delivery_lead_id)
        if search:
            s = f"%{search.lower()}%"
            q = q.filter(
                or_(
                    func.lower(Candidate.full_name).like(s),
                    func.lower(Candidate.current_company).like(s),
                    func.lower(Job.client_name).like(s),
                    func.lower(Job.role_title).like(s),
                ),
            )
    elif search:
        s = f"%{search.lower()}%"
        q = q.filter(
            or_(
                func.lower(Candidate.full_name).like(s),
                func.lower(Candidate.current_company).like(s),
            ),
        )
    if validator_id:
        q = q.filter(Candidate.assigned_validator_id == validator_id)
    if from_date:
        d = _parse_date(from_date)
        if d:
            q = q.filter(Candidate.updated_at >= d)
    if to_date:
        d = _parse_date(to_date)
        if d:
            # to_date is inclusive — extend by one day to include same-day events
            from datetime import timedelta

            q = q.filter(Candidate.updated_at < d + timedelta(days=1))
    return q


def _pending_query(
    db: Session,
    validator_id: int | None = None,
    search: str | None = None,
    **filters,
):
    q = (
        db.query(Candidate)
        .options(
            joinedload(Candidate.assessment),
            joinedload(Candidate.assigned_to),
            joinedload(Candidate.assigned_validator),
            joinedload(Candidate.job),
            joinedload(Candidate.validation).joinedload(Validation.delivery_lead),
        )
        .filter(Candidate.status == CandidateStatus.ready_for_validation)
    )
    if validator_id:
        q = q.filter(Candidate.assigned_validator_id == validator_id)
    q = _apply_filters(q, search=search, **filters)
    return q.order_by(Candidate.updated_at.desc())


def list_pending_for_dl(
    db: Session,
    dl_id: int,
    skip: int = 0,
    limit: int = 0,
    search: str | None = None,
    **filters,
):
    """
    Validation queue visible to a DL: all ready_for_validation candidates whose job
    belongs to ANY DL in the same pod. This lets every pod DL validate any profile.
    Candidates personally sourced or called by the requesting DL are excluded.
    """
    from infra.models import Job as _Job, User as _User, UserRole
    from sqlalchemy import cast, func, or_
    from sqlalchemy.dialects.postgresql import JSONB

    # Resolve the pod this DL belongs to.
    dl_user = db.query(_User.pod_id).filter(_User.id == dl_id).scalar()
    pod_id = dl_user  # pod_id column value

    if pod_id:
        # All DL ids in the same pod (including the requesting DL).
        pod_dl_ids = [
            row[0]
            for row in db.query(_User.id).filter(
                _User.pod_id == pod_id,
                _User.role == UserRole.delivery_lead,
                _User.is_active == True,  # noqa: E712
            ).all()
        ]
    else:
        pod_dl_ids = [dl_id]

    # Collect job IDs owned by any DL in the pod.
    or_clauses = []
    for did in pod_dl_ids:
        or_clauses.append(_Job.delivery_lead_id == did)
        or_clauses.append(
            cast(func.coalesce(_Job.delivery_lead_ids, "[]"), JSONB).op("@>")(
                cast(f"[{did}]", JSONB)
            )
        )

    pod_job_ids = [
        row[0]
        for row in db.query(_Job.id).filter(or_(*or_clauses)).all()
    ]

    if not pod_job_ids:
        return [], 0

    q = (
        db.query(Candidate)
        .options(
            joinedload(Candidate.assessment),
            joinedload(Candidate.assigned_to),
            joinedload(Candidate.assigned_validator),
            joinedload(Candidate.job),
            joinedload(Candidate.validation).joinedload(Validation.delivery_lead),
        )
        .filter(
            Candidate.status == CandidateStatus.ready_for_validation,
            Candidate.job_id.in_(pod_job_ids),
            # Requesting DL must not validate profiles they personally sourced/called.
            Candidate.sourced_by_id != dl_id,
            Candidate.assigned_to_id != dl_id,
        )
    )
    q = _apply_filters(q, search=search, **filters)
    q = q.order_by(Candidate.updated_at.desc())
    total = q.with_entities(func.count(Candidate.id)).order_by(None).scalar() or 0
    if limit > 0:
        return q.offset(skip).limit(limit).all(), total
    return q.all(), total


def list_pending(
    db: Session,
    skip: int = 0,
    limit: int = 0,
    search: str | None = None,
    **filters,
):
    q = _pending_query(db, search=search, **filters)
    total = q.with_entities(func.count(Candidate.id)).order_by(None).scalar() or 0
    if limit > 0:
        return q.offset(skip).limit(limit).all(), total
    return q.all(), total


def list_pending_for_validator(
    db: Session,
    validator_id: int,
    skip: int = 0,
    limit: int = 0,
    search: str | None = None,
    **filters,
):
    q = _pending_query(db, validator_id, search=search, **filters)
    # A validator must not validate candidates they personally sourced or called
    q = q.filter(
        Candidate.sourced_by_id != validator_id,
        Candidate.assigned_to_id != validator_id,
    )
    total = q.with_entities(func.count(Candidate.id)).order_by(None).scalar() or 0
    if limit > 0:
        return q.offset(skip).limit(limit).all(), total
    return q.all(), total


def list_all_for_validator(db: Session) -> list:
    return (
        db.query(Validation)
        .options(
            joinedload(Validation.candidate),
            joinedload(Validation.validator),
        )
        .order_by(Validation.updated_at.desc())
        .all()
    )


def validate_candidate(
    db: Session,
    data: dict,
    validator_id: int,
    validator_name: str = "",
) -> Validation:
    candidate_id = data["candidate_id"]
    vstatus = data["status"]
    comments = data.get("comments")
    submitted_to_client = data.get("submitted_to_client")
    submission_date = data.get("submission_date")

    validation = (
        db.query(Validation).filter(Validation.candidate_id == candidate_id).first()
    )
    if validation:
        validation.status = vstatus
        validation.comments = comments
        validation.delivery_lead_id = validator_id
        if submitted_to_client is not None:
            validation.submitted_to_client = submitted_to_client
        if submission_date is not None:
            validation.submission_date = submission_date
    else:
        validation = Validation(
            candidate_id=candidate_id,
            delivery_lead_id=validator_id,
            status=vstatus,
            comments=comments,
            submitted_to_client=submitted_to_client,
            submission_date=submission_date,
        )
        db.add(validation)

    candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if candidate:
        if vstatus == ValidationStatus.validated:
            candidate.status = CandidateStatus.validated
            candidate.dl_verified = True
            # Mark consultant mail as DL-verified if a mail record exists
            mail = (
                db.query(ConsultantMail)
                .filter(ConsultantMail.candidate_id == candidate_id)
                .first()
            )
            if mail and not mail.dl_verified:
                mail.dl_verified = True
                mail.dl_verified_at = now_utc()
            job = candidate.job
            job_label = f"{job.role_title} ({job.client_name})" if job else ""
            # Notify assigned caller
            if candidate.assigned_to_id:
                push(
                    db,
                    candidate.assigned_to_id,
                    f"{candidate.full_name} has been validated and is ready for client submission — {job_label}.",
                    NotifType.validation_done,
                    entity_id=candidate_id,
                )
            # Notify all KAMs to submit to client
            push_to_role(
                db,
                UserRole.kam,
                f"Candidate validated: {candidate.full_name} for {job_label}. Ready to submit to client.",
                NotifType.candidate_validated,
                entity_id=candidate_id,
            )
        elif vstatus == ValidationStatus.needs_review:
            candidate.status = CandidateStatus.needs_rework
        elif vstatus == ValidationStatus.on_hold:
            candidate.status = CandidateStatus.on_hold
        elif vstatus == ValidationStatus.rejected:
            candidate.status = CandidateStatus.rejected
            if comments:
                candidate.rejection_reason = comments
            candidate.rejected_by = (
                f"Delivery Lead: {validator_name}"
                if validator_name
                else "Delivery Lead"
            )

    db.commit()
    db.refresh(validation)

    # Auto-link a freshly validated candidate into their walk-in/drive lineup.
    # Runs in its own transaction AFTER the validation commit so a drive-linking
    # hiccup can never undo the validation. Only acts on drive jobs and never
    # clobbers a candidate already added to a drive (drive_id already set).
    if candidate and vstatus == ValidationStatus.validated and candidate.drive_id is None:
        try:
            job = candidate.job
            if job and (job.walkin or job.drive):
                drive = (
                    db.query(Drive).filter(Drive.job_id == candidate.job_id).first()
                )
                if drive is None:
                    from features.mrr.drives.service import ensure_drive_for_job

                    drive = ensure_drive_for_job(db, job)
                if drive is not None:
                    candidate.drive_id = drive.id
                    candidate.drive_tracker_stage = DriveTrackerStage.confirmed
                    db.commit()
        except Exception:
            db.rollback()

    return validation
