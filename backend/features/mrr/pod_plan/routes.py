from __future__ import annotations

from datetime import date as _date
from datetime import datetime, timedelta
from typing import Optional

from core.database import get_db
from core.deps import require_roles
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
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

BH_OR_ADMIN = Depends(require_roles("bh", "admin", "coo"))
LEADERSHIP = Depends(require_roles("admin", "coo", "ops_head"))

_PRIVILEGED = {"admin", "coo"}


def _effective_bh_id(cu, as_bh: Optional[int]) -> int:
    if cu.role.value in _PRIVILEGED:
        if not as_bh:
            raise HTTPException(400, "Must supply ?as_bh=<bh_user_id>")
        return as_bh
    return cu.id


def _pod_id_or_404(db: Session, bh_user_id: int) -> int:
    pod_id = service.get_bh_pod_id(db, bh_user_id)
    if not pod_id:
        raise HTTPException(status_code=404, detail="No pod found for this BH")
    return pod_id


def _setup_or_404(db: Session, setup_id: int, pod_id: int, is_admin: bool = False) -> dict:
    if is_admin:
        row = db.execute(
            text("SELECT * FROM bh_pod_setups WHERE id=:id"),
            {"id": setup_id},
        ).mappings().first()
    else:
        row = db.execute(
            text("SELECT * FROM bh_pod_setups WHERE id=:id AND pod_id=:pid"),
            {"id": setup_id, "pid": pod_id},
        ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Setup not found")
    return dict(row)


# ── BH list (admin view) ──────────────────────────────────────────────────────

@router.get("/bhs")
def list_bhs(db: Session = Depends(get_db), cu=BH_OR_ADMIN):
    rows = db.execute(
        text("""SELECT u.id, u.name, u.email, p.id AS pod_id
                FROM users u JOIN pods p ON p.bh_user_id = u.id
                WHERE u.role = 'bh' AND u.is_active = true
                ORDER BY u.name""")
    ).mappings().all()
    return {"bhs": [dict(r) for r in rows]}


# ── setup ─────────────────────────────────────────────────────────────────────

@router.get("/setups")
def list_setups(as_bh: Optional[int] = Query(None), db: Session = Depends(get_db), cu=BH_OR_ADMIN):
    bh_id = _effective_bh_id(cu, as_bh)
    pod_id = _pod_id_or_404(db, bh_id)
    rows = db.execute(
        text("SELECT id, month FROM bh_pod_setups WHERE pod_id=:pid ORDER BY created_at DESC"),
        {"pid": pod_id},
    ).mappings().all()
    return {"setups": [dict(r) for r in rows], "pod_id": pod_id}


@router.get("/setup")
def get_setup(month: str | None = None, as_bh: Optional[int] = Query(None),
              db: Session = Depends(get_db), cu=BH_OR_ADMIN):
    bh_id = _effective_bh_id(cu, as_bh)
    pod_id = _pod_id_or_404(db, bh_id)
    m = month or datetime.now().strftime("%B %Y")
    setup = service.get_setup(db, pod_id, m)
    custom = setup.get("custom_working_days") if setup else None
    weeks = service.week_buckets(m, custom) if setup else []
    return {"setup": setup, "pod_id": pod_id, "month": m, "weeks": weeks}


@router.post("/setup")
def upsert_setup(body: SetupUpsert, as_bh: Optional[int] = Query(None),
                 db: Session = Depends(get_db), cu=BH_OR_ADMIN):
    bh_id = _effective_bh_id(cu, as_bh)
    pod_id = _pod_id_or_404(db, bh_id)
    body_data = body.model_dump()
    setup = service.upsert_setup(db, pod_id, bh_id, body_data)
    custom = setup.get("custom_working_days")
    return {"setup": setup, "weeks": service.week_buckets(body.month, custom)}


# ── clients reference ─────────────────────────────────────────────────────────

@router.get("/clients")
def list_clients(db: Session = Depends(get_db), cu=BH_OR_ADMIN):
    return {"clients": service.list_clients(db)}


# ── customers ─────────────────────────────────────────────────────────────────

@router.get("/setup/{setup_id}/customers")
def list_customers(setup_id: int, db: Session = Depends(get_db), cu=BH_OR_ADMIN):
    is_admin = cu.role.value in _PRIVILEGED
    pod_id = 0 if is_admin else _pod_id_or_404(db, cu.id)
    _setup_or_404(db, setup_id, pod_id, is_admin)
    return {"customers": service.list_customers(db, setup_id)}


@router.post("/setup/{setup_id}/customers")
def upsert_customer(setup_id: int, body: CustomerUpsert, db: Session = Depends(get_db), cu=BH_OR_ADMIN):
    is_admin = cu.role.value in _PRIVILEGED
    pod_id = 0 if is_admin else _pod_id_or_404(db, cu.id)
    _setup_or_404(db, setup_id, pod_id, is_admin)
    customer = service.upsert_customer(db, setup_id, body.model_dump())
    return {"customer": customer}


@router.delete("/setup/{setup_id}/customers/{customer_id}")
def delete_customer(setup_id: int, customer_id: int, db: Session = Depends(get_db), cu=BH_OR_ADMIN):
    is_admin = cu.role.value in _PRIVILEGED
    pod_id = 0 if is_admin else _pod_id_or_404(db, cu.id)
    _setup_or_404(db, setup_id, pod_id, is_admin)
    service.delete_customer(db, customer_id, setup_id)
    return {"ok": True}


# ── pod members ───────────────────────────────────────────────────────────────

@router.get("/setup/{setup_id}/pod-members")
def pod_members(setup_id: int, db: Session = Depends(get_db), cu=BH_OR_ADMIN):
    is_admin = cu.role.value in _PRIVILEGED
    pod_id = 0 if is_admin else _pod_id_or_404(db, cu.id)
    s = _setup_or_404(db, setup_id, pod_id, is_admin)
    return {"members": service.list_pod_members(db, s["pod_id"])}


# ── recruiter assignments ─────────────────────────────────────────────────────

@router.get("/setup/{setup_id}/recruiters")
def list_recruiters(setup_id: int, db: Session = Depends(get_db), cu=BH_OR_ADMIN):
    is_admin = cu.role.value in _PRIVILEGED
    pod_id = 0 if is_admin else _pod_id_or_404(db, cu.id)
    _setup_or_404(db, setup_id, pod_id, is_admin)
    return {"assignments": service.list_recruiter_assignments(db, setup_id)}


@router.post("/setup/{setup_id}/recruiters")
def save_recruiters(setup_id: int, body: RecruitersBulk, db: Session = Depends(get_db), cu=BH_OR_ADMIN):
    is_admin = cu.role.value in _PRIVILEGED
    pod_id = 0 if is_admin else _pod_id_or_404(db, cu.id)
    _setup_or_404(db, setup_id, pod_id, is_admin)
    entries = [a.model_dump() for a in body.assignments]
    service.upsert_recruiter_assignments(db, setup_id, entries)
    return {"assignments": service.list_recruiter_assignments(db, setup_id)}


# ── KAM assignments ───────────────────────────────────────────────────────────

@router.get("/setup/{setup_id}/kams")
def list_kams(setup_id: int, db: Session = Depends(get_db), cu=BH_OR_ADMIN):
    is_admin = cu.role.value in _PRIVILEGED
    pod_id = 0 if is_admin else _pod_id_or_404(db, cu.id)
    _setup_or_404(db, setup_id, pod_id, is_admin)
    return {"kams": service.list_kam_assignments(db, setup_id)}


@router.post("/setup/{setup_id}/kams")
def save_kams(setup_id: int, body: KAMsBulk, db: Session = Depends(get_db), cu=BH_OR_ADMIN):
    is_admin = cu.role.value in _PRIVILEGED
    pod_id = 0 if is_admin else _pod_id_or_404(db, cu.id)
    _setup_or_404(db, setup_id, pod_id, is_admin)
    entries = [a.model_dump() for a in body.assignments]
    service.upsert_kam_assignments(db, setup_id, entries)
    return {"kams": service.list_kam_assignments(db, setup_id)}


# ── weekly OB targets ─────────────────────────────────────────────────────────

@router.get("/setup/{setup_id}/weekly-obs")
def list_weekly_obs(setup_id: int, db: Session = Depends(get_db), cu=BH_OR_ADMIN):
    is_admin = cu.role.value in _PRIVILEGED
    pod_id = 0 if is_admin else _pod_id_or_404(db, cu.id)
    _setup_or_404(db, setup_id, pod_id, is_admin)
    return {"weekly_obs": service.list_weekly_ob_targets(db, setup_id)}


@router.post("/setup/{setup_id}/weekly-obs")
def save_weekly_obs(setup_id: int, body: WeeklyOBBulk, db: Session = Depends(get_db), cu=BH_OR_ADMIN):
    is_admin = cu.role.value in _PRIVILEGED
    pod_id = 0 if is_admin else _pod_id_or_404(db, cu.id)
    _setup_or_404(db, setup_id, pod_id, is_admin)
    entries = [e.model_dump() for e in body.entries]
    service.upsert_weekly_ob_targets(db, setup_id, entries)
    return {"weekly_obs": service.list_weekly_ob_targets(db, setup_id)}


# ── daily actuals ─────────────────────────────────────────────────────────────

@router.get("/setup/{setup_id}/daily/{entry_date}")
def get_daily(setup_id: int, entry_date: str, db: Session = Depends(get_db), cu=BH_OR_ADMIN):
    is_admin = cu.role.value in _PRIVILEGED
    pod_id = 0 if is_admin else _pod_id_or_404(db, cu.id)
    s = _setup_or_404(db, setup_id, pod_id, is_admin)
    actual_pod_id = s["pod_id"]
    actuals = service.get_daily_actuals(db, setup_id, entry_date)
    dl_subs = service.get_dl_subs_for_date(db, setup_id, actual_pod_id, entry_date)
    ol_auto = service.get_ol_daily_actuals(db, setup_id, entry_date)
    actual_subs_auto = ol_auto["subs"]
    actual_sel_auto = ol_auto["sel"]
    actual_obs_auto = ol_auto["obs"]
    week_info = service.week_for_date(entry_date, s["month"], s.get("custom_working_days"))
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
        "dl_subs": dl_subs,
        "actual_subs_auto": actual_subs_auto,
        "actual_sel_auto": actual_sel_auto,
        "actual_obs_auto": actual_obs_auto,
        "week_info": week_info,
        "week_ob_actuals": week_ob_actuals,
        "week_ob_targets": week_ob_targets,
    }


