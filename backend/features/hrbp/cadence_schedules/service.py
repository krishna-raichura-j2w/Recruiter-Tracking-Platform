from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from core.pagination import PageResult, paginate
from fastapi import HTTPException
from infra.hrbp_models import (
    HRBPCadenceSchedule,
    HRBPCadenceSession,
    HRBPClient,
    HRBPConsultant,
)
from sqlalchemy.orm import Session

from features.hrbp.cadence_schedules.schema import (
    CadenceScheduleCreate,
    CadenceScheduleUpdate,
    CadenceSessionUpdate,
)

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _next_weekday(d: date) -> date:
    """Shift d forward until it is a Monday–Friday."""
    while d.weekday() >= 5:
        d += timedelta(days=1)
    return d


def _generate_session_dates(start: date, end: date, freq_weeks: int) -> list[date]:
    """
    Walk from start to end in freq_weeks steps.
    Each candidate date is nudged to the next Monday when it lands on a weekend.
    """
    dates: list[date] = []
    current = _next_weekday(start)
    while current <= end:
        dates.append(current)
        candidate = current + timedelta(weeks=freq_weeks)
        current = _next_weekday(candidate)
    return dates


def _build_sessions(schedule_id: int, dates: list[date]) -> list[HRBPCadenceSession]:
    return [
        HRBPCadenceSession(
            schedule_id=schedule_id,
            cadence_number=idx + 1,
            scheduled_date=d,
        )
        for idx, d in enumerate(dates)
    ]


# ---------------------------------------------------------------------------
# Public service functions
# ---------------------------------------------------------------------------


def create(
    db: Session,
    payload: CadenceScheduleCreate,
    hrbp_id: int,
) -> HRBPCadenceSchedule:
    if payload.meeting_type == "one_time":
        effective_end = payload.start_date
    else:
        effective_end = payload.end_date  # already validated non-null by schema

    session_dates = _generate_session_dates(
        payload.start_date,
        effective_end,
        payload.frequency_weeks,
    )
    if not session_dates:
        raise HTTPException(
            status_code=400,
            detail="No valid weekday dates found in the given range",
        )

    schedule = HRBPCadenceSchedule(
        client_id=payload.client_id,
        consultant_id=payload.consultant_id,
        hrbp_id=hrbp_id,
        meeting_type=payload.meeting_type,
        project_name=payload.project_name,
        meeting_time=payload.meeting_time,
        duration_minutes=payload.duration_minutes,
        start_date=payload.start_date,
        end_date=payload.end_date,
        frequency_weeks=payload.frequency_weeks,
        supporting_documents=payload.supporting_documents,
    )
    db.add(schedule)
    db.flush()  # get schedule.id without committing

    sessions = _build_sessions(schedule.id, session_dates)
    db.add_all(sessions)
    db.commit()
    db.refresh(schedule)
    return schedule


