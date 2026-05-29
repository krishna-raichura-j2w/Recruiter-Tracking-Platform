from __future__ import annotations

import json
import math
from datetime import date, datetime, timedelta

from sqlalchemy import text
from sqlalchemy.orm import Session


# ── date helpers ──────────────────────────────────────────────────────────────

def working_days_for_month(month_str: str) -> list[str]:
    ref = datetime.strptime(month_str, "%B %Y").replace(day=1).date()
    if ref.month == 12:
        last = ref.replace(year=ref.year + 1, month=1, day=1) - timedelta(days=1)
    else:
        last = ref.replace(month=ref.month + 1, day=1) - timedelta(days=1)
    days: list[str] = []
    cur = ref
    while cur <= last:
        if cur.weekday() < 5:
            days.append(cur.isoformat())
        cur += timedelta(days=1)
    return days


def week_buckets(month_str: str) -> list[dict]:
    """Return list of {week_num, week_label, week_start, week_end} for the month."""
    days = working_days_for_month(month_str)
    buckets: list[list[str]] = []
    bucket: list[str] = []
    for d in days:
        dt = datetime.strptime(d, "%Y-%m-%d").date()
        if bucket and dt.weekday() == 0:
            buckets.append(bucket)
            bucket = [d]
        else:
            bucket.append(d)
    if bucket:
        buckets.append(bucket)
    result = []
    for i, b in enumerate(buckets):
        result.append({
            "week_num": i + 1,
            "week_label": f"Week {i+1} ({b[0][5:]} – {b[-1][5:]})",
            "week_start": b[0],
            "week_end": b[-1],
        })
    return result


def week_for_date(date_str: str, month_str: str) -> dict | None:
    for w in week_buckets(month_str):
        if w["week_start"] <= date_str <= w["week_end"]:
            return w
    return None


def get_bh_pod_id(db: Session, bh_user_id: int) -> int | None:
    row = db.execute(
        text("SELECT id FROM pods WHERE bh_user_id = :uid"),
        {"uid": bh_user_id},
    ).first()
    return row[0] if row else None


# ── setup ─────────────────────────────────────────────────────────────────────

def get_setup(db: Session, pod_id: int, month: str) -> dict | None:
    row = db.execute(
        text("SELECT * FROM bh_pod_setups WHERE pod_id = :pid AND month = :m"),
        {"pid": pod_id, "m": month},
    ).mappings().first()
    return dict(row) if row else None


def upsert_setup(db: Session, pod_id: int, bh_user_id: int, data: dict) -> dict:
    existing = get_setup(db, pod_id, data["month"])
    if existing:
        db.execute(
            text("""UPDATE bh_pod_setups SET
                net_po_target=:net_po_target, exit_budget=:exit_budget,
                working_days=:working_days, target_selects_month=:target_selects_month,
                sel_ob_rate=:sel_ob_rate, subs_per_recruiter_day=:subs_per_recruiter_day,
                num_recruiters=:num_recruiters, interviews_per_kam_day=:interviews_per_kam_day,
                num_kams=:num_kams, updated_at=NOW()
                WHERE id=:id"""),
            {**data, "id": existing["id"]},
        )
    else:
        db.execute(
            text("""INSERT INTO bh_pod_setups
                (pod_id,bh_user_id,month,net_po_target,exit_budget,working_days,
                 target_selects_month,sel_ob_rate,subs_per_recruiter_day,
                 num_recruiters,interviews_per_kam_day,num_kams)
                VALUES
                (:pod_id,:bh_user_id,:month,:net_po_target,:exit_budget,:working_days,
                 :target_selects_month,:sel_ob_rate,:subs_per_recruiter_day,
                 :num_recruiters,:interviews_per_kam_day,:num_kams)"""),
            {"pod_id": pod_id, "bh_user_id": bh_user_id, **data},
        )
    db.commit()
    return get_setup(db, pod_id, data["month"])


# ── customers ─────────────────────────────────────────────────────────────────

