from __future__ import annotations
from typing import Literal, Optional
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel

SurveyType = Literal["monthly_pulse", "quarterly_deep_dive"]


class NpsSurveyCreate(BaseModel):
    consultant_id:    UUID
    survey_type:      Optional[SurveyType] = None
    q1_project_score: Optional[int]        = None
    q2_changes:       Optional[str]        = None
    q3_happiness:     Optional[int]        = None
    q4_help_needed:   Optional[str]        = None
    q5_open:          Optional[str]        = None
    dispatched_at:    Optional[datetime]   = None


class NpsSurveyUpdate(BaseModel):
    responded_at:     Optional[datetime] = None
    q1_project_score: Optional[int]      = None
    q2_changes:       Optional[str]      = None
    q3_happiness:     Optional[int]      = None
    q4_help_needed:   Optional[str]      = None
    q5_open:          Optional[str]      = None


class NpsSurveyResponse(BaseModel):
    id:               UUID
    consultant_id:    UUID
    survey_type:      Optional[str]
    q1_project_score: Optional[int]
    q2_changes:       Optional[str]
    q3_happiness:     Optional[int]
    q4_help_needed:   Optional[str]
    q5_open:          Optional[str]
    dispatched_at:    Optional[datetime]
    responded_at:     Optional[datetime]
    created_at:       Optional[datetime]

    class Config:
        from_attributes = True