def list_paginated(
    db: Session,
    page_no: int,
    per_page: int,
    client_id: int | None = None,
    consultant_id: int | None = None,
    hrbp_ids: list[int] | None = None,
    status: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> PageResult:
    q = db.query(HRBPCadenceSchedule)
    if client_id is not None:
        q = q.filter(HRBPCadenceSchedule.client_id == client_id)
    if consultant_id is not None:
        q = q.filter(HRBPCadenceSchedule.consultant_id == consultant_id)
    if hrbp_ids is not None:
        q = q.filter(HRBPCadenceSchedule.hrbp_id.in_(hrbp_ids))
    if status is not None:
        q = q.filter(HRBPCadenceSchedule.status == status)
    if date_from is not None:
        q = q.filter(HRBPCadenceSchedule.start_date >= date_from)
    if date_to is not None:
        q = q.filter(HRBPCadenceSchedule.start_date <= date_to)
    q = q.order_by(HRBPCadenceSchedule.created_at.desc())
    return paginate(q, page_no, per_page)


def get_by_id(db: Session, id: int) -> HRBPCadenceSchedule:
    record = db.query(HRBPCadenceSchedule).filter_by(id=id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Cadence schedule not found")
    return record


def get_sessions(
    db: Session,
    schedule_id: int,
    page_no: int,
    per_page: int,
    status: str | None = None,
) -> PageResult:
    get_by_id(db, schedule_id)  # 404 guard
    q = db.query(HRBPCadenceSession).filter(
        HRBPCadenceSession.schedule_id == schedule_id,
    )
    if status is not None:
        q = q.filter(HRBPCadenceSession.status == status)
    q = q.order_by(HRBPCadenceSession.cadence_number)
    return paginate(q, page_no, per_page)


def _get_session(db: Session, schedule_id: int, session_id: int) -> HRBPCadenceSession:
    record = (
        db.query(HRBPCadenceSession)
        .filter(
            HRBPCadenceSession.id == session_id,
            HRBPCadenceSession.schedule_id == schedule_id,
        )
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail="Cadence session not found")
    return record


def update_session(
    db: Session,
    schedule_id: int,
    session_id: int,
    payload: CadenceSessionUpdate,
) -> HRBPCadenceSession:
    session = _get_session(db, schedule_id, session_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(session, field, value)

    if payload.status == "completed" and session.completed_at is None:
        session.completed_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(session)

    # Promote parent schedule to in_progress on first completed session
    _sync_schedule_status(db, schedule_id)
    return session


def _sync_schedule_status(db: Session, schedule_id: int) -> None:
    schedule = get_by_id(db, schedule_id)
    sessions = db.query(HRBPCadenceSession).filter_by(schedule_id=schedule_id).all()
    statuses = {s.status for s in sessions}

    if statuses == {"completed"}:
        new_status = "completed"
    elif statuses == {"cancelled"}:
        new_status = "cancelled"
    elif "completed" in statuses:
        new_status = "in_progress"
    else:
        new_status = "not_started"

    if schedule.status != new_status:
        schedule.status = new_status
        db.commit()


def update(db: Session, id: int, payload: CadenceScheduleUpdate) -> HRBPCadenceSchedule:
    schedule = get_by_id(db, id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(schedule, field, value)
    db.commit()
    db.refresh(schedule)
    return schedule


def get_session_by_id(
    db: Session,
    schedule_id: int,
    session_id: int,
) -> HRBPCadenceSession:
    return _get_session(db, schedule_id, session_id)


def cancel(db: Session, id: int) -> None:
    schedule = get_by_id(db, id)
    schedule.status = "cancelled"
    db.query(HRBPCadenceSession).filter(
        HRBPCadenceSession.schedule_id == id,
        HRBPCadenceSession.status == "not_started",
    ).update({"status": "cancelled"})
    db.commit()


def get_summary(db: Session, hrbp_ids: list[int] | None = None) -> dict:
    base = db.query(HRBPCadenceSession).join(
        HRBPCadenceSchedule,
        HRBPCadenceSession.schedule_id == HRBPCadenceSchedule.id,
    )
    if hrbp_ids is not None:
        base = base.filter(HRBPCadenceSchedule.hrbp_id.in_(hrbp_ids))

    pending = base.filter(HRBPCadenceSession.status == "not_started").count()
    completed = base.filter(HRBPCadenceSession.status == "completed").count()
    return {"pending": pending, "completed": completed}


def list_all_sessions(
    db: Session,
    page_no: int,
    per_page: int,
    hrbp_ids: list[int] | None = None,
    client_id: int | None = None,
    consultant_id: int | None = None,
    status: str | None = None,
    scheduled_date: date | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> dict:
    rows = (
        db.query(
            HRBPCadenceSession.id,
            HRBPCadenceSession.schedule_id,
            HRBPCadenceSession.cadence_number,
            HRBPCadenceSession.scheduled_date,
            HRBPCadenceSession.status,
            HRBPCadenceSession.comments,
            HRBPCadenceSession.rca_status,
            HRBPCadenceSession.supporting_documents,
            HRBPCadenceSession.completed_at,
            HRBPCadenceSession.completed_by,
            HRBPCadenceSchedule.hrbp_id,
            HRBPCadenceSchedule.meeting_type,
            HRBPCadenceSchedule.project_name,
            HRBPCadenceSchedule.frequency_weeks,
            HRBPClient.id.label("client_id"),
            HRBPClient.name.label("client_name"),
            HRBPConsultant.id.label("consultant_id"),
            HRBPConsultant.name.label("consultant_name"),
        )
        .join(
            HRBPCadenceSchedule,
            HRBPCadenceSession.schedule_id == HRBPCadenceSchedule.id,
        )
        .join(HRBPClient, HRBPCadenceSchedule.client_id == HRBPClient.id)
        .join(HRBPConsultant, HRBPCadenceSchedule.consultant_id == HRBPConsultant.id)
    )

    if hrbp_ids is not None:
        rows = rows.filter(HRBPCadenceSchedule.hrbp_id.in_(hrbp_ids))
    if client_id is not None:
        rows = rows.filter(HRBPCadenceSchedule.client_id == client_id)
    if consultant_id is not None:
        rows = rows.filter(HRBPCadenceSchedule.consultant_id == consultant_id)
    if status is not None:
        rows = rows.filter(HRBPCadenceSession.status == status)
    if scheduled_date is not None:
        rows = rows.filter(HRBPCadenceSession.scheduled_date == scheduled_date)
    if date_from is not None:
        rows = rows.filter(HRBPCadenceSession.scheduled_date >= date_from)
    if date_to is not None:
        rows = rows.filter(HRBPCadenceSession.scheduled_date <= date_to)

    rows = rows.order_by(
        HRBPCadenceSession.scheduled_date,
        HRBPCadenceSession.cadence_number,
    )

    total = rows.count()
    if per_page == -1:
        items = [r._asdict() for r in rows.all()]
        return {
            "items": items,
            "total": total,
            "page_no": 1,
            "per_page": total,
            "total_pages": 1,
        }

    offset = (page_no - 1) * per_page
    items = [r._asdict() for r in rows.offset(offset).limit(per_page).all()]
    total_pages = max(1, (total + per_page - 1) // per_page)
    return {
        "items": items,
        "total": total,
        "page_no": page_no,
        "per_page": per_page,
        "total_pages": total_pages,
    }
