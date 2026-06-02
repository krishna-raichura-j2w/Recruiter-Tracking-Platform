from __future__ import annotations

import json
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

BH_OR_ADMIN = Depends(require_roles("bh", "admin"))
LEADERSHIP = Depends(require_roles("admin", "coo", "ops_head"))


def _effective_bh_id(cu, as_bh: Optional[int]) -> int:
    if cu.role == "admin":
        if not as_bh:
            raise HTTPException(400, "Admin must supply ?as_bh=<bh_user_id>")
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
    is_admin = cu.role == "admin"
    pod_id = 0 if is_admin else _pod_id_or_404(db, cu.id)
    _setup_or_404(db, setup_id, pod_id, is_admin)
    return {"customers": service.list_customers(db, setup_id)}


@router.post("/setup/{setup_id}/customers")
def upsert_customer(setup_id: int, body: CustomerUpsert, db: Session = Depends(get_db), cu=BH_OR_ADMIN):
    is_admin = cu.role == "admin"
    pod_id = 0 if is_admin else _pod_id_or_404(db, cu.id)
    _setup_or_404(db, setup_id, pod_id, is_admin)
    customer = service.upsert_customer(db, setup_id, body.model_dump())
    return {"customer": customer}


@router.delete("/setup/{setup_id}/customers/{customer_id}")
def delete_customer(setup_id: int, customer_id: int, db: Session = Depends(get_db), cu=BH_OR_ADMIN):
    is_admin = cu.role == "admin"
    pod_id = 0 if is_admin else _pod_id_or_404(db, cu.id)
    _setup_or_404(db, setup_id, pod_id, is_admin)
    service.delete_customer(db, customer_id, setup_id)
    return {"ok": True}


# ── pod members ───────────────────────────────────────────────────────────────

@router.get("/setup/{setup_id}/pod-members")
def pod_members(setup_id: int, db: Session = Depends(get_db), cu=BH_OR_ADMIN):
    is_admin = cu.role == "admin"
    pod_id = 0 if is_admin else _pod_id_or_404(db, cu.id)
    s = _setup_or_404(db, setup_id, pod_id, is_admin)
    return {"members": service.list_pod_members(db, s["pod_id"])}


# ── recruiter assignments ─────────────────────────────────────────────────────

@router.get("/setup/{setup_id}/recruiters")
def list_recruiters(setup_id: int, db: Session = Depends(get_db), cu=BH_OR_ADMIN):
    is_admin = cu.role == "admin"
    pod_id = 0 if is_admin else _pod_id_or_404(db, cu.id)
    _setup_or_404(db, setup_id, pod_id, is_admin)
    return {"assignments": service.list_recruiter_assignments(db, setup_id)}


@router.post("/setup/{setup_id}/recruiters")
def save_recruiters(setup_id: int, body: RecruitersBulk, db: Session = Depends(get_db), cu=BH_OR_ADMIN):
    is_admin = cu.role == "admin"
    pod_id = 0 if is_admin else _pod_id_or_404(db, cu.id)
    _setup_or_404(db, setup_id, pod_id, is_admin)
    entries = [a.model_dump() for a in body.assignments]
    service.upsert_recruiter_assignments(db, setup_id, entries)
    return {"assignments": service.list_recruiter_assignments(db, setup_id)}


# ── KAM assignments ───────────────────────────────────────────────────────────

@router.get("/setup/{setup_id}/kams")
def list_kams(setup_id: int, db: Session = Depends(get_db), cu=BH_OR_ADMIN):
    is_admin = cu.role == "admin"
    pod_id = 0 if is_admin else _pod_id_or_404(db, cu.id)
    _setup_or_404(db, setup_id, pod_id, is_admin)
    return {"kams": service.list_kam_assignments(db, setup_id)}


@router.post("/setup/{setup_id}/kams")
def save_kams(setup_id: int, body: KAMsBulk, db: Session = Depends(get_db), cu=BH_OR_ADMIN):
    is_admin = cu.role == "admin"
    pod_id = 0 if is_admin else _pod_id_or_404(db, cu.id)
    _setup_or_404(db, setup_id, pod_id, is_admin)
    entries = [a.model_dump() for a in body.assignments]
    service.upsert_kam_assignments(db, setup_id, entries)
    return {"kams": service.list_kam_assignments(db, setup_id)}


# ── weekly OB targets ─────────────────────────────────────────────────────────

