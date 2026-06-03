from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone

from core.pagination import PageResult, paginate
from fastapi import HTTPException
from infra.hrbp_models import (
    HRBPCadenceSchedule,
    HRBPCadenceSession,
    HRBPClient,
    HRBPConsultant,
)
from infra.models import User
from sqlalchemy.orm import Session

from features.hrbp.cadence_schedules.schema import (
    CadenceScheduleCreate,
    CadenceScheduleUpdate,
    CadenceSessionUpdate,
)
from features.hrbp.cadence_schedules import google_calendar
from features.hrbp.cadence_schedules.email_templates import cadence_created_html
from core.email import send_outlook_email

log = logging.getLogger(__name__)

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
        bh_id=payload.bh_id,
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

    # ── Google Calendar invite ──────────────────────────────────────────────
    try:
        attendee_emails = _collect_attendee_emails(db, schedule)
        consultant = db.query(HRBPConsultant).filter_by(id=payload.consultant_id).first()
        client = db.query(HRBPClient).filter_by(id=payload.client_id).first()
        consultant_name = consultant.name if consultant else "Consultant"
        client_name = client.name if client else "Client"

        title = f"Cadence Call — {consultant_name} ({client_name})"
        if payload.project_name:
            title += f" | {payload.project_name}"

        description = (
            f"Cadence check-in scheduled via J2W HRBP Platform.\n"
            f"Client: {client_name}\n"
            f"Consultant: {consultant_name}\n"
        )
        if payload.project_name:
            description += f"Project: {payload.project_name}\n"

        event_id, meet_link = google_calendar.create_calendar_event(
            title=title,
            description=description,
            start_date=payload.start_date,
            end_date=payload.end_date,
            meeting_time=payload.meeting_time,
            duration_minutes=payload.duration_minutes,
            frequency_weeks=payload.frequency_weeks,
            meeting_type=payload.meeting_type,
            attendee_emails=attendee_emails,
        )
        schedule.google_calendar_event_id = event_id
        schedule.google_meet_link = meet_link
        db.commit()
        db.refresh(schedule)
    except Exception as exc:
        log.warning("Google Calendar event creation failed: %s", exc)
    # ───────────────────────────────────────────────────────────────────────

    # ── Cadence created email notification ─────────────────────────────────
    try:
        _send_cadence_created_emails(db, schedule)
    except Exception as exc:
        log.warning("Cadence creation email failed: %s", exc)
    # ───────────────────────────────────────────────────────────────────────

    return schedule


def _send_cadence_created_emails(db: Session, schedule: HRBPCadenceSchedule) -> None:
    """Send a cadence-created notification email to each participant individually."""
    hrbp = db.query(User).filter_by(id=schedule.hrbp_id).first()
    consultant = db.query(HRBPConsultant).filter_by(id=schedule.consultant_id).first()
    client = db.query(HRBPClient).filter_by(id=schedule.client_id).first()

    created_by_name = hrbp.name if hrbp else "HRBP"
    consultant_name = consultant.name if consultant else "Consultant"
    client_name = client.name if client else "Client"

    # Build list of (name, email) for every participant
    participants: list[tuple[str, str]] = []

    if hrbp and hrbp.email:
        participants.append((hrbp.name or "HRBP", hrbp.email))

    if schedule.bh_id:
        bh = db.query(User).filter_by(id=schedule.bh_id).first()
        if bh and bh.email:
            participants.append((bh.name or "Business Head", bh.email))

    if consultant and consultant.email:
        participants.append((consultant_name, consultant.email))

    # Other HRBPs on the client
    if client and client.hrbp_ids:
        extra_ids = [i for i in client.hrbp_ids if i != schedule.hrbp_id]
        if extra_ids:
            for u in db.query(User).filter(User.id.in_(extra_ids)).all():
                if u.email and not any(e == u.email for _, e in participants):
                    participants.append((u.name or "HRBP", u.email))

    subject = f"Cadence Scheduled — {consultant_name} ({client_name})"
    if schedule.project_name:
        subject += f" | {schedule.project_name}"

    for name, email in participants:
        html = cadence_created_html(
            created_by_name=created_by_name,
            client_name=client_name,
            consultant_name=consultant_name,
            project_name=schedule.project_name,
            meeting_type=schedule.meeting_type,
            start_date=schedule.start_date,
            end_date=schedule.end_date,
            meeting_time=schedule.meeting_time,
            duration_minutes=schedule.duration_minutes or 30,
            frequency_weeks=schedule.frequency_weeks or 1,
            google_meet_link=schedule.google_meet_link,
            recipient_name=name,
        )
        send_outlook_email(to_addresses=[email], subject=subject, html_body=html)