def list_customers(db: Session, setup_id: int) -> list[dict]:
    rows = db.execute(
        text("SELECT * FROM bh_customer_targets WHERE setup_id=:sid ORDER BY display_order, id"),
        {"sid": setup_id},
    ).mappings().all()
    return [dict(r) for r in rows]


def upsert_customer(db: Session, setup_id: int, data: dict) -> dict:
    existing = db.execute(
        text("SELECT id FROM bh_customer_targets WHERE setup_id=:sid AND customer_name=:n"),
        {"sid": setup_id, "n": data["customer_name"]},
    ).first()
    if existing:
        fields = {k: v for k, v in data.items() if k != "customer_name"}
        if fields:
            sets = ", ".join(f"{k}=:{k}" for k in fields)
            db.execute(
                text(f"UPDATE bh_customer_targets SET {sets} WHERE id=:id"),
                {**fields, "id": existing[0]},
            )
    else:
        cols = "setup_id," + ",".join(data.keys())
        vals = ":setup_id," + ",".join(f":{k}" for k in data.keys())
        db.execute(
            text(f"INSERT INTO bh_customer_targets ({cols}) VALUES ({vals})"),
            {"setup_id": setup_id, **data},
        )
    db.commit()
    row = db.execute(
        text("SELECT * FROM bh_customer_targets WHERE setup_id=:sid AND customer_name=:n"),
        {"sid": setup_id, "n": data["customer_name"]},
    ).mappings().first()
    return dict(row)


def delete_customer(db: Session, customer_id: int, setup_id: int) -> None:
    db.execute(
        text("DELETE FROM bh_customer_targets WHERE id=:cid AND setup_id=:sid"),
        {"cid": customer_id, "sid": setup_id},
    )
    db.commit()


# ── reference data ────────────────────────────────────────────────────────────

def list_clients(db: Session) -> list[dict]:
    rows = db.execute(
        text("SELECT id, name, short_name FROM of_clients ORDER BY name")
    ).mappings().all()
    return [dict(r) for r in rows]


def list_pod_members(db: Session, pod_id: int) -> list[dict]:
    rows = db.execute(
        text("""SELECT id, name, email, role
                FROM users WHERE pod_id=:pid AND is_active=true ORDER BY role, name"""),
        {"pid": pod_id},
    ).mappings().all()
    return [dict(r) for r in rows]


# ── recruiter assignments ─────────────────────────────────────────────────────

def list_recruiter_assignments(db: Session, setup_id: int) -> list[dict]:
    rows = db.execute(
        text("""SELECT ra.id, ra.setup_id, ra.user_id, ra.subs_per_day, ra.primary_subs,
                       ra.primary_customer_id, ra.secondary_customer_id,
                       u.name AS user_name, u.role AS user_role,
                       pc.customer_name AS primary_customer,
                       sc.customer_name AS secondary_customer
                FROM bh_recruiter_assignments ra
                JOIN users u ON u.id=ra.user_id
                LEFT JOIN bh_customer_targets pc ON pc.id=ra.primary_customer_id
                LEFT JOIN bh_customer_targets sc ON sc.id=ra.secondary_customer_id
                WHERE ra.setup_id=:sid ORDER BY u.name"""),
        {"sid": setup_id},
    ).mappings().all()
    return [dict(r) for r in rows]


def upsert_recruiter_assignments(db: Session, setup_id: int, entries: list[dict]) -> None:
    for e in entries:
        existing = db.execute(
            text("SELECT id FROM bh_recruiter_assignments WHERE setup_id=:sid AND user_id=:uid"),
            {"sid": setup_id, "uid": e["user_id"]},
        ).first()
        if existing:
            db.execute(
                text("""UPDATE bh_recruiter_assignments
                        SET primary_customer_id=:primary_customer_id,
                            secondary_customer_id=:secondary_customer_id,
                            subs_per_day=:subs_per_day,
                            primary_subs=:primary_subs
                        WHERE id=:id"""),
                {**e, "id": existing[0]},
            )
        else:
            db.execute(
                text("""INSERT INTO bh_recruiter_assignments
                        (setup_id,user_id,primary_customer_id,secondary_customer_id,subs_per_day,primary_subs)
                        VALUES (:setup_id,:user_id,:primary_customer_id,:secondary_customer_id,:subs_per_day,:primary_subs)"""),
                {"setup_id": setup_id, **e},
            )
    db.commit()