@router.get("/setup/{setup_id}/weekly-obs")
def list_weekly_obs(setup_id: int, db: Session = Depends(get_db), cu=BH_OR_ADMIN):
    is_admin = cu.role == "admin"
    pod_id = 0 if is_admin else _pod_id_or_404(db, cu.id)
    _setup_or_404(db, setup_id, pod_id, is_admin)
    return {"weekly_obs": service.list_weekly_ob_targets(db, setup_id)}


@router.post("/setup/{setup_id}/weekly-obs")
def save_weekly_obs(setup_id: int, body: WeeklyOBBulk, db: Session = Depends(get_db), cu=BH_OR_ADMIN):
    is_admin = cu.role == "admin"
    pod_id = 0 if is_admin else _pod_id_or_404(db, cu.id)
    _setup_or_404(db, setup_id, pod_id, is_admin)
    entries = [e.model_dump() for e in body.entries]
    service.upsert_weekly_ob_targets(db, setup_id, entries)
    return {"weekly_obs": service.list_weekly_ob_targets(db, setup_id)}


# ── daily actuals ─────────────────────────────────────────────────────────────

@router.get("/setup/{setup_id}/daily/{entry_date}")
def get_daily(setup_id: int, entry_date: str, db: Session = Depends(get_db), cu=BH_OR_ADMIN):
    is_admin = cu.role == "admin"
    pod_id = 0 if is_admin else _pod_id_or_404(db, cu.id)
    s = _setup_or_404(db, setup_id, pod_id, is_admin)
    actual_pod_id = s["pod_id"]
    actuals = service.get_daily_actuals(db, setup_id, entry_date)
    dl_subs = service.get_dl_subs_for_date(db, setup_id, actual_pod_id, entry_date)
    actual_subs_auto = service.get_actual_subs_from_ol(db, setup_id, entry_date)
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
        "week_info": week_info,
        "week_ob_actuals": week_ob_actuals,
        "week_ob_targets": week_ob_targets,
    }


@router.post("/setup/{setup_id}/daily/{entry_date}")
def save_daily(setup_id: int, entry_date: str, body: DailyActualsBulk,
               db: Session = Depends(get_db), cu=BH_OR_ADMIN):
    is_admin = cu.role == "admin"
    pod_id = 0 if is_admin else _pod_id_or_404(db, cu.id)
    _setup_or_404(db, setup_id, pod_id, is_admin)
    entries = [e.model_dump() for e in body.entries]
    service.save_daily_actuals(db, setup_id, entry_date, entries)
    return {"ok": True}


@router.get("/setup/{setup_id}/monthly-progress")
def monthly_progress(setup_id: int, db: Session = Depends(get_db), cu=BH_OR_ADMIN):
    is_admin = cu.role == "admin"
    pod_id = 0 if is_admin else _pod_id_or_404(db, cu.id)
    s = _setup_or_404(db, setup_id, pod_id, is_admin)
    actuals = service.get_monthly_actuals(db, setup_id, s["month"])
    return {"monthly_actuals": actuals}


@router.get("/setup/{setup_id}/working-days")
def working_days(setup_id: int, db: Session = Depends(get_db), cu=BH_OR_ADMIN):
    is_admin = cu.role == "admin"
    pod_id = 0 if is_admin else _pod_id_or_404(db, cu.id)
    s = _setup_or_404(db, setup_id, pod_id, is_admin)
    custom = s.get("custom_working_days")
    days = custom if (custom and isinstance(custom, list) and len(custom) > 0) else service.working_days_for_month(s["month"])
    return {"working_days": days}


# ── compute endpoints ─────────────────────────────────────────────────────────

@router.get("/setup/{setup_id}/metrics")
def get_metrics(setup_id: int, db: Session = Depends(get_db), cu=BH_OR_ADMIN):
    is_admin = cu.role == "admin"
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
    is_admin = cu.role == "admin"
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


# ── BH leaderboard (admin / COO / ops_head view) ──────────────────────────────

