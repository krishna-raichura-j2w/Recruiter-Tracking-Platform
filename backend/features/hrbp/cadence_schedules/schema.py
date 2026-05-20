from __future__ import annotations
from typing import Literal, Optional
from datetime import date, datetime, time
from pydantic import BaseModel, model_validator

MeetingType      = Literal["one_time", "recurring"]
ScheduleStatus   = Literal["not_started", "in_progress", "completed", "cancelled"]
SessionStatus    = Literal["not_started", "completed", "cancelled"]


class CadenceScheduleCreate(BaseModel):
    client_id:            int
    consultant_id:        int
    meeting_type:         MeetingType
    project_name:         Optional[str]       = None
    meeting_time:         Optional[time]      = None
    duration_minutes:     int                 = 30
    start_date:           date
    end_date:             Optional[date]      = None
    frequency_weeks:      int                 = 1
    supporting_documents: list[str]           = []

    @model_validator(mode="after")
    def validate_dates(self) -> "CadenceScheduleCreate":
        if self.meeting_type == "recurring":
            if self.end_date is None:
                raise ValueError("end_date is required for recurring meetings")
            if self.end_date < self.start_date:
                raise ValueError("end_date must be on or after start_date")
        if self.frequency_weeks < 1:
            raise ValueError("frequency_weeks must be at least 1")
        return self


class CadenceScheduleUpdate(BaseModel):
    supporting_documents: Optional[list[str]] = None
    meeting_time:         Optional[time]       = None
    duration_minutes:     Optional[int]        = None
    end_date:             Optional[date]       = None
    frequency_weeks:      Optional[int]        = None


class CadenceSessionUpdate(BaseModel):
    comments:             Optional[str]           = None
    rca_status:           Optional[str]           = None
    supporting_documents: Optional[list[str]]     = None
    status:               Optional[SessionStatus] = None
    completed_by:         Optional[int]          = None


class CadenceScheduleResponse(BaseModel):
    id:                   int
    client_id:            int
    consultant_id:        int
    hrbp_id:              int
    meeting_type:         str
    project_name:         Optional[str]
    meeting_time:         Optional[time]
    duration_minutes:     Optional[int]
    start_date:           date
    end_date:             Optional[date]
    frequency_weeks:      Optional[int]
    status:               Optional[str]
    supporting_documents: Optional[list[str]]
    created_at:           Optional[datetime]
    updated_at:           Optional[datetime]

    class Config:
        from_attributes = True


class CadenceSessionResponse(BaseModel):
    id:                   int
    schedule_id:          int
    cadence_number:       int
    scheduled_date:       date
    status:               Optional[str]
    comments:             Optional[str]
    rca_status:           Optional[str]
    supporting_documents: Optional[list[str]]
    completed_at:         Optional[datetime]
    completed_by:         Optional[int]
    created_at:           Optional[datetime]
    updated_at:           Optional[datetime]

    class Config:
        from_attributes = True
