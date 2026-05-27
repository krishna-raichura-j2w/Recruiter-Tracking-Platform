from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel

ExitReason = Literal["resignation", "end_of_contract", "termination", "mutual_separation"]
ExitType   = Literal["voluntary", "involuntary"]
ExitStatus = Literal["initiated", "acknowledged", "completed"]


class ExitCreate(BaseModel):
    consultant_id:       int
    client_id:           int
    initiated_by_id:     int
    exit_reason:         ExitReason
    exit_type:           ExitType
    exit_date:           date | None = None
    notice_period_start: date | None = None
    replacement_needed:  bool = False
    notes:               str | None = None
    source_ticket_id:    int | None = None


class ExitUpdate(BaseModel):
    status:              ExitStatus | None = None
    exit_date:           date | None = None
    notice_period_start: date | None = None
    replacement_needed:  bool | None = None
    notes:               str | None = None


class ExitResponse(BaseModel):
    id:                  int
    consultant_id:       int
    consultant_name:     str | None
    client_id:           int
    client_name:         str | None
    initiated_by_id:     int
    initiated_by_name:   str | None
    exit_reason:         str
    exit_type:           str
    exit_date:           date | None
    notice_period_start: date | None
    po_impact:           float | None
    status:              str
    replacement_needed:  bool
    notes:               str | None
    source_ticket_id:    int | None = None
    source_ticket_number: str | None = None
    created_at:          datetime | None
    updated_at:          datetime | None

    class Config:
        from_attributes = True


class ExitStatsResponse(BaseModel):
    total_exits:          int
    exits_this_month:     int
    exits_this_quarter:   int
    total_po_impact:      float
    by_status:            dict[str, int]
    by_reason:            dict[str, int]
