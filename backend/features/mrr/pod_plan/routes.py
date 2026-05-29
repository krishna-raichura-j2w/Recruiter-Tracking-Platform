from __future__ import annotations

from datetime import date as _date
from datetime import datetime

from core.database import get_db
from core.deps import require_roles
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from features.mrr.pod_plan import service
from features.mrr.pod_plan.schema import (
    CustomerUpsert,
    DailyActualsBulk,
    KAMsBulk,
    RecruitersBulk,
    SetupUpsert,
    WeeklyOBBulk,
)

router = APIRouter(prefix="/pod-plan", tags=["pod-plan"])

BH_ONLY = Depends(require_roles("bh"))


def _pod_id_or_404(db: Session, bh_user_id: int) -> int:
    pod_id = service.get_bh_pod_id(db, bh_user_id)
    if not pod_id:
        raise HTTPException(status_code=404, detail="No pod found for this BH")
    return pod_id


def _setup_or_404(db: Session, setup_id: int, pod_id: int) -> dict:
    row = db.execute(
        __import__("sqlalchemy").text(
            "SELECT * FROM bh_pod_setups WHERE id=:id AND pod_id=:pid"
        ),
        {"id": setup_id, "pid": pod_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Setup not found")
    return dict(row)


# ── setup ─────────────────────────────────────────────────────────────────────

@router.get("/setups")
def list_setups(db: Session = Depends(get_db), cu=BH_ONLY):
    """List all months that have an existing setup for this BH's pod."""
    pod_id = _pod_id_or_404(db, cu.id)
    rows = db.execute(
        __import__("sqlalchemy").text(
            "SELECT id, month FROM bh_pod_setups WHERE pod_id=:pid ORDER BY created_at DESC"
        ),
        {"pid": pod_id},
    ).mappings().all()
    return {"setups": [dict(r) for r in rows], "pod_id": pod_id}


@router.get("/setup")
def get_setup(month: str | None = None, db: Session = Depends(get_db), cu=BH_ONLY):
    pod_id = _pod_id_or_404(db, cu.id)
    m = month or datetime.now().strftime("%B %Y")
    setup = service.get_setup(db, pod_id, m)
    weeks = service.week_buckets(m) if setup else []
    return {"setup": setup, "pod_id": pod_id, "month": m, "weeks": weeks}


@router.post("/setup")
def upsert_setup(body: SetupUpsert, db: Session = Depends(get_db), cu=BH_ONLY):
    pod_id = _pod_id_or_404(db, cu.id)
    setup = service.upsert_setup(db, pod_id, cu.id, body.model_dump())
    return {"setup": setup, "weeks": service.week_buckets(body.month)}


# ── clients reference ─────────────────────────────────────────────────────────

@router.get("/clients")
def list_clients(db: Session = Depends(get_db), cu=BH_ONLY):
    return {"clients": service.list_clients(db)}


# ── customers ─────────────────────────────────────────────────────────────────

@router.get("/setup/{setup_id}/customers")
def list_customers(setup_id: int, db: Session = Depends(get_db), cu=BH_ONLY):
    pod_id = _pod_id_or_404(db, cu.id)
    _setup_or_404(db, setup_id, pod_id)
    return {"customers": service.list_customers(db, setup_id)}


@router.post("/setup/{setup_id}/customers")
def upsert_customer(setup_id: int, body: CustomerUpsert, db: Session = Depends(get_db), cu=BH_ONLY):
    pod_id = _pod_id_or_404(db, cu.id)
    _setup_or_404(db, setup_id, pod_id)
    customer = service.upsert_customer(db, setup_id, body.model_dump())
    return {"customer": customer}


@router.delete("/setup/{setup_id}/customers/{customer_id}")
def delete_customer(setup_id: int, customer_id: int, db: Session = Depends(get_db), cu=BH_ONLY):
    pod_id = _pod_id_or_404(db, cu.id)
    _setup_or_404(db, setup_id, pod_id)
    service.delete_customer(db, customer_id, setup_id)
    return {"ok": True}


# ── pod members ───────────────────────────────────────────────────────────────

@router.get("/setup/{setup_id}/pod-members")
def pod_members(setup_id: int, db: Session = Depends(get_db), cu=BH_ONLY):
    pod_id = _pod_id_or_404(db, cu.id)
    _setup_or_404(db, setup_id, pod_id)
    return {"members": service.list_pod_members(db, pod_id)}


# ── recruiter assignments ─────────────────────────────────────────────────────

@router.get("/setup/{setup_id}/recruiters")
def list_recruiters(setup_id: int, db: Session = Depends(get_db), cu=BH_ONLY):
    pod_id = _pod_id_or_404(db, cu.id)
    _setup_or_404(db, setup_id, pod_id)
    return {"assignments": service.list_recruiter_assignments(db, setup_id)}


@router.post("/setup/{setup_id}/recruiters")
def save_recruiters(setup_id: int, body: RecruitersBulk, db: Session = Depends(get_db), cu=BH_ONLY):
    pod_id = _pod_id_or_404(db, cu.id)
    _setup_or_404(db, setup_id, pod_id)
    entries = [a.model_dump() for a in body.assignments]
    service.upsert_recruiter_assignments(db, setup_id, entries)
    return {"assignments": service.list_recruiter_assignments(db, setup_id)}


# ── KAM assignments ───────────────────────────────────────────────────────────

@router.get("/setup/{setup_id}/kams")
def list_kams(setup_id: int, db: Session = Depends(get_db), cu=BH_ONLY):
    pod_id = _pod_id_or_404(db, cu.id)
    _setup_or_404(db, setup_id, pod_id)
    return {"kams": service.list_kam_assignments(db, setup_id)}


@router.post("/setup/{setup_id}/kams")
def save_kams(setup_id: int, body: KAMsBulk, db: Session = Depends(get_db), cu=BH_ONLY):
    pod_id = _pod_id_or_404(db, cu.id)
    _setup_or_404(db, setup_id, pod_id)
    entries = [a.model_dump() for a in body.assignments]
    service.upsert_kam_assignments(db, setup_id, entries)
    return {"kams": service.list_kam_assignments(db, setup_id)}


# ── weekly OB targets ─────────────────────────────────────────────────────────

@router.get("/setup/{setup_id}/weekly-obs")
def list_weekly_obs(setup_id: int, db: Session = Depends(get_db), cu=BH_ONLY):
    pod_id = _pod_id_or_404(db, cu.id)
    _setup_or_404(db, setup_id, pod_id)
    return {"weekly_obs": service.list_weekly_ob_targets(db, setup_id)}


@router.post("/setup/{setup_id}/weekly-obs")
def save_weekly_obs(setup_id: int, body: WeeklyOBBulk, db: Session = Depends(get_db), cu=BH_ONLY):
    pod_id = _pod_id_or_404(db, cu.id)
    _setup_or_404(db, setup_id, pod_id)
    entries = [e.model_dump() for e in body.entries]
    service.upsert_weekly_ob_targets(db, setup_id, entries)
    return {"weekly_obs": service.list_weekly_ob_targets(db, setup_id)}


# ── daily actuals ─────────────────────────────────────────────────────────────

@router.get("/setup/{setup_id}/daily/{entry_date}")
def get_daily(setup_id: int, entry_date: str, db: Session = Depends(get_db), cu=BH_ONLY):
    pod_id = _pod_id_or_404(db, cu.id)
    s = _setup_or_404(db, setup_id, pod_id)
    actuals = service.get_daily_actuals(db, setup_id, entry_date)
    week_info = service.week_for_date(entry_date, s["month"])
    week_ob_actuals: dict[int, int] = {}
    if week_info:
        week_ob_actuals = service.get_week_ob_actuals(db, setup_id, week_info["week_start"], week_info["week_end"])
    weekly_obs = service.list_weekly_ob_targets(db, setup_id)
    week_ob_targets = {
        r["customer_target_id"]: r["ob_target"]
        for r in weekly_obs
        if week_info and r["week_num"] == week_info.get("week_num")
    }
    return {
        "actuals": actuals,
        "week_info": week_info,
        "week_ob_actuals": week_ob_actuals,
        "week_ob_targets": week_ob_targets,
    }


@router.post("/setup/{setup_id}/daily/{entry_date}")
def save_daily(setup_id: int, entry_date: str, body: DailyActualsBulk,
               db: Session = Depends(get_db), cu=BH_ONLY):
    pod_id = _pod_id_or_404(db, cu.id)
    _setup_or_404(db, setup_id, pod_id)
    entries = [e.model_dump() for e in body.entries]
    service.save_daily_actuals(db, setup_id, entry_date, entries)
    return {"ok": True}


@router.get("/setup/{setup_id}/monthly-progress")
def monthly_progress(setup_id: int, db: Session = Depends(get_db), cu=BH_ONLY):
    pod_id = _pod_id_or_404(db, cu.id)
    s = _setup_or_404(db, setup_id, pod_id)
    actuals = service.get_monthly_actuals(db, setup_id, s["month"])
    return {"monthly_actuals": actuals}


@router.get("/setup/{setup_id}/working-days")
def working_days(setup_id: int, db: Session = Depends(get_db), cu=BH_ONLY):
    pod_id = _pod_id_or_404(db, cu.id)
    s = _setup_or_404(db, setup_id, pod_id)
    days = service.working_days_for_month(s["month"])
    return {"working_days": days}


# ── compute endpoints ─────────────────────────────────────────────────────────

@router.get("/setup/{setup_id}/metrics")
def get_metrics(setup_id: int, db: Session = Depends(get_db), cu=BH_ONLY):
    pod_id = _pod_id_or_404(db, cu.id)
    s = _setup_or_404(db, setup_id, pod_id)
    customers = service.list_customers(db, setup_id)
    recruiters = service.list_recruiter_assignments(db, setup_id)
    kams = service.list_kam_assignments(db, setup_id)
    metrics = service.compute_metrics(s, customers, recruiters)
    metrics["kams"] = kams
    return metrics


@router.get("/setup/{setup_id}/plan")
def get_plan(setup_id: int, db: Session = Depends(get_db), cu=BH_ONLY):
    pod_id = _pod_id_or_404(db, cu.id)
    s = _setup_or_404(db, setup_id, pod_id)
    customers = service.list_customers(db, setup_id)
    recruiters = service.list_recruiter_assignments(db, setup_id)
    kams = service.list_kam_assignments(db, setup_id)
    metrics = service.compute_metrics(s, customers, recruiters)
    enriched = metrics["customers"]
    plan = service.compute_plan(s, enriched, recruiters)
    kam_plans = service.compute_kam_plan(s, enriched, kams)
    weekly_obs = service.list_weekly_ob_targets(db, setup_id)
    return {**plan, "kam_plans": kam_plans, "weekly_obs": weekly_obs}
