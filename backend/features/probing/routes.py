from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from core.database import get_db
from core.deps import get_current_user
from infra.models import ProbingData, to_iso_utc

router = APIRouter(prefix="/probing", tags=["probing"])


class ProbingCreate(BaseModel):
    job_id: int | None = None
    reporting_manager_location: str | None = None
    onsite_opportunities: str | None = None
    project_size: str | None = None
    project_count: str | None = None
    work_mode: str | None = None
    candidate_role: str | None = None
    feedback_eta: str | None = None
    work_location: str | None = None
    interview_type: str | None = None
    role_clarity: str | None = None
    notice_period: str | None = None
    interview_rounds_count: str | None = None
    urgency_eta: str | None = None
    skill_type: str | None = None


def _to_dict(row: ProbingData) -> dict:
    d = {c.name: getattr(row, c.name) for c in ProbingData.__table__.columns}
    for k in ("created_at", "updated_at"):
        if hasattr(d.get(k), "isoformat"):
            d[k] = to_iso_utc(d[k])
    return d


@router.post("")
def create_probing(
    body: ProbingCreate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    row = ProbingData(
        **body.model_dump(),
        created_by_id=current_user.id,
        email_id=current_user.email,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _to_dict(row)


@router.get("/{probing_id}")
def get_probing(
    probing_id: int,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    row = db.query(ProbingData).filter(ProbingData.id == probing_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Probing record not found")
    return _to_dict(row)


@router.patch("/{probing_id}")
def update_probing(
    probing_id: int,
    body: ProbingCreate,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    row = db.query(ProbingData).filter(ProbingData.id == probing_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Probing record not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return _to_dict(row)
