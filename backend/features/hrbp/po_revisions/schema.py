from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, model_validator

PoRevisionStatus = Literal["pending_approval", "approved", "rejected"]


class PoRevisionCreate(BaseModel):
    consultant_id: int
    client_id: int
    hrbp_id: int | None = None
    bh_id: int | None = None
    revised_at: date
    old_po_rate: Decimal | None = None
    new_po_rate: Decimal
    hike_pct: Decimal | None = None
    ticket_id: int | None = None
    ticket_number: str | None = None
    notes: str | None = None

    @model_validator(mode="after")
    def compute_hike_pct(self) -> "PoRevisionCreate":
        if self.hike_pct is None and self.old_po_rate and self.old_po_rate != 0:
            self.hike_pct = round(
                Decimal((self.new_po_rate - self.old_po_rate) / self.old_po_rate * 100), 2
            )
        return self


class PoRevisionResponse(BaseModel):
    id: int
    consultant_id: int
    client_id: int
    hrbp_id: int | None
    bh_id: int | None
    revised_at: date
    old_po_rate: Decimal | None
    new_po_rate: Decimal
    hike_pct: Decimal | None
    ticket_id: int | None
    ticket_number: str | None
    status: str
    notes: str | None
    created_by_id: int | None
    created_at: datetime | None
    updated_at: datetime | None

    class Config:
        from_attributes = True
