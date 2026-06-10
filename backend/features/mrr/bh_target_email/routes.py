"""
BH Target Tracking email — admin-triggered & scheduler-friendly endpoints.

GET  /bh-target-email/preview  - returns the same data + HTML the email would carry
POST /bh-target-email/send     - actually sends the email via Outlook SMTP
"""
from __future__ import annotations

from datetime import date as _date
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from core.database import get_db
from core.deps import require_roles
from core.email import send_outlook_email

from features.mrr.bh_target_email import service

router = APIRouter(prefix="/bh-target-email", tags=["bh-target-email"])

ADMIN_OR_COO = ("admin", "coo")


def _resolve_date(date: str | None) -> _date:
    if date is None:
        ist_now = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
        return ist_now.date()
    try:
        return _date.fromisoformat(date)
    except ValueError:
        raise HTTPException(400, "date must be YYYY-MM-DD")


@router.get("/preview")
def preview(
    date: str | None = Query(None, description="IST date (YYYY-MM-DD), default today"),
    db: Session = Depends(get_db),
    _=Depends(require_roles(*ADMIN_OR_COO)),
):
    """Return the raw payload + rendered HTML for the BH Target email."""
    target = _resolve_date(date)
    data = service.collect_bh_rows(db, target)
    html = service.render_html(data["date"], data["rows"], data["totals"])
    return {**data, "html": html}


@router.post("/send")
def send(
    date: str | None = Query(None, description="IST date (YYYY-MM-DD), default today"),
    to: list[str] | None = Query(
        None,
        description=(
            "Recipient email(s). Defaults to krishna.paresh@joulestowatts.com for the "
            "test run. Pass repeatedly for multiple recipients."
        ),
    ),
    db: Session = Depends(get_db),
    _=Depends(require_roles(*ADMIN_OR_COO)),
):
    """Send the BH Target email to the given recipients (or the default test address)."""
    target = _resolve_date(date)
    recipients = to or ["krishna.paresh@joulestowatts.com"]

    data = service.collect_bh_rows(db, target)
    html = service.render_html(data["date"], data["rows"], data["totals"])

    pretty = datetime.strptime(data["date"], "%Y-%m-%d").strftime("%d %b %Y")
    subject = f"BH Target Tracking — Daily Snapshot ({pretty})"

    send_outlook_email(recipients, subject, html)

    return {
        "sent_to":     recipients,
        "date":        data["date"],
        "subject":     subject,
        "row_count":   len(data["rows"]),
        "totals":      data["totals"],
    }