@router.post("/setup/{setup_id}/daily/{entry_date}")
def save_daily(setup_id: int, entry_date: str, body: DailyActualsBulk,
               db: Session = Depends(get_db), cu=BH_OR_ADMIN):
    is_admin = cu.role.value in _PRIVILEGED
    pod_id = 0 if is_admin else _pod_id_or_404(db, cu.id)
    _setup_or_404(db, setup_id, pod_id, is_admin)
    entries = [e.model_dump() for e in body.entries]
    service.save_daily_actuals(db, setup_id, entry_date, entries)
    return {"ok": True}


@router.get("/setup/{setup_id}/monthly-progress")
def monthly_progress(setup_id: int, db: Session = Depends(get_db), cu=BH_OR_ADMIN):
    is_admin = cu.role.value in _PRIVILEGED
    pod_id = 0 if is_admin else _pod_id_or_404(db, cu.id)
    s = _setup_or_404(db, setup_id, pod_id, is_admin)
    actuals = service.get_monthly_actuals(db, setup_id, s["month"])
    return {"monthly_actuals": actuals}


@router.get("/setup/{setup_id}/working-days")
def working_days(setup_id: int, db: Session = Depends(get_db), cu=BH_OR_ADMIN):
    is_admin = cu.role.value in _PRIVILEGED
    pod_id = 0 if is_admin else _pod_id_or_404(db, cu.id)
    s = _setup_or_404(db, setup_id, pod_id, is_admin)
    custom = s.get("custom_working_days")
    days = custom if (custom and isinstance(custom, list) and len(custom) > 0) else service.working_days_for_month(s["month"])
    return {"working_days": days}


