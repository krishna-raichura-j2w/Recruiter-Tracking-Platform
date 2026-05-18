from sqlalchemy.orm import Session, joinedload
from infra.models import (
    Validation, Candidate, CandidateStatus, ValidationStatus, Notification, NotifType, UserRole
)
from features.notifications.service import push, push_to_role


def _pending_query(db: Session, validator_id: int | None = None):
    q = db.query(Candidate).options(
        joinedload(Candidate.assessment),
        joinedload(Candidate.assigned_to),
        joinedload(Candidate.assigned_validator),
        joinedload(Candidate.job),
    ).filter(Candidate.status == CandidateStatus.ready_for_validation)
    if validator_id:
        q = q.filter(Candidate.assigned_validator_id == validator_id)
    return q.order_by(Candidate.updated_at.desc())


def list_pending(db: Session, skip: int = 0, limit: int = 0):
    q = _pending_query(db)
    total = db.query(Candidate.id).filter(Candidate.status == CandidateStatus.ready_for_validation).count()
    if limit > 0:
        return q.offset(skip).limit(limit).all(), total
    return q.all(), total


def list_pending_for_validator(db: Session, validator_id: int, skip: int = 0, limit: int = 0):
    q = _pending_query(db, validator_id)
    total = db.query(Candidate.id).filter(
        Candidate.assigned_validator_id == validator_id,
        Candidate.status == CandidateStatus.ready_for_validation,
    ).count()
    if limit > 0:
        return q.offset(skip).limit(limit).all(), total
    return q.all(), total


def list_all_for_validator(db: Session) -> list:
    return db.query(Validation).options(
        joinedload(Validation.candidate),
        joinedload(Validation.validator),
    ).order_by(Validation.updated_at.desc()).all()


def validate_candidate(db: Session, data: dict, validator_id: int, validator_name: str = "") -> Validation:
    candidate_id = data["candidate_id"]
    vstatus = data["status"]
    comments = data.get("comments")
    submitted_to_client = data.get("submitted_to_client")
    submission_date = data.get("submission_date")

    validation = db.query(Validation).filter(Validation.candidate_id == candidate_id).first()
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
            job = candidate.job
            job_label = f"{job.role_title} ({job.client_name})" if job else ""
            # Notify assigned caller
            if candidate.assigned_to_id:
                push(db, candidate.assigned_to_id,
                    f"{candidate.full_name} has been validated and is ready for client submission — {job_label}.",
                    NotifType.validation_done, entity_id=candidate_id)
            # Notify all KAMs to submit to client
            push_to_role(db, UserRole.kam,
                f"Candidate validated: {candidate.full_name} for {job_label}. Ready to submit to client.",
                NotifType.candidate_validated, entity_id=candidate_id)
        elif vstatus == ValidationStatus.needs_review:
            candidate.status = CandidateStatus.needs_rework
        elif vstatus == ValidationStatus.on_hold:
            candidate.status = CandidateStatus.on_hold
        elif vstatus == ValidationStatus.rejected:
            candidate.status = CandidateStatus.rejected
            if comments:
                candidate.rejection_reason = comments
            candidate.rejected_by = f"Delivery Lead: {validator_name}" if validator_name else "Delivery Lead"

    db.commit()
    db.refresh(validation)
    return validation
