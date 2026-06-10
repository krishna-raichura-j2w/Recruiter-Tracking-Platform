"""
BH Target Tracking — daily email report.

Pulls one row per BH (totals across every customer in that BH's pod) using the
same code path that powers the BH Target Tracking tab on the leaderboard,
then renders it as an HTML email matching the requested template.
"""
from __future__ import annotations

from datetime import date as _date
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from features.mrr.pod_plan import service as pp


def collect_bh_rows(db: Session, target_date: _date | None = None) -> dict[str, Any]:
    """Return BH-overview totals for ``target_date`` (default: today IST).

    {
      "date": "YYYY-MM-DD",
      "rows":   [{"bh_name", "new_demand", "offer_letter_subs", "interviews",
                  "selections", "onboarding_hc", "onboarding_po",
                  "onboarding_margin"}, ...],
      "totals": {same keys, summed},
    }
    """
    if target_date is None:
        ist_now = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
        target_date = ist_now.date()

    pb = pp.period_bounds(target_date.isoformat(), None, None)
    period_start, period_end = pb["period_start"], pb["period_end"]
    period_start_utc, period_end_utc = pb["period_start_utc"], pb["period_end_utc"]
    month, m_start = pb["month"], pb["m_start"]
    mtd_start_utc, period = pb["mtd_start_utc"], pb["period"]

    setup_rows = db.execute(text("""
        SELECT s.*, u.name AS bh_name, p.id AS pod_id
        FROM bh_pod_setups s
        JOIN pods p ON p.id = s.pod_id
        JOIN users u ON u.id = p.bh_user_id AND u.is_active = true
        WHERE s.month = :month
        ORDER BY u.name
    """), {"month": month}).mappings().all()

    if not setup_rows:
        return {
            "date":   target_date.isoformat(),
            "rows":   [],
            "totals": _empty_totals(),
        }

    setups = [dict(r) for r in setup_rows]
    setup_ids = [s["id"] for s in setups]

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
        SELECT setup_id, customer_target_id,
               COALESCE(SUM(actual_subs), 0)       AS actual_subs,
               COALESCE(SUM(actual_interviews), 0) AS actual_interviews,
               COALESCE(SUM(actual_selects), 0)    AS actual_selects,
               COALESCE(SUM(actual_obs), 0)        AS actual_obs
        FROM bh_daily_actuals
        WHERE setup_id = ANY(:ids) AND entry_date >= :ps AND entry_date <= :pe
        GROUP BY setup_id, customer_target_id
    """), {"ids": setup_ids, "ps": period_start, "pe": period_end}).mappings().all():
        actuals_by_setup[r["setup_id"]][r["customer_target_id"]] = dict(r)

    mtd_by_setup: dict[int, dict[int, dict]] = {sid: {} for sid in setup_ids}
    for r in db.execute(text("""
        SELECT setup_id, customer_target_id,
               COALESCE(SUM(actual_subs), 0)       AS subs,
               COALESCE(SUM(actual_interviews), 0) AS interviews,
               COALESCE(SUM(actual_selects), 0)    AS selects,
               COALESCE(SUM(actual_obs), 0)        AS obs
        FROM bh_daily_actuals
        WHERE setup_id = ANY(:ids) AND entry_date >= :s AND entry_date <= :pe
        GROUP BY setup_id, customer_target_id
    """), {"ids": setup_ids, "s": m_start, "pe": period_end}).mappings().all():
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
    """), {"ids": setup_ids, "day_start": period_start_utc, "day_end": period_end_utc}).mappings().all():
        dl_by_setup[r["setup_id"]][r["customer_target_id"]] = int(r["dl_subs"])

    client_to_ct: dict[int, int] = {}
    for sid in setup_ids:
        for c in customers_by_setup[sid]:
            for x in pp.customer_client_ids(c):
                client_to_ct.setdefault(x, c["id"])

    db.close()
    ol_by_client = pp.fetch_ol_leaderboard_metrics(
        list(client_to_ct.keys()),
        period_start=period_start, period_end=period_end, m_start=m_start,
        period_start_utc=period_start_utc, period_end_utc=period_end_utc,
        mtd_start_utc=mtd_start_utc,
    )
    ol_ct = pp.ol_metrics_by_ct(ol_by_client, client_to_ct)

    dp_by_client = pp.fetch_ol_demand_po_by_client(
        list(client_to_ct.keys()),
        period_start=period_start, period_end=period_end, m_start=m_start,
    )
    dp_ct = pp.demand_po_by_ct(dp_by_client, client_to_ct)

    rows = []
    grand = _empty_totals()
    for s in setups:
        sid = s["id"]
        customers = customers_by_setup[sid]
        recruiters = recruiters_by_setup[sid]
        enriched = {c["id"]: c for c in pp.compute_metrics(s, customers, recruiters)["customers"]}
        per_bh = {
            "actual_demands":   0,
            "actual_subs":      0,
            "actual_int":       0,
            "actual_sel":       0,
            "actual_obs":       0,
            "actual_po":        0.0,
            "actual_po_margin": 0.0,
        }
        companies: list[dict] = []
        for c in customers:
            row = pp.assemble_bh_customer_row(
                s, c, enriched.get(c["id"], {}),
                actuals_by_setup[sid].get(c["id"], {}),
                mtd_by_setup[sid].get(c["id"], {}),
                dl_by_setup[sid].get(c["id"], 0),
                ol_ct, target_date.isoformat(), dp_ct, period,
            )
            per_bh["actual_demands"]    += row["actual_demands"]
            per_bh["actual_subs"]       += row["actual_subs"]
            per_bh["actual_int"]        += row["actual_int"]
            per_bh["actual_sel"]        += row["actual_sel"]
            per_bh["actual_obs"]        += row["actual_obs"]
            per_bh["actual_po"]         += row["actual_po"]
            per_bh["actual_po_margin"]  += row["actual_po_margin"]
            companies.append({
                "company_name":      row["customer_name"],
                "new_demand":        row["actual_demands"],
                "offer_letter_subs": row["actual_subs"],
                "interviews":        row["actual_int"],
                "selections":        row["actual_sel"],
                "onboarding_hc":     row["actual_obs"],
                "onboarding_po":     round(row["actual_po"], 2),
                "onboarding_margin": round(row["actual_po_margin"], 2),
            })

        per_bh["actual_po"]        = round(per_bh["actual_po"], 2)
        per_bh["actual_po_margin"] = round(per_bh["actual_po_margin"], 2)

        bh_row = {
            "bh_name":           s["bh_name"],
            "new_demand":        per_bh["actual_demands"],
            "offer_letter_subs": per_bh["actual_subs"],
            "interviews":        per_bh["actual_int"],
            "selections":        per_bh["actual_sel"],
            "onboarding_hc":     per_bh["actual_obs"],
            "onboarding_po":     per_bh["actual_po"],
            "onboarding_margin": per_bh["actual_po_margin"],
            "companies":         companies,
        }
        rows.append(bh_row)
        for k in grand:
            if k == "companies":
                continue
            grand[k] += bh_row[k]

    grand["onboarding_po"]     = round(grand["onboarding_po"], 2)
    grand["onboarding_margin"] = round(grand["onboarding_margin"], 2)

    return {"date": target_date.isoformat(), "rows": rows, "totals": grand}


