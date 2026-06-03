from __future__ import annotations

import os
import uuid
from datetime import date, time, timedelta

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

SCOPES = ["https://www.googleapis.com/auth/calendar"]
CALENDAR_ID = "primary"


def _get_service():
    creds = Credentials(
        token=None,
        refresh_token=os.environ["GOOGLE_REFRESH_TOKEN"],
        client_id=os.environ["GOOGLE_CLIENT_ID"],
        client_secret=os.environ["GOOGLE_CLIENT_SECRET"],
        token_uri="https://oauth2.googleapis.com/token",
        scopes=SCOPES,
    )
    return build("calendar", "v3", credentials=creds)


def _datetime_str(d: date, t: time) -> str:
    return f"{d.isoformat()}T{t.strftime('%H:%M:%S')}"


def _rrule(frequency_weeks: int, end_date: date) -> str:
    until = end_date.strftime("%Y%m%dT235959Z")
    return f"RRULE:FREQ=WEEKLY;INTERVAL={frequency_weeks};UNTIL={until}"


def create_calendar_event(
    *,
    title: str,
    description: str,
    start_date: date,
    end_date: date | None,
    meeting_time: time | None,
    duration_minutes: int,
    frequency_weeks: int,
    meeting_type: str,
    attendee_emails: list[str],
) -> tuple[str, str]:
    """
    Creates a Google Calendar event with a Meet link.
    Returns (event_id, meet_link).
    """
    service = _get_service()

    t = meeting_time or time(10, 0)
    start_dt = _datetime_str(start_date, t)

    end_time_dt = (
        date.min.replace(year=start_date.year, month=start_date.month, day=start_date.day)
    )
    from datetime import datetime, timezone
    start_naive = datetime.combine(start_date, t)
    end_naive = start_naive + timedelta(minutes=duration_minutes)
    end_dt = end_naive.strftime("%Y-%m-%dT%H:%M:%S")

    event: dict = {
        "summary": title,
        "description": description,
        "start": {"dateTime": start_dt, "timeZone": "Asia/Kolkata"},
        "end": {"dateTime": end_dt, "timeZone": "Asia/Kolkata"},
        "attendees": [{"email": e} for e in attendee_emails if e],
        "conferenceData": {
            "createRequest": {
                "requestId": str(uuid.uuid4()),
                "conferenceSolutionKey": {"type": "hangoutsMeet"},
            }
        },
        "reminders": {
            "useDefault": False,
            "overrides": [
                {"method": "email", "minutes": 24 * 60},
                {"method": "popup", "minutes": 30},
            ],
        },
    }

    if meeting_type == "recurring" and end_date:
        event["recurrence"] = [_rrule(frequency_weeks, end_date)]

    result = service.events().insert(
        calendarId=CALENDAR_ID,
        body=event,
        conferenceDataVersion=1,
        sendUpdates="all",
    ).execute()

    event_id = result["id"]
    meet_link = (
        result.get("conferenceData", {})
        .get("entryPoints", [{}])[0]
        .get("uri", "")
    )
    return event_id, meet_link


def cancel_calendar_event(event_id: str) -> None:
    """Deletes a Google Calendar event and notifies attendees."""
    try:
        service = _get_service()
        service.events().delete(
            calendarId=CALENDAR_ID,
            eventId=event_id,
            sendUpdates="all",
        ).execute()
    except Exception:
        pass  # Don't block DB cancel if calendar delete fails
