from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from core.database import get_db
from core.deps import get_current_user
from core.response_format import (
    error_response,
    success_response,
    success_response_with_pagination,
)
from features.hrbp.audit_log.service import log_action
from features.hrbp.tickets import service
from features.hrbp.tickets.export import build_and_upload as export_tickets
from features.hrbp.tickets.schema import (
    CloseTicketPayload,
    StepReassignPayload,
    StepSlaExtendPayload,
    StepSubmissionCreate,
    TicketCommentCreate,
    TicketCreate,
    TicketUpdate,
)
from infra.models import User

router = APIRouter(prefix="/tickets", tags=["hrbp-tickets"])


@router.get("/export")
def export_tickets_excel(
    status: str | None = Query(default=None),
    priority: str | None = Query(default=None),
    client_id: int | None = Query(default=None),
    sop_id: int | None = Query(default=None),
    search: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        url = export_tickets(
            db, current_user,
            status=status, priority=priority,
            client_id=client_id, sop_id=sop_id, search=search,
        )
        return success_response(data={"url": url}, message="Excel exported successfully")
    except Exception as exc:
        return error_response(message=str(exc))


@router.post("")
def create_ticket(
    payload: TicketCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        data = service.create(db, payload, current_user)
        log_action(db, actor_id=current_user.id, entity_type="ticket", entity_id=data.get("id", 0),
                   action="create", new_value={"title": data.get("title"), "priority": data.get("priority")})
        db.commit()
        return success_response(data=data, message="Ticket created successfully")
    except Exception as exc:
        return error_response(message=str(exc))


@router.get("")
def list_tickets(
    page_no: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=-1),
    status: str | None = Query(default=None),
    priority: str | None = Query(default=None),
    client_id: int | None = Query(default=None),
    sop_id: int | None = Query(default=None),
    search: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = service.list_paginated(
        db, current_user, page_no, per_page,
        status, priority, client_id, sop_id, search,
    )
    return success_response_with_pagination(
        data=result.items,
        message="Tickets fetched successfully",
        page_no=result.page_no,
        per_page=result.per_page,
        total=result.total,
        total_pages=result.total_pages,
    )


@router.get("/{ticket_id}")
def get_ticket(
    ticket_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        data = service.get_by_id(db, ticket_id)
        return success_response(data=data, message="Ticket fetched successfully")
    except Exception as exc:
        return error_response(message=str(exc))


@router.patch("/{ticket_id}")
def update_ticket(
    ticket_id: int,
    payload: TicketUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        data = service.update_ticket(db, ticket_id, payload, current_user)
        update_data = payload.model_dump(exclude_unset=True)
        log_action(db, actor_id=current_user.id, entity_type="ticket", entity_id=ticket_id,
                   action="update", new_value=update_data)
        db.commit()
        return success_response(data=data, message="Ticket updated successfully")
    except Exception as exc:
        return error_response(message=str(exc))


@router.post("/{ticket_id}/comments")
def add_comment(
    ticket_id: int,
    payload: TicketCommentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        data = service.add_comment(db, ticket_id, payload, current_user)
        return success_response(data=data, message="Comment added successfully")
    except Exception as exc:
        return error_response(message=str(exc))


@router.post("/{ticket_id}/advance")
def advance_step(
    ticket_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        data = service.advance_step(db, ticket_id, current_user)
        return success_response(data=data, message="Ticket advanced to next step")
    except Exception as exc:
        return error_response(message=str(exc))


@router.post("/{ticket_id}/extend-step-sla")
def extend_step_sla(
    ticket_id: int,
    payload: StepSlaExtendPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        data = service.extend_step_sla(db, ticket_id, payload, current_user)
        return success_response(data=data, message="Step SLA extended successfully")
    except Exception as exc:
        return error_response(message=str(exc))


@router.post("/{ticket_id}/reassign-step")
def reassign_step(
    ticket_id: int,
    payload: StepReassignPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        data = service.reassign_step(db, ticket_id, payload, current_user)
        return success_response(data=data, message="Step reassigned successfully")
    except Exception as exc:
        return error_response(message=str(exc))


@router.post("/{ticket_id}/steps/{step_number}/submit")
def submit_step(
    ticket_id: int,
    step_number: int,
    payload: StepSubmissionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        data = service.submit_step(db, ticket_id, step_number, payload, current_user)
        return success_response(data=data, message="Step submitted successfully")
    except Exception as exc:
        return error_response(message=str(exc))


@router.post("/{ticket_id}/close")
def close_ticket(
    ticket_id: int,
    payload: CloseTicketPayload = CloseTicketPayload(),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        data = service.close_ticket(db, ticket_id, payload, current_user)
        log_action(db, actor_id=current_user.id, entity_type="ticket", entity_id=ticket_id,
                   action="close", new_value={"po_outcome": payload.po_outcome})
        db.commit()
        return success_response(data=data, message="Ticket closed successfully")
    except Exception as exc:
        return error_response(message=str(exc))