def _empty_totals() -> dict[str, float]:
    return {
        "new_demand":        0,
        "offer_letter_subs": 0,
        "interviews":        0,
        "selections":        0,
        "onboarding_hc":     0,
        "onboarding_po":     0.0,
        "onboarding_margin": 0.0,
    }


def _fmt(value: float | int, money: bool = False) -> str:
    """Number → string. PO and margin are shown in Lakhs with 2 decimals + 'L' suffix."""
    if money:
        return f"{value:,.2f} L"
    return f"{int(value):,}"


def render_html(date_str: str, rows: list[dict], totals: dict) -> str:
    pretty_date = datetime.strptime(date_str, "%Y-%m-%d").strftime("%d %b %Y")

    overall_card = f"""
      <table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px;">
        <tr><td colspan="2" style="padding:10px 14px;background:#0F172A;color:#fff;font-size:15px;font-weight:700;">Overall Performance &mdash; {pretty_date}</td></tr>
        <tr><td style="padding:8px 14px;border-bottom:1px solid #E2E8F0;color:#475569;">New Demand</td>
            <td style="padding:8px 14px;border-bottom:1px solid #E2E8F0;text-align:right;font-weight:700;color:#0F172A;">{_fmt(totals['new_demand'])}</td></tr>
        <tr><td style="padding:8px 14px;border-bottom:1px solid #E2E8F0;color:#475569;">Offer Letter Submission</td>
            <td style="padding:8px 14px;border-bottom:1px solid #E2E8F0;text-align:right;font-weight:700;color:#0F172A;">{_fmt(totals['offer_letter_subs'])}</td></tr>
        <tr><td style="padding:8px 14px;border-bottom:1px solid #E2E8F0;color:#475569;">Interviews</td>
            <td style="padding:8px 14px;border-bottom:1px solid #E2E8F0;text-align:right;font-weight:700;color:#0F172A;">{_fmt(totals['interviews'])}</td></tr>
        <tr><td style="padding:8px 14px;border-bottom:1px solid #E2E8F0;color:#475569;">Selection</td>
            <td style="padding:8px 14px;border-bottom:1px solid #E2E8F0;text-align:right;font-weight:700;color:#0F172A;">{_fmt(totals['selections'])}</td></tr>
        <tr><td style="padding:8px 14px;border-bottom:1px solid #E2E8F0;color:#475569;">Onboarding HC</td>
            <td style="padding:8px 14px;border-bottom:1px solid #E2E8F0;text-align:right;font-weight:700;color:#0F172A;">{_fmt(totals['onboarding_hc'])}</td></tr>
        <tr><td style="padding:8px 14px;border-bottom:1px solid #E2E8F0;color:#475569;">Onboarding PO</td>
            <td style="padding:8px 14px;border-bottom:1px solid #E2E8F0;text-align:right;font-weight:700;color:#0F172A;">{_fmt(totals['onboarding_po'], money=True)}</td></tr>
        <tr><td style="padding:8px 14px;color:#475569;">Onboarding Margin</td>
            <td style="padding:8px 14px;text-align:right;font-weight:700;color:#0F172A;">{_fmt(totals['onboarding_margin'], money=True)}</td></tr>
      </table>
    """

    header_cells = "".join(
        f'<th style="padding:8px 10px;background:#1E293B;color:#fff;font-size:12px;text-align:{align};border-bottom:2px solid #0F172A;">{lbl}</th>'
        for lbl, align in [
            ("BH",                "left"),
            ("New Demand",        "right"),
            ("Offer Letter Subs", "right"),
            ("Interviews",        "right"),
            ("Selections",        "right"),
            ("Onboarding HC",     "right"),
            ("Onboarding PO",     "right"),
            ("Onboarding Margin", "right"),
        ]
    )

    body_rows = ""
    for idx, r in enumerate(rows):
        zebra = "#F8FAFC" if idx % 2 == 0 else "#FFFFFF"
        body_rows += (
            f'<tr style="background:{zebra};">'
            f'<td style="padding:8px 10px;font-size:13px;font-weight:600;color:#0F172A;border-bottom:1px solid #E2E8F0;">{r["bh_name"]}</td>'
            f'<td style="padding:8px 10px;font-size:13px;text-align:right;color:#0F172A;border-bottom:1px solid #E2E8F0;">{_fmt(r["new_demand"])}</td>'
            f'<td style="padding:8px 10px;font-size:13px;text-align:right;color:#0F172A;border-bottom:1px solid #E2E8F0;">{_fmt(r["offer_letter_subs"])}</td>'
            f'<td style="padding:8px 10px;font-size:13px;text-align:right;color:#0F172A;border-bottom:1px solid #E2E8F0;">{_fmt(r["interviews"])}</td>'
            f'<td style="padding:8px 10px;font-size:13px;text-align:right;color:#0F172A;border-bottom:1px solid #E2E8F0;">{_fmt(r["selections"])}</td>'
            f'<td style="padding:8px 10px;font-size:13px;text-align:right;color:#0F172A;border-bottom:1px solid #E2E8F0;">{_fmt(r["onboarding_hc"])}</td>'
            f'<td style="padding:8px 10px;font-size:13px;text-align:right;color:#0F172A;border-bottom:1px solid #E2E8F0;">{_fmt(r["onboarding_po"], money=True)}</td>'
            f'<td style="padding:8px 10px;font-size:13px;text-align:right;color:#0F172A;border-bottom:1px solid #E2E8F0;">{_fmt(r["onboarding_margin"], money=True)}</td>'
            "</tr>"
        )

    total_row = (
        '<tr style="background:#0F172A;color:#fff;">'
        '<td style="padding:10px;font-size:13px;font-weight:800;">Total</td>'
        f'<td style="padding:10px;font-size:13px;font-weight:800;text-align:right;">{_fmt(totals["new_demand"])}</td>'
        f'<td style="padding:10px;font-size:13px;font-weight:800;text-align:right;">{_fmt(totals["offer_letter_subs"])}</td>'
        f'<td style="padding:10px;font-size:13px;font-weight:800;text-align:right;">{_fmt(totals["interviews"])}</td>'
        f'<td style="padding:10px;font-size:13px;font-weight:800;text-align:right;">{_fmt(totals["selections"])}</td>'
        f'<td style="padding:10px;font-size:13px;font-weight:800;text-align:right;">{_fmt(totals["onboarding_hc"])}</td>'
        f'<td style="padding:10px;font-size:13px;font-weight:800;text-align:right;">{_fmt(totals["onboarding_po"], money=True)}</td>'
        f'<td style="padding:10px;font-size:13px;font-weight:800;text-align:right;">{_fmt(totals["onboarding_margin"], money=True)}</td>'
        "</tr>"
    )

    bh_table = f"""
      <table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;background:#fff;border:1px solid #CBD5E1;">
        <thead><tr>{header_cells}</tr></thead>
        <tbody>
          {body_rows if body_rows else '<tr><td colspan="8" style="padding:18px;text-align:center;color:#94A3B8;font-style:italic;">No BH-pod setups for this month.</td></tr>'}
          {total_row if rows else ''}
        </tbody>
      </table>
    """

    # ── BH × Company breakdown ───────────────────────────────────────────────
    company_header_cells = "".join(
        f'<th style="padding:8px 10px;background:#312E81;color:#fff;font-size:12px;text-align:{align};border-bottom:2px solid #1E1B4B;">{lbl}</th>'
        for lbl, align in [
            ("BH",                "left"),
            ("Company",           "left"),
            ("New Demand",        "right"),
            ("Offer Letter Subs", "right"),
            ("Interviews",        "right"),
            ("Selections",        "right"),
            ("Onboarding HC",     "right"),
            ("Onboarding PO",     "right"),
            ("Onboarding Margin", "right"),
        ]
    )

    company_body = ""
    for bh in rows:
        companies = bh.get("companies", []) or []
        if not companies:
            continue
        for idx, c in enumerate(companies):
            bh_cell = (
                f'<td rowspan="{len(companies)}" '
                f'style="padding:8px 10px;font-size:13px;font-weight:700;color:#312E81;'
                f'background:#EEF2FF;border-bottom:1px solid #C7D2FE;border-right:1px solid #C7D2FE;vertical-align:top;">'
                f'{bh["bh_name"]}</td>'
                if idx == 0 else ""
            )
            zebra = "#F8FAFC" if idx % 2 == 0 else "#FFFFFF"
            company_body += (
                f'<tr style="background:{zebra};">'
                f'{bh_cell}'
                f'<td style="padding:8px 10px;font-size:13px;font-weight:600;color:#0F172A;border-bottom:1px solid #E2E8F0;">{c["company_name"]}</td>'
                f'<td style="padding:8px 10px;font-size:13px;text-align:right;color:#0F172A;border-bottom:1px solid #E2E8F0;">{_fmt(c["new_demand"])}</td>'
                f'<td style="padding:8px 10px;font-size:13px;text-align:right;color:#0F172A;border-bottom:1px solid #E2E8F0;">{_fmt(c["offer_letter_subs"])}</td>'
                f'<td style="padding:8px 10px;font-size:13px;text-align:right;color:#0F172A;border-bottom:1px solid #E2E8F0;">{_fmt(c["interviews"])}</td>'
                f'<td style="padding:8px 10px;font-size:13px;text-align:right;color:#0F172A;border-bottom:1px solid #E2E8F0;">{_fmt(c["selections"])}</td>'
                f'<td style="padding:8px 10px;font-size:13px;text-align:right;color:#0F172A;border-bottom:1px solid #E2E8F0;">{_fmt(c["onboarding_hc"])}</td>'
                f'<td style="padding:8px 10px;font-size:13px;text-align:right;color:#0F172A;border-bottom:1px solid #E2E8F0;">{_fmt(c["onboarding_po"], money=True)}</td>'
                f'<td style="padding:8px 10px;font-size:13px;text-align:right;color:#0F172A;border-bottom:1px solid #E2E8F0;">{_fmt(c["onboarding_margin"], money=True)}</td>'
                "</tr>"
            )
        # Per-BH subtotal row
        company_body += (
            '<tr style="background:#1E1B4B;color:#fff;">'
            f'<td colspan="2" style="padding:8px 10px;font-size:12px;font-weight:700;text-align:right;">Subtotal &mdash; {bh["bh_name"]}</td>'
            f'<td style="padding:8px 10px;font-size:12px;font-weight:700;text-align:right;">{_fmt(bh["new_demand"])}</td>'
            f'<td style="padding:8px 10px;font-size:12px;font-weight:700;text-align:right;">{_fmt(bh["offer_letter_subs"])}</td>'
            f'<td style="padding:8px 10px;font-size:12px;font-weight:700;text-align:right;">{_fmt(bh["interviews"])}</td>'
            f'<td style="padding:8px 10px;font-size:12px;font-weight:700;text-align:right;">{_fmt(bh["selections"])}</td>'
            f'<td style="padding:8px 10px;font-size:12px;font-weight:700;text-align:right;">{_fmt(bh["onboarding_hc"])}</td>'
            f'<td style="padding:8px 10px;font-size:12px;font-weight:700;text-align:right;">{_fmt(bh["onboarding_po"], money=True)}</td>'
            f'<td style="padding:8px 10px;font-size:12px;font-weight:700;text-align:right;">{_fmt(bh["onboarding_margin"], money=True)}</td>'
            "</tr>"
        )

    company_total_row = (
        '<tr style="background:#0F172A;color:#fff;">'
        '<td colspan="2" style="padding:10px;font-size:13px;font-weight:800;">Grand Total</td>'
        f'<td style="padding:10px;font-size:13px;font-weight:800;text-align:right;">{_fmt(totals["new_demand"])}</td>'
        f'<td style="padding:10px;font-size:13px;font-weight:800;text-align:right;">{_fmt(totals["offer_letter_subs"])}</td>'
        f'<td style="padding:10px;font-size:13px;font-weight:800;text-align:right;">{_fmt(totals["interviews"])}</td>'
        f'<td style="padding:10px;font-size:13px;font-weight:800;text-align:right;">{_fmt(totals["selections"])}</td>'
        f'<td style="padding:10px;font-size:13px;font-weight:800;text-align:right;">{_fmt(totals["onboarding_hc"])}</td>'
        f'<td style="padding:10px;font-size:13px;font-weight:800;text-align:right;">{_fmt(totals["onboarding_po"], money=True)}</td>'
        f'<td style="padding:10px;font-size:13px;font-weight:800;text-align:right;">{_fmt(totals["onboarding_margin"], money=True)}</td>'
        "</tr>"
    )

    company_table = f"""
      <table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;background:#fff;border:1px solid #CBD5E1;">
        <thead><tr>{company_header_cells}</tr></thead>
        <tbody>
          {company_body if company_body else '<tr><td colspan="9" style="padding:18px;text-align:center;color:#94A3B8;font-style:italic;">No companies configured.</td></tr>'}
          {company_total_row if rows else ''}
        </tbody>
      </table>
    """

    return f"""
    <!DOCTYPE html>
    <html><body style="margin:0;padding:24px;background:#F1F5F9;font-family:Arial,sans-serif;color:#0F172A;">
      <div style="max-width:1100px;margin:0 auto;">
        <h2 style="margin:0 0 6px 0;font-size:20px;color:#0F172A;">BH Target Tracking &mdash; Daily Snapshot</h2>
        <p style="margin:0 0 18px 0;color:#475569;font-size:13px;">As of {pretty_date} (IST). Values mirror the BH Target Tracking tab on the leaderboard.</p>

        <div style="background:#fff;border:1px solid #CBD5E1;margin-bottom:18px;">
          {overall_card}
        </div>

        <h3 style="margin:18px 0 8px 0;font-size:16px;color:#0F172A;">BH-wise Overall</h3>
        {bh_table}

        <h3 style="margin:24px 0 8px 0;font-size:16px;color:#0F172A;">BH &times; Company Breakdown</h3>
        {company_table}

        <p style="margin:18px 0 0 0;color:#94A3B8;font-size:11px;">
          PO and Margin are shown in Lakhs (L). Generated by recruiter-tracking &middot; BH Target email task.
        </p>
      </div>
    </body></html>
    """
