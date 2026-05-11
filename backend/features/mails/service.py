from datetime import datetime, timezone
from sqlalchemy.orm import Session, joinedload
from infra.models import ConsultantMail, Candidate


def _enrich(m: ConsultantMail) -> dict:
    c = m.candidate
    d = {col.name: getattr(m, col.name) for col in m.__table__.columns}
    d["sent_at"] = m.sent_at.isoformat() if m.sent_at else None
    d["acknowledgement_at"] = m.acknowledgement_at.isoformat() if m.acknowledgement_at else None
    d["dl_verified_at"] = m.dl_verified_at.isoformat() if m.dl_verified_at else None
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
            d["assessment"] = {col.name: getattr(a, col.name) for col in a.__table__.columns}
        if c.consultant_profile:
            cp = c.consultant_profile
            d["consultant_profile"] = {col.name: getattr(cp, col.name) for col in cp.__table__.columns}
    d["sent_by_name"] = m.sent_by.name if m.sent_by else None
    return d


def _load(db: Session):
    return db.query(ConsultantMail).options(
        joinedload(ConsultantMail.candidate).joinedload(Candidate.job),
        joinedload(ConsultantMail.candidate).joinedload(Candidate.assessment),
        joinedload(ConsultantMail.candidate).joinedload(Candidate.consultant_profile),
        joinedload(ConsultantMail.sent_by),
    )


def mark_sent(db: Session, candidate_id: int, sent_by_id: int) -> dict:
    mail = db.query(ConsultantMail).filter(ConsultantMail.candidate_id == candidate_id).first()
    if not mail:
        mail = ConsultantMail(candidate_id=candidate_id, sent_by_id=sent_by_id)
        db.add(mail)
    else:
        mail.sent_at = datetime.now(timezone.utc)
        mail.sent_by_id = sent_by_id
    db.commit()
    return _enrich(_load(db).filter(ConsultantMail.candidate_id == candidate_id).first())


def list_mails(db: Session, sent_by_id: int | None = None) -> list:
    mails = _load(db).order_by(ConsultantMail.sent_at.desc()).all()
    if sent_by_id:
        mails = [m for m in mails if m.sent_by_id == sent_by_id]
    return [_enrich(m) for m in mails]


def update_mail(db: Session, mail_id: int, data: dict, updated_by_role: str) -> dict | None:
    mail = _load(db).filter(ConsultantMail.id == mail_id).first()
    if not mail:
        return None
    now = datetime.now(timezone.utc)
    if "exit_date" in data and data["exit_date"] is not None:
        mail.exit_date = data["exit_date"]
    if data.get("acknowledgement_received") is True:
        mail.acknowledgement_received = True
        mail.acknowledgement_at = now
    if data.get("dl_verified") is True and updated_by_role in ("delivery_lead", "admin"):
        mail.dl_verified = True
        mail.dl_verified_at = now
    db.commit()
    return _enrich(_load(db).filter(ConsultantMail.id == mail_id).first())
