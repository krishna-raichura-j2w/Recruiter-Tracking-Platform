from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

SurveyType = Literal["monthly_pulse", "quarterly_deep_dive"]


class NpsSurveyCreate(BaseModel):
    consultant_id: int
    survey_type: SurveyType | None = None
    q1_project_score: int | None = None
    q2_changes: str | None = None
    q3_happiness: int | None = None
    q4_help_needed: str | None = None
    q5_open: str | None = None
    dispatched_at: datetime | None = None


class NpsSurveyUpdate(BaseModel):
    responded_at: datetime | None = None
    q1_project_score: int | None = None
    q2_changes: str | None = None
    q3_happiness: int | None = None
    q4_help_needed: str | None = None
    q5_open: str | None = None


class NpsSurveyResponse(BaseModel):
    id: int
    consultant_id: int
    survey_type: str | None
    q1_project_score: int | None
    q2_changes: str | None
    q3_happiness: int | None
    q4_help_needed: str | None
    q5_open: str | None
    dispatched_at: datetime | None
    responded_at: datetime | None
    created_at: datetime | None

    class Config:
        from_attributes = True
