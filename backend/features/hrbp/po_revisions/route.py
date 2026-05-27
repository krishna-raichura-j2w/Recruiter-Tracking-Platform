from core.database import get_db
from core.deps import get_current_user
from core.response_format import (
    error_response,
    success_response,
    success_response_with_pagination,
)
from fastapi import APIRouter, Depends, Query
from infra.models import User
from sqlalchemy.orm import Session

from features.hrbp.po_revisions import service
from features.hrbp.po_revisions.schema import PoRevisionCreate

router = APIRouter(prefix="/po-revisions", tags=["hrbp-po-revisions"])


@router.get("/consultant/{consultant_id}")
def list_for_consultant(
    consultant_id: int,
    page_no: int = Query(default=1, ge=1),
    per_page: int = Query(default=10, ge=-1),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = service.list_by_consultant(db, consultant_id, page_no, per_page)
    return success_response_with_pagination(
        data=[r.__dict__ for r in result.items],
        message="PO revisions fetched successfully",
        page_no=result.page_no,
        per_page=result.per_page,
        total=result.total,
        total_pages=result.total_pages,
    )


@router.post("")
def create_revision(
    payload: PoRevisionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        record = service.create(db, payload, current_user)
        return success_response(data=record.__dict__, message="PO revision created successfully")
    except Exception as exc:
        return error_response(message=str(exc))


@router.get("/{revision_id}")
def get_revision(
    revision_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    try:
        record = service.get_by_id(db, revision_id)
        return success_response(data=record.__dict__, message="PO revision fetched successfully")
    except Exception as exc:
        return error_response(message=str(exc))
