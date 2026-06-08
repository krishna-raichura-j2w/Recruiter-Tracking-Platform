from __future__ import annotations

from typing import Optional

from core.database import get_db
from core.deps import get_current_user, require_roles
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from features.mrr.sales_effort import service
from features.mrr.sales_effort.schema import (
    CustomerCreate,
    CustomerUpdate,
    EffortLineCreate,
    EffortLineUpdate,
)

router = APIRouter(prefix="/sales-effort", tags=["sales-effort"])

READ = Depends(get_current_user)
BH_WRITE = Depends(require_roles("bh", "admin", "coo"))
ADMIN_WRITE = Depends(require_roles("admin", "coo"))

_PRIVILEGED = {"admin", "coo"}


# ── bh users & summary ───────────────────────────────────────────────────────

@router.get("/bh-users")
def list_bh_users(db: Session = Depends(get_db), cu=READ):
    return {"bh_users": service.get_bh_users(db)}


# ── flat tracker ──────────────────────────────────────────────────────────────

@router.get("/flat")
def get_flat(
    bh_user_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    cu=READ,
):
    """Flat tracker view — all BHs. Optional ?bh_user_id filter.
    BH users automatically see only their own data.
    """
    role = cu.role.value
    if role == "bh":
        effective_bh = cu.id
    else:
        effective_bh = bh_user_id

    rows = service.get_flat_tracker(db, bh_user_id=effective_bh)
    return {"rows": rows}


# ── customers ─────────────────────────────────────────────────────────────────

@router.get("/customers")
def list_customers(
    bh_user_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    cu=READ,
):
    role = cu.role.value
    if role == "bh":
        effective_bh = cu.id
    else:
        effective_bh = bh_user_id
    customers = service.list_customers(db, bh_user_id=effective_bh)
    return {"customers": customers}


@router.post("/customers")
def create_customer(
    body: CustomerCreate,
    db: Session = Depends(get_db),
    cu=BH_WRITE,
):
    customer = service.upsert_customer(db, body.model_dump(), cu)
    return {"customer": customer}


@router.put("/customers/{customer_id}")
def update_customer(
    customer_id: int,
    body: CustomerUpdate,
    db: Session = Depends(get_db),
    cu=BH_WRITE,
):
    customer = service.update_customer(db, customer_id, body.model_dump(exclude_none=True), cu)
    return {"customer": customer}


@router.delete("/customers/{customer_id}")
def delete_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    cu=ADMIN_WRITE,
):
    service.delete_customer(db, customer_id)
    return {"ok": True}


# ── effort lines ──────────────────────────────────────────────────────────────

@router.post("/customers/{customer_id}/lines")
def add_effort_line(
    customer_id: int,
    body: EffortLineCreate,
    db: Session = Depends(get_db),
    cu=BH_WRITE,
):
    line = service.add_effort_line(db, customer_id, body.model_dump(), cu)
    return {"line": line}


@router.put("/lines/{line_id}")
def update_effort_line(
    line_id: int,
    body: EffortLineUpdate,
    db: Session = Depends(get_db),
    cu=BH_WRITE,
):
    line = service.update_effort_line(db, line_id, body.model_dump(exclude_none=True), cu)
    return {"line": line}


@router.delete("/lines/{line_id}")
def delete_effort_line(
    line_id: int,
    db: Session = Depends(get_db),
    cu=ADMIN_WRITE,
):
    service.delete_effort_line(db, line_id)
    return {"ok": True}


# ── summary stats ─────────────────────────────────────────────────────────────

@router.get("/summary")
def summary_stats(
    bh_user_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    cu=READ,
):
    role = cu.role.value
    if role == "bh":
        effective_bh = cu.id
    else:
        effective_bh = bh_user_id
    stats = service.get_summary_stats(db, bh_user_id=effective_bh)
    return stats