@router.get("/bh-leaderboard")
def bh_leaderboard(
    date: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    cu=LEADERSHIP,
):
    from core.config import settings as _cfg

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

    # ── 1. All PostgreSQL data in one batch (no per-BH loop) ─────────────────

    setup_rows = db.execute(text("""
        SELECT s.*, u.name AS bh_name, p.id AS pod_id
        FROM bh_pod_setups s
        JOIN pods p ON p.id = s.pod_id
        JOIN users u ON u.id = p.bh_user_id AND u.is_active = true
        WHERE s.month = :month
        ORDER BY u.name
    """), {"month": month}).mappings().all()

    if not setup_rows:
        db.close()
        return {"date": target_date, "month": month, "bhs": []}

    setup_ids = [int(s["id"]) for s in setup_rows]

    cust_rows = db.execute(text("""
        SELECT * FROM bh_customer_targets
        WHERE setup_id = ANY(:sids)
        ORDER BY setup_id, display_order
    """), {"sids": setup_ids}).mappings().all()

    rec_rows = db.execute(text("""
        SELECT ra.*, u.name AS user_name, u.role AS user_role
        FROM bh_recruiter_assignments ra
        JOIN users u ON u.id = ra.user_id
        WHERE ra.setup_id = ANY(:sids)
    """), {"sids": setup_ids}).mappings().all()

    daily_rows = db.execute(text("""
        SELECT setup_id, customer_target_id,
               actual_subs, actual_interviews, actual_selects, actual_obs
        FROM bh_daily_actuals
        WHERE setup_id = ANY(:sids) AND entry_date = :d
    """), {"sids": setup_ids, "d": target_date}).mappings().all()

    dl_rows = db.execute(text("""
        SELECT ct.setup_id, ct.id AS customer_target_id,
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
          AND c.sourced_at >= :day_start
          AND c.sourced_at < :day_end
          AND EXISTS (
              SELECT 1 FROM users u
              WHERE u.id = c.sourced_by_id AND u.pod_id = p.id AND u.is_active = true
          )
          AND ct.setup_id = ANY(:sids)
        GROUP BY ct.setup_id, ct.id
    """), {"sids": setup_ids, "day_start": day_start_utc, "day_end": day_end_utc}).mappings().all()

    mtd_rows = db.execute(text("""
        SELECT setup_id, customer_target_id,
               COALESCE(SUM(actual_subs), 0)       AS subs,
               COALESCE(SUM(actual_interviews), 0) AS interviews,
               COALESCE(SUM(actual_selects), 0)    AS selects,
               COALESCE(SUM(actual_obs), 0)        AS obs
        FROM bh_daily_actuals
        WHERE setup_id = ANY(:sids) AND entry_date >= :s AND entry_date < :e
        GROUP BY setup_id, customer_target_id
    """), {"sids": setup_ids, "s": m_start, "e": m_end}).mappings().all()

    # ── 2. Release the PG connection — OL calls must not hold it ─────────────
    db.close()

    # ── 3. Index PG data by setup_id in Python ───────────────────────────────
    custs_by_setup: dict[int, list[dict]] = {}
    for c in cust_rows:
        custs_by_setup.setdefault(c["setup_id"], []).append(dict(c))

    recs_by_setup: dict[int, list[dict]] = {}
    for r in rec_rows:
        recs_by_setup.setdefault(r["setup_id"], []).append(dict(r))

    actuals_idx: dict[int, dict[int, dict]] = {}
    for a in daily_rows:
        actuals_idx.setdefault(a["setup_id"], {})[a["customer_target_id"]] = dict(a)

    dl_idx: dict[int, dict[int, int]] = {}
    for d in dl_rows:
        dl_idx.setdefault(d["setup_id"], {})[d["customer_target_id"]] = int(d["dl_subs"])

    mtd_idx: dict[int, dict[int, dict]] = {}
    for m in mtd_rows:
        mtd_idx.setdefault(m["setup_id"], {})[m["customer_target_id"]] = dict(m)

    # ── 4. Single OL MySQL connection: subs + interviews for ALL setups ───────
    # Build global ol_user_id → [(setup_id, ct_id)] map
    ol_to_cts: dict[int, list[tuple[int, int]]] = {}
    for c in cust_rows:
        sid, ct_id = c["setup_id"], c["id"]
        raw = c["client_id"]
        if raw is not None:
            ol_to_cts.setdefault(int(raw), []).append((sid, ct_id))
        cids = c["client_ids"]
        if cids:
            if isinstance(cids, str):
                cids = json.loads(cids)
            for x in cids:
                ol_to_cts.setdefault(int(x), []).append((sid, ct_id))

    ol_subs_idx: dict[int, dict[int, int]] = {}
    ol_int_idx: dict[int, dict[int, int]] = {}

    if ol_to_cts and _cfg.ol_replica_host:
        import pymysql
        all_ol_ids = list(ol_to_cts.keys())
        ph = ",".join(["%s"] * len(all_ol_ids))
        try:
            ol_conn = pymysql.connect(
                host=_cfg.ol_replica_host,
                port=_cfg.ol_replica_port,
                user=_cfg.ol_replica_user,
                password=_cfg.ol_replica_password,
                database=_cfg.ol_replica_database,
                connect_timeout=5,
                cursorclass=pymysql.cursors.DictCursor,
                ssl_disabled=True,
            )
            try:
                with ol_conn.cursor() as cur:
                    cur.execute(
                        f"""
                        SELECT 'sub' AS kind, cl.user_id AS client_id, COUNT(DISTINCT aj.id) AS cnt
                        FROM applied_jobs aj
                        JOIN job_postings jp ON aj.job_posting_id = jp.id
                        JOIN clients cl ON jp.client_id = cl.user_id
                        WHERE aj.current_step = 7
                          AND DATE(CONVERT_TZ(aj.created_at, '+00:00', '+05:30')) = %s
                          AND cl.user_id IN ({ph})
                        GROUP BY cl.user_id

                        UNION ALL

                        SELECT 'int' AS kind, jp.client_id AS client_id, COUNT(DISTINCT vs.id) AS cnt
                        FROM validation_screens vs
                        JOIN job_postings jp ON jp.id = vs.applied_candidate_for_job_id
                        WHERE vs.interview_date = %s
                          AND jp.client_id IN ({ph})
                          AND jp.id IS NOT NULL
                        GROUP BY jp.client_id
                        """,
                        [target_date] + all_ol_ids + [target_date] + all_ol_ids,
                    )
                    for row in cur.fetchall():
                        ol_uid = int(row["client_id"])
                        cnt = int(row["cnt"])
                        target_idx = ol_subs_idx if row["kind"] == "sub" else ol_int_idx
                        for sid, ct_id in ol_to_cts.get(ol_uid, []):
                            target_idx.setdefault(sid, {})[ct_id] = (
                                target_idx.get(sid, {}).get(ct_id, 0) + cnt
                            )
            finally:
                ol_conn.close()
        except Exception:
            pass  # OL unavailable — fall back to manual actuals

    # ── 5. Assemble response ─────────────────────────────────────────────────
    bhs = []
    for s_row in setup_rows:
        s = dict(s_row)
        setup_id = s["id"]
        customers = custs_by_setup.get(setup_id, [])
        recruiters = recs_by_setup.get(setup_id, [])

        metrics = service.compute_metrics(s, customers, recruiters)
        enriched = {c["id"]: c for c in metrics["customers"]}

        actuals = actuals_idx.get(setup_id, {})
        dl_subs = dl_idx.get(setup_id, {})
        ol_subs = ol_subs_idx.get(setup_id, {})
        ol_int = ol_int_idx.get(setup_id, {})
        monthly_actuals = mtd_idx.get(setup_id, {})

        customer_rows = []
        for c in customers:
            cid = c["id"]
            em = enriched.get(cid, {})
            act = actuals.get(cid, {})
            m_act = monthly_actuals.get(cid, {})
            monthly_subs = em.get("monthly_subs", 0)
            monthly_int = int(em.get("monthly_interviews", 0))

            customer_rows.append({
                "customer_name": c["customer_name"],
                "customer_target_id": cid,
                "daily_subs_target": service.daily_target_for_date(s, monthly_subs, target_date),
                "daily_int_target": c.get("target_interviews_day", 0),
                "daily_sel_target": round(em.get("daily_selects", 0)),
                "daily_obs_target": round(em.get("daily_obs", 0)),
                "actual_subs": ol_subs.get(cid, act.get("actual_subs", 0)),
                "dl_subs": dl_subs.get(cid, 0),
                "actual_int": ol_int.get(cid, act.get("actual_interviews", 0)),
                "actual_sel": act.get("actual_selects", 0),
                "actual_obs": act.get("actual_obs", 0),
                "monthly_subs": monthly_subs,
                "monthly_int": monthly_int,
                "selects_needed": em.get("selects_needed", 0),
                "obs_needed": em.get("obs_needed", 0),
                "mtd_subs": int(m_act.get("subs", 0)),
                "mtd_int": int(m_act.get("interviews", 0)),
                "mtd_sel": int(m_act.get("selects", 0)),
                "mtd_obs": int(m_act.get("obs", 0)),
            })

        bhs.append({
            "bh_name": s["bh_name"],
            "pod_id": s["pod_id"],
            "setup_id": setup_id,
            "month": month,
            "customers": customer_rows,
        })

    return {"date": target_date, "month": month, "bhs": bhs}
