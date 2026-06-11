from __future__ import annotations

from datetime import date
from pydantic import BaseModel


class ReportRow(BaseModel):
    emp_id:      str | None
    emp_name:    str
    exit_type:   str
    client_name: str | None
    lwd:         date | None
    po_value:    float | None
    margin:      float | None
    hr_efforts:  str | None

    class Config:
        from_attributes = True


class ReportSection(BaseModel):
    count:       int
    total_po:    float
    total_margin: float
    records:     list[ReportRow]


class MonthlyReportResponse(BaseModel):
    month:                  int
    year:                   int
    label:                  str           # e.g. "Jun 2026"
    exits:                  ReportSection
    exits_in_progress:      ReportSection
    retentions:             ReportSection
    retentions_in_progress: ReportSection