# ── compute endpoints ─────────────────────────────────────────────────────────

@router.get("/setup/{setup_id}/metrics")
def get_metrics(setup_id: int, db: Session = Depends(get_db), cu=BH_OR_ADMIN):
    is_admin = cu.role.value in _PRIVILEGED
    pod_id = 0 if is_admin else _pod_id_or_404(db, cu.id)
    s = _setup_or_404(db, setup_id, pod_id, is_admin)
    customers = service.list_customers(db, setup_id)
    recruiters = service.list_recruiter_assignments(db, setup_id)
    kams = service.list_kam_assignments(db, setup_id)
    metrics = service.compute_metrics(s, customers, recruiters)
    metrics["kams"] = kams
    return metrics


@router.get("/setup/{setup_id}/plan")
def get_plan(setup_id: int, db: Session = Depends(get_db), cu=BH_OR_ADMIN):
    is_admin = cu.role.value in _PRIVILEGED
    pod_id = 0 if is_admin else _pod_id_or_404(db, cu.id)
    s = _setup_or_404(db, setup_id, pod_id, is_admin)
    customers = service.list_customers(db, setup_id)
    recruiters = service.list_recruiter_assignments(db, setup_id)
    kams = service.list_kam_assignments(db, setup_id)
    metrics = service.compute_metrics(s, customers, recruiters)
    enriched = metrics["customers"]
    plan = service.compute_plan(s, enriched, recruiters)
    kam_plans = service.compute_kam_plan(s, enriched, kams)
    weekly_obs = service.list_weekly_ob_targets(db, setup_id)
    return {**plan, "kam_plans": kam_plans, "weekly_obs": weekly_obs}


