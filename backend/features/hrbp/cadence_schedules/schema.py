from __future__ import annotations

from datetime import date, datetime, time
from typing import Literal

from pydantic import BaseModel, model_validator

MeetingType = Literal["one_time", "recurring"]
ScheduleStatus = Literal["not_started", "in_progress", "completed", "cancelled"]
SessionStatus = Literal["not_started", "completed", "cancelled"]


class CadenceScheduleCreate(BaseModel):
    client_id: int
    consultant_id: int
    meeting_type: MeetingType
    project_name: str | None = None
    meeting_time: time | None = None
    duration_minutes: int = 30
    start_date: date
    end_date: date | None = None
    frequency_weeks: int = 1
    supporting_documents: list[str] = []
    bh_id: int | None = None

    @model_validator(mode="after")
    def validate_dates(self) -> CadenceScheduleCreate:
        if self.meeting_type == "recurring":
            if self.end_date is None:
                raise ValueError("end_date is required for recurring meetings")
            if self.end_date < self.start_date:
                raise ValueError("end_date must be on or after start_date")
        if self.frequency_weeks < 1:
            raise ValueError("frequency_weeks must be at least 1")
        return self


class CadenceScheduleUpdate(BaseModel):
    supporting_documents: list[str] | None = None
    meeting_time: time | None = None
    duration_minutes: int | None = None
    end_date: date | None = None
    frequency_weeks: int | None = None


class CadenceSessionUpdate(BaseModel):
    comments: str | None = None
    rca_status: str | None = None
    supporting_documents: list[str] | None = None
    status: SessionStatus | None = None
    completed_by: int | None = None


class CadenceScheduleResponse(BaseModel):
    id: int
    client_id: int
    consultant_id: int
    hrbp_id: int
    bh_id: int | None
    meeting_type: str
    project_name: str | None
    meeting_time: time | None
    duration_minutes: int | None
    start_date: date
    end_date: date | None
    frequency_weeks: int | None
    status: str | None
    supporting_documents: list[str] | None
    google_meet_link: str | None = None
    created_at: datetime | None
    updated_at: datetime | None

    class Config:
        from_attributes = True


class CadenceSessionResponse(BaseModel):
    id: int
    schedule_id: int
    cadence_number: int
    scheduled_date: date
    status: str | None
    comments: str | None
    rca_status: str | None
    supporting_documents: list[str] | None
    completed_at: datetime | None
    completed_by: int | None
    created_at: datetime | None
    updated_at: datetime | None

    class Config:
        from_attributes = True