# ── KAM assignments ───────────────────────────────────────────────────────────

def list_kam_assignments(db: Session, setup_id: int) -> list[dict]:
    rows = db.execute(
        text("""SELECT ka.id, ka.setup_id, ka.user_id, ka.customer_targets,
                       ka.tat_focus, ka.key_action, u.name AS user_name
                FROM bh_kam_assignments ka
                JOIN users u ON u.id=ka.user_id
                WHERE ka.setup_id=:sid AND u.role = 'kam' ORDER BY u.name"""),
        {"sid": setup_id},
    ).mappings().all()
    result = []
    for r in rows:
        d = dict(r)
        d["customer_targets"] = json.loads(d.get("customer_targets") or "{}")
        result.append(d)
    return result


def upsert_kam_assignments(db: Session, setup_id: int, entries: list[dict]) -> None:
    for e in entries:
        ct_json = json.dumps(e.get("customer_targets", {}))
        existing = db.execute(
            text("SELECT id FROM bh_kam_assignments WHERE setup_id=:sid AND user_id=:uid"),
            {"sid": setup_id, "uid": e["user_id"]},
        ).first()
        if existing:
            db.execute(
                text("""UPDATE bh_kam_assignments
                        SET customer_targets=:ct, tat_focus=:tf, key_action=:ka
                        WHERE id=:id"""),
                {"ct": ct_json, "tf": e.get("tat_focus", ""),
                 "ka": e.get("key_action", ""), "id": existing[0]},
            )
        else:
            db.execute(
                text("""INSERT INTO bh_kam_assignments
                        (setup_id,user_id,customer_targets,tat_focus,key_action)
                        VALUES (:sid,:uid,:ct,:tf,:ka)"""),
                {"sid": setup_id, "uid": e["user_id"], "ct": ct_json,
                 "tf": e.get("tat_focus", ""), "ka": e.get("key_action", "")},
            )
    db.commit()


# ── weekly OB targets ─────────────────────────────────────────────────────────

def list_weekly_ob_targets(db: Session, setup_id: int) -> list[dict]:
    rows = db.execute(
        text("""SELECT w.*, c.customer_name
                FROM bh_weekly_ob_targets w
                JOIN bh_customer_targets c ON c.id=w.customer_target_id
                WHERE w.setup_id=:sid ORDER BY c.display_order, c.id, w.week_num"""),
        {"sid": setup_id},
    ).mappings().all()
    return [dict(r) for r in rows]


def upsert_weekly_ob_targets(db: Session, setup_id: int, entries: list[dict]) -> None:
    for e in entries:
        existing = db.execute(
            text("SELECT id FROM bh_weekly_ob_targets WHERE customer_target_id=:cid AND week_num=:wn"),
            {"cid": e["customer_target_id"], "wn": e["week_num"]},
        ).first()
        if existing:
            db.execute(
                text("""UPDATE bh_weekly_ob_targets
                        SET ob_target=:ob_target, week_label=:week_label,
                            week_start=:week_start, week_end=:week_end
                        WHERE id=:id"""),
                {**e, "id": existing[0]},
            )
        else:
            db.execute(
                text("""INSERT INTO bh_weekly_ob_targets
                        (setup_id,customer_target_id,week_num,week_label,week_start,week_end,ob_target)
                        VALUES (:setup_id,:customer_target_id,:week_num,:week_label,:week_start,:week_end,:ob_target)"""),
                {"setup_id": setup_id, **e},
            )
    db.commit()


# ── daily actuals ─────────────────────────────────────────────────────────────