# ── BH leaderboard — split into list + per-BH detail ─────────────────────────

@router.get("/bh-leaderboard/bhs")
def bh_leaderboard_list(
    date: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    cu=LEADERSHIP,
):
    """Lightweight: returns the list of BH pods for the month. No OL calls."""
    target_date = date or datetime.now().strftime("%Y-%m-%d")
    month = datetime.strptime(target_date, "%Y-%m-%d").strftime("%B %Y")

    rows = db.execute(text("""
        SELECT s.id AS setup_id, p.id AS pod_id, u.name AS bh_name
        FROM bh_pod_setups s
        JOIN pods p ON p.id = s.pod_id
        JOIN users u ON u.id = p.bh_user_id AND u.is_active = true
        WHERE s.month = :month
        ORDER BY u.name
    """), {"month": month}).mappings().all()

    return {
        "date": target_date,
        "month": month,
        "bhs": [{"setup_id": r["setup_id"], "pod_id": r["pod_id"], "bh_name": r["bh_name"]} for r in rows],
    }


@router.get("/bh-leaderboard/overview")
def bh_leaderboard_overview(
    date: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    cu=LEADERSHIP,
):
    """Combined view: one row per BH (totals across its customers) for every pod in
    the month. Same 18 fields as a BH detail row, summed per BH, using ONE OL
    round-trip across all pods' clients. Rows are shaped like detail customer rows so
    the frontend renders them through the same table (BH name in the first column).

    Registered before the ``/{setup_id}`` route so "overview" isn't parsed as an int.
    """
    target_date = date or datetime.now().strftime("%Y-%m-%d")
    month = datetime.strptime(target_date, "%Y-%m-%d").strftime("%B %Y")

    ist_dt = datetime.strptime(target_date, "%Y-%m-%d")
    day_start_utc = ist_dt - timedelta(hours=5, minutes=30)
    day_end_utc = day_start_utc + timedelta(hours=24)

    ref = datetime.strptime(month, "%B %Y")
    m_start = ref.date().isoformat()
    m_end = (
        _date(ref.year + 1, 1, 1).isoformat()
        if ref.month == 12
        else _date(ref.year, ref.month + 1, 1).isoformat()
    )
    mtd_start_utc = datetime.strptime(m_start, "%Y-%m-%d") - timedelta(hours=5, minutes=30)

    # ── 1. All setups for the month ───────────────────────────────────────────
    setup_rows = db.execute(text("""
        SELECT s.*, u.name AS bh_name, p.id AS pod_id
        FROM bh_pod_setups s
        JOIN pods p ON p.id = s.pod_id
        JOIN users u ON u.id = p.bh_user_id AND u.is_active = true
        WHERE s.month = :month
        ORDER BY u.name
    """), {"month": month}).mappings().all()

    if not setup_rows:
        return {"date": target_date, "month": month, "rows": []}

    setups = [dict(r) for r in setup_rows]
    setup_ids = [s["id"] for s in setups]

    # ── 2. Batched PG loads, grouped by setup ─────────────────────────────────
    customers_by_setup: dict[int, list[dict]] = {sid: [] for sid in setup_ids}
    for r in db.execute(text("""
        SELECT * FROM bh_customer_targets
        WHERE setup_id = ANY(:ids) ORDER BY display_order
    """), {"ids": setup_ids}).mappings().all():
        customers_by_setup[r["setup_id"]].append(dict(r))

    recruiters_by_setup: dict[int, list[dict]] = {sid: [] for sid in setup_ids}
    for r in db.execute(text("""
        SELECT ra.*, u.name AS user_name, u.role AS user_role
        FROM bh_recruiter_assignments ra
        JOIN users u ON u.id = ra.user_id
        WHERE ra.setup_id = ANY(:ids)
    """), {"ids": setup_ids}).mappings().all():
        recruiters_by_setup[r["setup_id"]].append(dict(r))

    actuals_by_setup: dict[int, dict[int, dict]] = {sid: {} for sid in setup_ids}
    for r in db.execute(text("""
        SELECT setup_id, customer_target_id, actual_subs, actual_interviews, actual_selects, actual_obs
        FROM bh_daily_actuals
        WHERE setup_id = ANY(:ids) AND entry_date = :d
    """), {"ids": setup_ids, "d": target_date}).mappings().all():
        actuals_by_setup[r["setup_id"]][r["customer_target_id"]] = dict(r)

    mtd_by_setup: dict[int, dict[int, dict]] = {sid: {} for sid in setup_ids}
    for r in db.execute(text("""
        SELECT setup_id, customer_target_id,
               COALESCE(SUM(actual_subs), 0)       AS subs,
               COALESCE(SUM(actual_interviews), 0) AS interviews,
               COALESCE(SUM(actual_selects), 0)    AS selects,
               COALESCE(SUM(actual_obs), 0)        AS obs
        FROM bh_daily_actuals
        WHERE setup_id = ANY(:ids) AND entry_date >= :s AND entry_date < :e
        GROUP BY setup_id, customer_target_id
    """), {"ids": setup_ids, "s": m_start, "e": m_end}).mappings().all():
        mtd_by_setup[r["setup_id"]][r["customer_target_id"]] = dict(r)

    dl_by_setup: dict[int, dict[int, int]] = {sid: {} for sid in setup_ids}
    for r in db.execute(text("""
        SELECT ct.setup_id AS setup_id, ct.id AS customer_target_id,
               COUNT(DISTINCT v.candidate_id) AS dl_subs
        FROM validations v
        JOIN candidates c ON c.id = v.candidate_id
        JOIN jobs j ON j.id = c.job_id
        JOIN bh_customer_targets ct ON (
            ct.client_id = j.client_id
            OR (ct.client_ids IS NOT NULL AND ct.client_ids @> to_jsonb(j.client_id))
        )
        JOIN bh_pod_setups s ON s.id = ct.setup_id
        JOIN pods p ON p.id = s.pod_id
        WHERE v.status = 'validated'
          AND c.sourced_at >= :day_start AND c.sourced_at < :day_end
          AND EXISTS (
              SELECT 1 FROM users u
              WHERE u.id = c.sourced_by_id AND u.pod_id = p.id AND u.is_active = true
          )
          AND ct.setup_id = ANY(:ids)
        GROUP BY ct.setup_id, ct.id
    """), {"ids": setup_ids, "day_start": day_start_utc, "day_end": day_end_utc}).mappings().all():
        dl_by_setup[r["setup_id"]][r["customer_target_id"]] = int(r["dl_subs"])

    # ── 3. Global client_id → ct_id (first-wins if a client spans pods) ───────
    client_to_ct: dict[int, int] = {}
    for sid in setup_ids:
        for c in customers_by_setup[sid]:
            for x in service.customer_client_ids(c):
                client_to_ct.setdefault(x, c["id"])

    # ── 4. ONE OL round-trip across all clients ───────────────────────────────
    db.close()
    ol_by_client = service.fetch_ol_leaderboard_metrics(
        list(client_to_ct.keys()),
        target_date=target_date, m_start=m_start,
        day_start_utc=day_start_utc, day_end_utc=day_end_utc, mtd_start_utc=mtd_start_utc,
    )
    ol_ct = service.ol_metrics_by_ct(ol_by_client, client_to_ct)

    # ── 5. Per-setup compute, then sum each BH's customers into one row ───────
    sum_fields = (
        "daily_subs_target", "daily_int_target", "daily_sel_target", "daily_obs_target",
        "actual_subs", "dl_subs", "actual_int", "actual_sel", "actual_obs",
        "monthly_subs", "monthly_int", "selects_needed", "obs_needed",
        "mtd_subs", "mtd_int", "mtd_sel", "mtd_obs",
    )
    rows = []
    for s in setups:
        sid = s["id"]
        customers = customers_by_setup[sid]
        recruiters = recruiters_by_setup[sid]
        enriched = {c["id"]: c for c in service.compute_metrics(s, customers, recruiters)["customers"]}
        totals = {f: 0 for f in sum_fields}
        for c in customers:
            row = service.assemble_bh_customer_row(
                s, c, enriched.get(c["id"], {}),
                actuals_by_setup[sid].get(c["id"], {}),
                mtd_by_setup[sid].get(c["id"], {}),
                dl_by_setup[sid].get(c["id"], 0),
                ol_ct, target_date,
            )
            for f in sum_fields:
                totals[f] += row[f]
        rows.append({"customer_name": s["bh_name"], "customer_target_id": sid, **totals})

    return {"date": target_date, "month": month, "rows": rows}


