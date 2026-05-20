from core.pagination import PageResult, paginate
from fastapi import HTTPException
from infra.hrbp_models import HRBPNpsSurvey
from sqlalchemy.orm import Session

from features.hrbp.nps_surveys.schema import NpsSurveyCreate, NpsSurveyUpdate


def create(db: Session, payload: NpsSurveyCreate) -> HRBPNpsSurvey:
    record = HRBPNpsSurvey(**payload.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def list_paginated(
    db: Session,
    page_no: int,
    per_page: int,
    consultant_id: int | None = None,
    survey_type: str | None = None,
    responded: bool | None = None,
) -> PageResult:
    q = db.query(HRBPNpsSurvey)
    if consultant_id is not None:
        q = q.filter(HRBPNpsSurvey.consultant_id == consultant_id)
    if survey_type is not None:
        q = q.filter(HRBPNpsSurvey.survey_type == survey_type)
    if responded is True:
        q = q.filter(HRBPNpsSurvey.responded_at.isnot(None))
    elif responded is False:
        q = q.filter(HRBPNpsSurvey.responded_at.is_(None))
    q = q.order_by(HRBPNpsSurvey.dispatched_at.desc())
    return paginate(q, page_no, per_page)


def get_by_id(db: Session, id: int) -> HRBPNpsSurvey:
    record = db.query(HRBPNpsSurvey).filter_by(id=id).first()
    if not record:
        raise HTTPException(status_code=404, detail="NPS survey not found")
    return record


def update(db: Session, id: int, payload: NpsSurveyUpdate) -> HRBPNpsSurvey:
    record = get_by_id(db, id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(record, field, value)
    db.commit()
    db.refresh(record)
    return record


def delete(db: Session, id: int) -> None:
    record = get_by_id(db, id)
    db.delete(record)
    db.commit()
