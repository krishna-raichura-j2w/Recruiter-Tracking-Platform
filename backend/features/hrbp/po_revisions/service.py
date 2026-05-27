from __future__ import annotations

from core.pagination import PageResult, paginate
from fastapi import HTTPException
from infra.hrbp_models import HRBPPoRevision
from infra.models import User
from sqlalchemy.orm import Session

from features.hrbp.po_revisions.schema import PoRevisionCreate


def list_by_consultant(
    db: Session,
    consultant_id: int,
    page_no: int = 1,
    per_page: int = 10,
) -> PageResult:
    q = (
        db.query(HRBPPoRevision)
        .filter(HRBPPoRevision.consultant_id == consultant_id)
        .order_by(HRBPPoRevision.revised_at.desc(), HRBPPoRevision.id.desc())
    )
    return paginate(q, page_no, per_page)


def create(db: Session, payload: PoRevisionCreate, current_user: User) -> HRBPPoRevision:
    record = HRBPPoRevision(
        **payload.model_dump(),
        created_by_id=current_user.id,
        status="pending_approval",
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def get_by_id(db: Session, revision_id: int) -> HRBPPoRevision:
    record = db.query(HRBPPoRevision).filter_by(id=revision_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="PO revision not found")
    return record