@router.get("/bh-leaderboard/ol-only")
def bh_leaderboard_ol_only(
    date: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    cu=LEADERSHIP,
):
    """OL-only buckets sourced purely from the offer-letter DB (no targets/DL):
      • each configured OL-only BH (e.g. "Jawad Ulla Khan Non IT") — all its CSV clients;
      • an "Unmapped" bucket — CSV clients that have a BH but no pod-plan target this
        month and aren't a named OL-only BH.
    Per-client OL actuals (subs/int/sel/obs + MTD) plus per-bucket totals, via the same
    OL query as the pod views.

    Registered before the ``/{setup_id}`` route so "ol-only" isn't parsed as an int.
    """
    target_date = date or datetime.now().strftime("%Y-%m-%d")
    month = datetime.strptime(target_date, "%Y-%m-%d").strftime("%B %Y")

    ist_dt = datetime.strptime(target_date, "%Y-%m-%d")
    day_start_utc = ist_dt - timedelta(hours=5, minutes=30)
    day_end_utc = day_start_utc + timedelta(hours=24)

    ref = datetime.strptime(month, "%B %Y")
    m_start = ref.date().isoformat()
    mtd_start_utc = datetime.strptime(m_start, "%Y-%m-%d") - timedelta(hours=5, minutes=30)

    # 1. OL client user_ids that already have a pod-plan target this month.
    targeted_rows = db.execute(text("""
        SELECT ct.client_id, ct.client_ids
        FROM bh_customer_targets ct
        JOIN bh_pod_setups s ON s.id = ct.setup_id
        WHERE s.month = :month
    """), {"month": month}).mappings().all()
    targeted_ids: set[int] = set()
    for r in targeted_rows:
        targeted_ids.update(service.customer_client_ids(dict(r)))

    # 2. Resolve clients per OL-only BH + the "Unmapped" bucket via the CSV mapping.
    db.close()  # no further PG needed
    buckets = service.resolve_ol_only_buckets(set(service.OL_ONLY_BH_NAMES), targeted_ids)

    all_ids = sorted({uid for clients in buckets.values() for (uid, _) in clients})

    # 3. ONE OL round-trip for every client across all buckets.
    ol_by_client = service.fetch_ol_leaderboard_metrics(
        all_ids,
        target_date=target_date, m_start=m_start,
        day_start_utc=day_start_utc, day_end_utc=day_end_utc, mtd_start_utc=mtd_start_utc,
    )

    sum_fields = (
        "actual_subs", "actual_int", "actual_sel", "actual_obs",
        "mtd_subs", "mtd_int", "mtd_sel", "mtd_obs",
    )
    bhs = []
    for idx, bh_name in enumerate([*service.OL_ONLY_BH_NAMES, service.UNMAPPED_BUCKET]):
        clients = buckets.get(bh_name, [])
        customers = [service.ol_only_row(cname, uid, ol_by_client) for (uid, cname) in clients]
        totals = service.ol_only_row(bh_name, -(idx + 1), {})  # zero-filled skeleton
        for row in customers:
            for f in sum_fields:
                totals[f] += row[f]
        bhs.append({"bh_name": bh_name, "customers": customers, "totals": totals})

    return {"date": target_date, "month": month, "bhs": bhs}