def _collect_attendee_emails(db: Session, schedule: HRBPCadenceSchedule) -> list[str]:
    emails: list[str] = []

    # HRBP who created it
    hrbp = db.query(User).filter_by(id=schedule.hrbp_id).first()
    if hrbp and hrbp.email:
        emails.append(hrbp.email)

    # Business Head (if assigned)
    if schedule.bh_id:
        bh = db.query(User).filter_by(id=schedule.bh_id).first()
        if bh and bh.email:
            emails.append(bh.email)

    # Consultant
    consultant = db.query(HRBPConsultant).filter_by(id=schedule.consultant_id).first()
    if consultant and consultant.email:
        emails.append(consultant.email)

    # All other HRBPs on this client (from hrbp_clients.hrbp_ids)
    client = db.query(HRBPClient).filter_by(id=schedule.client_id).first()
    if client and client.hrbp_ids:
        extra_hrbp_ids = [i for i in client.hrbp_ids if i != schedule.hrbp_id]
        if extra_hrbp_ids:
            extra_users = db.query(User).filter(User.id.in_(extra_hrbp_ids)).all()
            for u in extra_users:
                if u.email and u.email not in emails:
                    emails.append(u.email)

    return emails


def list_paginated(
    db: Session,
    page_no: int,
    per_page: int,
    client_id: int | None = None,
    consultant_id: int | None = None,
    hrbp_ids: list[int] | None = None,
    client_ids: list[int] | None = None,
    status: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> PageResult:
    q = db.query(HRBPCadenceSchedule)
    if client_id is not None:
        q = q.filter(HRBPCadenceSchedule.client_id == client_id)
    if consultant_id is not None:
        q = q.filter(HRBPCadenceSchedule.consultant_id == consultant_id)
    # client_ids takes precedence over hrbp_ids for multi-HRBP-aware scoping
    if client_ids is not None:
        q = q.filter(HRBPCadenceSchedule.client_id.in_(client_ids))
    elif hrbp_ids is not None:
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

    if schedule.google_calendar_event_id:
        google_calendar.cancel_calendar_event(schedule.google_calendar_event_id)


def get_summary(
    db: Session,
    hrbp_ids: list[int] | None = None,
    client_ids: list[int] | None = None,
) -> dict:
    base = db.query(HRBPCadenceSession).join(
        HRBPCadenceSchedule,
        HRBPCadenceSession.schedule_id == HRBPCadenceSchedule.id,
    )
    if client_ids is not None:
        base = base.filter(HRBPCadenceSchedule.client_id.in_(client_ids))
    elif hrbp_ids is not None:
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
    cadence_tag: str | None = None,
    current_bh_id: int | None = None,
    client_ids: list[int] | None = None,
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
            HRBPCadenceSchedule.bh_id,
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

    if client_ids is not None:
        rows = rows.filter(HRBPCadenceSchedule.client_id.in_(client_ids))
    elif hrbp_ids is not None:
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
    if cadence_tag == "my_cadence" and current_bh_id is not None:
        rows = rows.filter(HRBPCadenceSchedule.bh_id == current_bh_id)
    elif cadence_tag == "team_cadence":
        rows = rows.filter(HRBPCadenceSchedule.bh_id.is_(None))

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
