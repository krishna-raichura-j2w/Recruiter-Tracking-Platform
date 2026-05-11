from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from core.database import get_db
from core.deps import get_current_user, require_roles
from infra.models import ConsultantProfile, Candidate

router = APIRouter(prefix="/consultant-profile", tags=["consultant-profile"])

ALLOWED = ("delivery_lead", "admin")


class ConsultantProfileUpsert(BaseModel):
    resignation_acceptance: str | None = None
    replacement_kt_status: str | None = None
    personal_laptop: str | None = None
    role_responsibilities: str | None = None
    current_work_location: str | None = None
    client_work_location: str | None = None
    current_work_timings: str | None = None
    notice_negotiable_upto: str | None = None
    payroll: str | None = None
    offers_pipeline: str | None = None
    interview_pipeline: str | None = None
    dob: str | None = None
    telephonic_availability: str | None = None
    ide_installed: str | None = None
    wifi_connectivity: str | None = None
    marital_status: str | None = None
    health_issues: str | None = None
    planned_leaves: str | None = None
    interview_availability_2d: str | None = None
    upcoming_travel: str | None = None


@router.get("/{candidate_id}")
def get_consultant_profile(
    candidate_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_roles(*ALLOWED)),
):
    profile = db.query(ConsultantProfile).filter(
        ConsultantProfile.candidate_id == candidate_id
    ).first()
    if not profile:
        return {}
    return {col.name: getattr(profile, col.name) for col in profile.__table__.columns}


@router.post("/{candidate_id}")
def upsert_consultant_profile(
    candidate_id: int,
    body: ConsultantProfileUpsert,
    db: Session = Depends(get_db),
    _=Depends(require_roles(*ALLOWED)),
):
    # Verify candidate exists
    candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    profile = db.query(ConsultantProfile).filter(
        ConsultantProfile.candidate_id == candidate_id
    ).first()

    data = body.model_dump(exclude_none=True)

    if profile:
        for k, v in data.items():
            setattr(profile, k, v)
    else:
        profile = ConsultantProfile(candidate_id=candidate_id, **data)
        db.add(profile)

    db.commit()
    db.refresh(profile)
    return {col.name: getattr(profile, col.name) for col in profile.__table__.columns}


@router.patch("/{candidate_id}")
def patch_consultant_profile(
    candidate_id: int,
    body: ConsultantProfileUpsert,
    db: Session = Depends(get_db),
    _=Depends(require_roles(*ALLOWED)),
):
    return upsert_consultant_profile(candidate_id, body, db, _)
