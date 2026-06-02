from datetime import datetime, timezone

from infra.models import (
    Candidate,
    CandidateStatus,
    ConsultantMail,
    isofy_datetimes,
    to_iso_utc,
)
from infra.s3 import to_viewable_url
from sqlalchemy.orm import Session, joinedload

# Statuses that are "past" ready_for_validation — don't rewind them
_POST_VALIDATION_STATUSES = {
    CandidateStatus.validated,
    CandidateStatus.submitted_to_client,
    CandidateStatus.interview_stage,
    CandidateStatus.offer_rolled_out,
    CandidateStatus.joined,
    CandidateStatus.backed_out,
    CandidateStatus.rejected,
}


def _enrich(m: ConsultantMail) -> dict:
    c = m.candidate
    d = {col.name: getattr(m, col.name) for col in m.__table__.columns}
    isofy_datetimes(d)
    d["sent_at"] = to_iso_utc(m.sent_at)
    d["acknowledgement_at"] = to_iso_utc(m.acknowledgement_at)
    d["dl_verified_at"] = to_iso_utc(m.dl_verified_at)
    if c:
        d["candidate_name"] = c.full_name
        d["candidate_mobile"] = c.mobile
        d["candidate_email"] = c.email
        d["client_name"] = c.job.client_name if c.job else None
        d["job_title"] = c.job.role_title if c.job else None
        d["status"] = c.status.value if c.status else None
        d["assessment"] = None
        d["consultant_profile"] = None
        if c.assessment:
            a = c.assessment
            d["assessment"] = isofy_datetimes(
                {col.name: getattr(a, col.name) for col in a.__table__.columns},
            )
        if c.consultant_profile:
            cp = c.consultant_profile
            d["consultant_profile"] = isofy_datetimes(
                {col.name: getattr(cp, col.name) for col in cp.__table__.columns},
            )
    d["sent_by_name"] = m.sent_by.name if m.sent_by else None
    d["exit_proof"] = to_viewable_url(d.get("exit_proof"))
    return d


def _load(db: Session):
    return db.query(ConsultantMail).options(
        joinedload(ConsultantMail.candidate).joinedload(Candidate.job),
        joinedload(ConsultantMail.candidate).joinedload(Candidate.assessment),
        joinedload(ConsultantMail.candidate).joinedload(Candidate.consultant_profile),
        joinedload(ConsultantMail.sent_by),
    )


def mark_sent(db: Session, candidate_id: int, sent_by_id: int) -> dict:
    mail = (
        db.query(ConsultantMail)
        .filter(ConsultantMail.candidate_id == candidate_id)
        .first()
    )
    if not mail:
        mail = ConsultantMail(candidate_id=candidate_id, sent_by_id=sent_by_id)
        db.add(mail)
    else:
        mail.sent_at = datetime.now(timezone.utc)
        mail.sent_by_id = sent_by_id
    db.commit()
    return _enrich(
        _load(db).filter(ConsultantMail.candidate_id == candidate_id).first(),
    )


def list_mails(
    db: Session,
    sent_by_id: int | None = None,
    search: str | None = None,
    skip: int = 0,
    limit: int = 0,
) -> tuple[list, int]:
    from infra.models import Job as _Job
    from sqlalchemy import func, or_

    # Lightweight ID-filter query
    filter_q = db.query(ConsultantMail.id).order_by(ConsultantMail.sent_at.desc())

    if sent_by_id:
        filter_q = filter_q.filter(ConsultantMail.sent_by_id == sent_by_id)

    if search:
        s = f"%{search.lower()}%"
        filter_q = (
            filter_q
            .join(Candidate, ConsultantMail.candidate_id == Candidate.id)
            .join(_Job, Candidate.job_id == _Job.id)
            .filter(
                or_(
                    func.lower(Candidate.full_name).like(s),
                    func.lower(_Job.client_name).like(s),
                    func.lower(_Job.role_title).like(s),
                )
            )
        )

    total = filter_q.count()
    if limit > 0:
        mail_ids = [row[0] for row in filter_q.offset(skip).limit(limit).all()]
    else:
        mail_ids = [row[0] for row in filter_q.all()]

    if not mail_ids:
        return [], total

    id_order = {mid: i for i, mid in enumerate(mail_ids)}
    mails = (
        _load(db)
        .filter(ConsultantMail.id.in_(mail_ids))
        .all()
    )
    mails.sort(key=lambda m: id_order.get(m.id, 0))
    return [_enrich(m) for m in mails], total


def update_mail(
    db: Session,
    mail_id: int,
    data: dict,
    updated_by_role: str,
) -> dict | None:
    mail = _load(db).filter(ConsultantMail.id == mail_id).first()
    if not mail:
        return None
    now = datetime.now(timezone.utc)
    if "exit_date" in data and data["exit_date"] is not None:
        mail.exit_date = data["exit_date"]
    if data.get("acknowledgement_received") is True:
        mail.acknowledgement_received = True
        mail.acknowledgement_at = now
        # Move candidate into validation queue so DL can review
        candidate = (
            db.query(Candidate).filter(Candidate.id == mail.candidate_id).first()
        )
        if candidate and candidate.status not in _POST_VALIDATION_STATUSES:
            candidate.status = CandidateStatus.ready_for_validation
            # The validator is the JOB's delivery lead. Fall back to sender's
            # pod allocation only when the job has no DL assigned.
            if not candidate.assigned_validator_id:
                from infra.models import User, UserRole

                validator = None
                job = candidate.job
                if job and job.delivery_lead_id:
                    validator = (
                        db.query(User)
                        .filter(
                            User.id == job.delivery_lead_id,
                            User.role == UserRole.delivery_lead,
                            User.is_active == True,  # noqa: E712
                        )
                        .first()
                    )
                if not validator and mail.sent_by_id:
                    sender = db.query(User).filter(User.id == mail.sent_by_id).first()
                    pod_lead_id = sender.pod_lead_id if sender else None
                    if pod_lead_id:
                        from features.mrr.allocation.service import get_min_load

                        validator = get_min_load(
                            db,
                            pod_lead_id,
                            UserRole.delivery_lead,
                        )
                        if not validator:
                            validator = (
                                db.query(User)
                                .filter(
                                    User.id == pod_lead_id,
                                    User.role == UserRole.delivery_lead,
                                )
                                .first()
                            )
                if validator:
                    candidate.assigned_validator_id = validator.id
    if data.get("dl_verified") is True and updated_by_role in (
        "delivery_lead",
        "admin",
    ):
        mail.dl_verified = True
        mail.dl_verified_at = now
    if "exit_proof" in data and data["exit_proof"] is not None:
        mail.exit_proof = data["exit_proof"]
    db.commit()
    return _enrich(_load(db).filter(ConsultantMail.id == mail_id).first())