def get_daily_actuals(db: Session, setup_id: int, entry_date: str) -> dict[int, dict]:
    rows = db.execute(
        text("""SELECT customer_target_id, actual_subs, actual_interviews,
                       actual_selects, actual_obs
                FROM bh_daily_actuals WHERE setup_id=:sid AND entry_date=:d"""),
        {"sid": setup_id, "d": entry_date},
    ).mappings().all()
    return {r["customer_target_id"]: dict(r) for r in rows}


def get_dl_subs_for_date(db: Session, setup_id: int, pod_id: int, entry_date: str) -> dict[int, int]:
    """Count submissions made by delivery leads in this pod per customer target for the given date."""
    rows = db.execute(
        text("""
            SELECT ct.id AS customer_target_id, COUNT(s.id) AS dl_subs
            FROM submissions s
            JOIN jobs j ON j.id = s.job_id
            JOIN bh_customer_targets ct ON ct.client_id = j.client_id AND ct.setup_id = :setup_id
            WHERE DATE(s.submitted_at) = :entry_date
              AND s.delivery_lead_id IN (
                  SELECT id FROM users WHERE pod_id = :pod_id AND role = 'delivery_lead' AND is_active = true
              )
            GROUP BY ct.id
        """),
        {"setup_id": setup_id, "pod_id": pod_id, "entry_date": entry_date},
    ).mappings().all()
    return {r["customer_target_id"]: int(r["dl_subs"]) for r in rows}


def get_monthly_actuals(db: Session, setup_id: int, month_str: str) -> dict[int, dict]:
    ref = datetime.strptime(month_str, "%B %Y")
    m_start = ref.date().isoformat()
    if ref.month == 12:
        m_end = date(ref.year + 1, 1, 1).isoformat()
    else:
        m_end = date(ref.year, ref.month + 1, 1).isoformat()
    rows = db.execute(
        text("""SELECT customer_target_id,
                       COALESCE(SUM(actual_subs),0)       AS subs,
                       COALESCE(SUM(actual_interviews),0) AS interviews,
                       COALESCE(SUM(actual_selects),0)    AS selects,
                       COALESCE(SUM(actual_obs),0)        AS obs
                FROM bh_daily_actuals
                WHERE setup_id=:sid AND entry_date>=:s AND entry_date<:e
                GROUP BY customer_target_id"""),
        {"sid": setup_id, "s": m_start, "e": m_end},
    ).mappings().all()
    return {r["customer_target_id"]: dict(r) for r in rows}


def get_week_ob_actuals(db: Session, setup_id: int, week_start: str, week_end: str) -> dict[int, int]:
    rows = db.execute(
        text("""SELECT customer_target_id, COALESCE(SUM(actual_obs),0) AS obs
                FROM bh_daily_actuals
                WHERE setup_id=:sid AND entry_date>=:ws AND entry_date<=:we
                GROUP BY customer_target_id"""),
        {"sid": setup_id, "ws": week_start, "we": week_end},
    ).mappings().all()
    return {r["customer_target_id"]: int(r["obs"]) for r in rows}


def save_daily_actuals(db: Session, setup_id: int, entry_date: str, entries: list[dict]) -> None:
    for e in entries:
        existing = db.execute(
            text("SELECT id FROM bh_daily_actuals WHERE customer_target_id=:cid AND entry_date=:d"),
            {"cid": e["customer_target_id"], "d": entry_date},
        ).first()
        if existing:
            db.execute(
                text("""UPDATE bh_daily_actuals
                        SET actual_subs=:actual_subs, actual_interviews=:actual_interviews,
                            actual_selects=:actual_selects, actual_obs=:actual_obs,
                            updated_at=NOW()
                        WHERE id=:id"""),
                {**e, "id": existing[0]},
            )
        else:
            db.execute(
                text("""INSERT INTO bh_daily_actuals
                        (setup_id,customer_target_id,entry_date,
                         actual_subs,actual_interviews,actual_selects,actual_obs)
                        VALUES (:sid,:cid,:d,:actual_subs,:actual_interviews,:actual_selects,:actual_obs)"""),
                {"sid": setup_id, "cid": e["customer_target_id"], "d": entry_date,
                 "actual_subs": e.get("actual_subs", 0),
                 "actual_interviews": e.get("actual_interviews", 0),
                 "actual_selects": e.get("actual_selects", 0),
                 "actual_obs": e.get("actual_obs", 0)},
            )
    db.commit()