@router.get("/bh-leaderboard/{setup_id}")
def bh_leaderboard_detail(
    setup_id: int,
    date: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    cu=LEADERSHIP,
):
    """Heavy: all PG + OL data for one BH. Called only when user selects a BH."""
    target_date = date or datetime.now().strftime("%Y-%m-%d")
    month = datetime.strptime(target_date, "%Y-%m-%d").strftime("%B %Y")

    ist_dt = datetime.strptime(target_date, "%Y-%m-%d")
    day_start_utc = ist_dt - timedelta(hours=5, minutes=30)
    day_end_utc = day_start_utc + timedelta(hours=24)

    ref = datetime.strptime(month, "%B %Y")
    m_start = ref.date().isoformat()
    m_end = (
        _date(ref.year + 1, 1, 1).isoformat()
        if ref.month == 12
        else _date(ref.year, ref.month + 1, 1).isoformat()
    )

    # ── 1. All PG queries for this one setup ─────────────────────────────────
    s_row = db.execute(text("""
        SELECT s.*, u.name AS bh_name, p.id AS pod_id
        FROM bh_pod_setups s
        JOIN pods p ON p.id = s.pod_id
        JOIN users u ON u.id = p.bh_user_id AND u.is_active = true
        WHERE s.id = :sid
    """), {"sid": setup_id}).mappings().first()

    if not s_row:
        raise HTTPException(status_code=404, detail="Setup not found")

    s = dict(s_row)

    cust_rows = db.execute(text("""
        SELECT * FROM bh_customer_targets
        WHERE setup_id = :sid ORDER BY display_order
    """), {"sid": setup_id}).mappings().all()

    rec_rows = db.execute(text("""
        SELECT ra.*, u.name AS user_name, u.role AS user_role
        FROM bh_recruiter_assignments ra
        JOIN users u ON u.id = ra.user_id
        WHERE ra.setup_id = :sid
    """), {"sid": setup_id}).mappings().all()

    daily_rows = db.execute(text("""
        SELECT customer_target_id, actual_subs, actual_interviews, actual_selects, actual_obs
        FROM bh_daily_actuals
        WHERE setup_id = :sid AND entry_date = :d
    """), {"sid": setup_id, "d": target_date}).mappings().all()

    dl_rows = db.execute(text("""
        SELECT ct.id AS customer_target_id, COUNT(DISTINCT v.candidate_id) AS dl_subs
        FROM validations v
        JOIN candidates c ON c.id = v.candidate_id
        JOIN jobs j ON j.id = c.job_id
        JOIN bh_customer_targets ct ON (
            ct.client_id = j.client_id
            OR (ct.client_ids IS NOT NULL AND ct.client_ids @> to_jsonb(j.client_id))
        )
        JOIN bh_pod_setups s ON s.id = ct.setup_id
        JOIN pods p ON p.id = s.pod_id
        WHERE v.status = 'validated'
          AND c.sourced_at >= :day_start AND c.sourced_at < :day_end
          AND EXISTS (
              SELECT 1 FROM users u
              WHERE u.id = c.sourced_by_id AND u.pod_id = p.id AND u.is_active = true
          )
          AND ct.setup_id = :sid
        GROUP BY ct.id
    """), {"sid": setup_id, "day_start": day_start_utc, "day_end": day_end_utc}).mappings().all()

    mtd_rows = db.execute(text("""
        SELECT customer_target_id,
               COALESCE(SUM(actual_subs), 0)       AS subs,
               COALESCE(SUM(actual_interviews), 0) AS interviews,
               COALESCE(SUM(actual_selects), 0)    AS selects,
               COALESCE(SUM(actual_obs), 0)        AS obs
        FROM bh_daily_actuals
        WHERE setup_id = :sid AND entry_date >= :s AND entry_date < :e
        GROUP BY customer_target_id
    """), {"sid": setup_id, "s": m_start, "e": m_end}).mappings().all()

    # ── 2. Release PG connection before OL calls ──────────────────────────────
    db.close()

    # ── 3. Index PG data ──────────────────────────────────────────────────────
    customers = [dict(c) for c in cust_rows]
    actuals = {r["customer_target_id"]: dict(r) for r in daily_rows}
    dl_subs = {r["customer_target_id"]: int(r["dl_subs"]) for r in dl_rows}
    mtd = {r["customer_target_id"]: dict(r) for r in mtd_rows}

    # ── 4. OL call for this setup's client_ids only (one round-trip) ──────────
    client_to_ct: dict[int, int] = {}
    for c in customers:
        for x in service.customer_client_ids(c):
            client_to_ct.setdefault(x, c["id"])

    # MTD start as a sargable UTC bound (first of month, IST midnight → UTC).
    mtd_start_utc = datetime.strptime(m_start, "%Y-%m-%d") - timedelta(hours=5, minutes=30)
    ol_by_client = service.fetch_ol_leaderboard_metrics(
        list(client_to_ct.keys()),
        target_date=target_date, m_start=m_start,
        day_start_utc=day_start_utc, day_end_utc=day_end_utc, mtd_start_utc=mtd_start_utc,
    )
    ol_ct = service.ol_metrics_by_ct(ol_by_client, client_to_ct)

    # ── 5. Compute metrics + assemble ─────────────────────────────────────────
    recruiters = [dict(r) for r in rec_rows]
    metrics = service.compute_metrics(s, customers, recruiters)
    enriched = {c["id"]: c for c in metrics["customers"]}

    customer_rows = [
        service.assemble_bh_customer_row(
            s, c, enriched.get(c["id"], {}), actuals.get(c["id"], {}),
            mtd.get(c["id"], {}), dl_subs.get(c["id"], 0), ol_ct, target_date,
        )
        for c in customers
    ]

    return {
        "date": target_date,
        "month": month,
        "setup_id": setup_id,
        "bh_name": s["bh_name"],
        "pod_id": s["pod_id"],
        "customers": customer_rows,
    }