# ── compute helpers ───────────────────────────────────────────────────────────

def _subs_for_customer(r: dict, cname: str, bench: int) -> int:
    """Effective subs a recruiter contributes to a specific customer, respecting the p/s split."""
    total = r.get("subs_per_day", bench)
    is_primary = r.get("primary_customer") == cname
    is_secondary = r.get("secondary_customer") == cname
    has_both = bool(r.get("primary_customer")) and bool(r.get("secondary_customer"))

    if not has_both:
        return total  # all subs go to whichever customer is assigned

    primary_subs = r.get("primary_subs")
    if primary_subs is None:
        primary_subs = round(total * 2 / 3)

    return primary_subs if is_primary else (total - primary_subs)


# ── compute metrics ───────────────────────────────────────────────────────────

def compute_metrics(setup: dict, customers: list[dict], recruiters: list[dict]) -> dict:
    """Exact port of target_automation/app.py:compute_metrics.
    Recruiters must have 'primary_customer' and 'secondary_customer' as name strings.
    """
    wd = max(1, setup.get("working_days", 22))
    gross_po_needed = setup["net_po_target"] + setup["exit_budget"]
    target_onboards = round(setup["target_selects_month"] * setup["sel_ob_rate"])
    avg_po_blended = round(gross_po_needed / target_onboards, 3) if target_onboards else 0
    spd = setup.get("subs_per_recruiter_day", 6)
    num_rec = setup.get("num_recruiters", 16)
    int_per_kam = setup.get("interviews_per_kam_day", 12)
    num_kams = setup.get("num_kams", 4)
    sel_ob_rate = setup.get("sel_ob_rate", 0.8)

    cust_metrics: list[dict] = []
    total_subs = 0
    total_interviews = 0
    total_selects = 0
    total_obs = 0

    for c in customers:
        c = dict(c)
        cname = c.get("customer_name", c.get("name", ""))

        # Section B
        gross_po = c["net_po_target_cust"] + c["exit_alloc"]
        obs_needed = round(gross_po / c["avg_po_per_ob"]) if c.get("avg_po_per_ob") else 0
        selects_needed = round(obs_needed / sel_ob_rate) if sel_ob_rate else 0
        daily_selects = round(selects_needed / wd, 2)
        daily_obs = round(obs_needed / wd, 2)

        # Section B2
        rpct = c.get("repeat_demand_pct", 0.5)
        avg_subs_demand = (
            rpct * c.get("subs_repeat", 0)
            + (1 - rpct) * (c.get("subs_new_phase1", 0) + c.get("subs_new_phase2", 0))
        )
        monthly_subs = round(avg_subs_demand * c.get("open_demand_pool", 0))
        daily_subs = round(monthly_subs / wd, 1)
        monthly_interviews = c.get("target_interviews_day", 0) * wd

        # Section C
        sub_int_required = round(monthly_interviews / monthly_subs, 3) if monthly_subs else 0
        expected_selects = round(monthly_interviews * c.get("int_sel_target", 0.15))

        # Section E — customer-level capacity
        cust_rec_cap_day = sum(
            _subs_for_customer(r, cname, spd)
            for r in recruiters
            if r.get("primary_customer") == cname or r.get("secondary_customer") == cname
        )
        monthly_subs_cap = cust_rec_cap_day * wd
        subs_gap = monthly_subs_cap - monthly_subs
        interviews_per_kam = round(c.get("target_interviews_day", 0) / num_kams, 1) if num_kams else 0
        cap_status = "OK" if subs_gap >= 0 else "SHORTFALL"

        total_subs += monthly_subs
        total_interviews += monthly_interviews
        total_selects += selects_needed
        total_obs += obs_needed

        c.update({
            "customer_name": cname,
            "gross_po": round(gross_po, 2),
            "obs_needed": obs_needed,
            "selects_needed": selects_needed,
            "daily_selects": daily_selects,
            "daily_obs": daily_obs,
            "avg_subs_demand": round(avg_subs_demand, 2),
            "monthly_subs": monthly_subs,
            "daily_subs": daily_subs,
            "monthly_interviews": monthly_interviews,
            "sub_int_required": sub_int_required,
            "expected_selects": expected_selects,
            "monthly_subs_capacity": monthly_subs_cap,
            "subs_gap": subs_gap,
            "interviews_per_kam": interviews_per_kam,
            "cap_status": cap_status,
        })
        cust_metrics.append(c)

    rec_cap_day = spd * num_rec
    subs_day = round(total_subs / wd) if wd else 0
    rec_gap = rec_cap_day - subs_day
    recs_needed = max(0, (-rec_gap + spd - 1) // spd) if rec_gap < 0 and spd else 0

    int_day = round(total_interviews / wd) if wd else 0
    kam_cap_day = int_per_kam * num_kams
    kam_gap = kam_cap_day - int_day
    kams_needed = max(0, (-kam_gap + int_per_kam - 1) // int_per_kam) if kam_gap < 0 and int_per_kam else 0

    return {
        "gross_po_needed": round(gross_po_needed, 2),
        "target_onboards": target_onboards,
        "avg_po_per_ob_blended": avg_po_blended,
        "customers": cust_metrics,
        "total_subs_needed": total_subs,
        "total_monthly_interviews": total_interviews,
        "total_selects_needed": total_selects,
        "total_obs_needed": total_obs,
        "rec_cap_day": rec_cap_day,
        "subs_day": subs_day,
        "rec_gap": rec_gap,
        "recs_needed": int(recs_needed),
        "int_day": int_day,
        "kam_cap_day": kam_cap_day,
        "kam_gap": kam_gap,
        "kams_needed": int(kams_needed),
        "working_days": wd,
    }


def compute_plan(setup: dict, customers: list[dict], recruiters: list[dict]) -> dict:
    """Compute 22-day distribution + recruiter alignment per customer."""
    month_str = setup.get("month", "")
    spd_bench = setup.get("subs_per_recruiter_day", 6)

    wd_dates = working_days_for_month(month_str) if month_str else []
    actual_wd = max(1, len(wd_dates))

    customer_plans: list[dict] = []
    for c in customers:
        monthly_subs = c.get("monthly_subs", 0)
        cname = c.get("customer_name", c.get("name", ""))

        assigned_all = [r for r in recruiters
                        if r.get("primary_customer") == cname or r.get("secondary_customer") == cname]
        primary_recs = [r.get("user_name", "") for r in recruiters if r.get("primary_customer") == cname]
        secondary_recs = [r.get("user_name", "") for r in recruiters if r.get("secondary_customer") == cname]

        max_per_day = sum(_subs_for_customer(r, cname, spd_bench) for r in assigned_all) or 1
        flat_daily = monthly_subs / actual_wd

        if flat_daily <= max_per_day:
            base = monthly_subs // actual_wd
            extra = monthly_subs % actual_wd
            daily_plan = [base + (1 if i < extra else 0) for i in range(actual_wd)]
        else:
            remaining = monthly_subs
            daily_plan = []
            for _ in range(actual_wd):
                if remaining >= max_per_day:
                    daily_plan.append(max_per_day)
                    remaining -= max_per_day
                elif remaining > 0:
                    daily_plan.append(remaining)
                    remaining = 0
                else:
                    daily_plan.append(0)

        days_needed = sum(1 for d in daily_plan if d > 0)
        buffer_days = actual_wd - days_needed

        recs_needed_full = math.ceil(monthly_subs / (spd_bench * actual_wd)) if spd_bench and actual_wd else 0
        assigned_count = len(assigned_all)
        assigned_cap_day = sum(_subs_for_customer(r, cname, spd_bench) for r in assigned_all)
        assigned_cap_month = assigned_cap_day * actual_wd
        rec_count_gap = assigned_count - recs_needed_full
        rec_cap_gap = assigned_cap_month - monthly_subs

        # If shortfall: how many additional primaries or secondaries would cover it
        shortfall_subs = max(0, -rec_cap_gap)
        sec_spd = max(1, spd_bench - round(spd_bench * 2 / 3))  # default secondary contribution ≈ 1/3
        add_primary_needed = math.ceil(shortfall_subs / (spd_bench * actual_wd)) if shortfall_subs and spd_bench and actual_wd else 0
        add_secondary_needed = math.ceil(shortfall_subs / (sec_spd * actual_wd)) if shortfall_subs and sec_spd and actual_wd else 0

        customer_plans.append({
            "customer_name": cname,
            "monthly_subs": monthly_subs,
            "max_per_day": max_per_day,
            "flat_daily": round(flat_daily, 1),
            "days_needed": days_needed,
            "buffer_days": buffer_days,
            "daily_plan": daily_plan,
            "is_shortfall": flat_daily > max_per_day,
            "recs_needed_full": recs_needed_full,
            "assigned_count": assigned_count,
            "assigned_cap_day": assigned_cap_day,
            "assigned_cap_month": assigned_cap_month,
            "rec_count_gap": rec_count_gap,
            "rec_cap_gap": rec_cap_gap,
            "add_primary_needed": add_primary_needed,
            "add_secondary_needed": add_secondary_needed,
            "primary_recs": primary_recs,
            "secondary_recs": secondary_recs,
        })

    return {
        "working_days": wd_dates,
        "customer_plans": customer_plans,
    }


def compute_kam_plan(setup: dict, customers: list[dict], kams: list[dict]) -> list[dict]:
    """22-day interview distribution for KAMs per customer."""
    month_str = setup.get("month", "")
    int_per_kam = setup.get("interviews_per_kam_day", 12)
    wd_dates = working_days_for_month(month_str) if month_str else []
    actual_wd = max(1, len(wd_dates))

    kam_plans: list[dict] = []
    for c in customers:
        cname = c.get("customer_name", "")
        target_per_day = c.get("target_interviews_day", 0)

        assigned_kams: list[dict] = []
        for k in kams:
            targets = k.get("customer_targets") or {}
            daily = targets.get(cname, 0)
            if daily > 0:
                assigned_kams.append({"user_name": k.get("user_name", ""), "daily_target": daily})

        total_cap_day = sum(a["daily_target"] for a in assigned_kams)
        monthly_target = target_per_day * actual_wd
        monthly_cap = total_cap_day * actual_wd
        cap_gap = total_cap_day - target_per_day
        kams_needed = math.ceil(target_per_day / int_per_kam) if int_per_kam and target_per_day else 0
        shortfall_int = max(0, -cap_gap)
        add_kams_needed = math.ceil(shortfall_int / int_per_kam) if shortfall_int and int_per_kam else 0

        # Case A: target fits within daily KAM capacity → spread evenly at target_per_day
        # Case B: shortfall → run at full capacity until monthly target is exhausted
        max_per_day = total_cap_day if total_cap_day > 0 else target_per_day
        if target_per_day <= max_per_day:
            daily_plan = [target_per_day] * actual_wd
        else:
            remaining = monthly_target
            daily_plan = []
            for _ in range(actual_wd):
                if remaining >= max_per_day:
                    daily_plan.append(max_per_day)
                    remaining -= max_per_day
                elif remaining > 0:
                    daily_plan.append(remaining)
                    remaining = 0
                else:
                    daily_plan.append(0)

        kam_plans.append({
            "customer_name": cname,
            "target_per_day": target_per_day,
            "monthly_target": monthly_target,
            "assigned_kams": assigned_kams,
            "total_cap_day": total_cap_day,
            "max_per_day": max_per_day,
            "monthly_cap": monthly_cap,
            "cap_gap": cap_gap,
            "is_shortfall": target_per_day > max_per_day,
            "kams_needed": kams_needed,
            "add_kams_needed": add_kams_needed,
            "daily_plan": daily_plan,
        })

    return kam_plans
