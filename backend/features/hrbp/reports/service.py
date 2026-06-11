from __future__ import annotations

import io
from datetime import date, datetime, timezone
from calendar import month_abbr

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from core.deps import hrbp_visible_client_ids
from features.hrbp.reports.schema import MonthlyReportResponse, ReportRow, ReportSection
from infra.hrbp_models import HRBPClient, HRBPConsultant, HRBPExitTracking
from infra.models import User

# ── Exit reason display labels ────────────────────────────────────────────────

_REASON_LABELS: dict[str, str] = {
    "resignation":       "Resignation",
    "project_roll_off":  "Project Roll-off",
    "contract_closure":  "Contract Closure",
    "conversion":        "Conversion",
    "absconding":        "Absconding",
    "no_show":           "No Show",
    "termination":       "Termination",
    "end_of_contract":   "End of Contract",
}


def _role(user: User) -> str:
    return user.role.value if hasattr(user.role, "value") else str(user.role)


def _exit_scope(q, db: Session, user: User):
    """Filter exit records based on the user's role visibility."""
    role = _role(user)
    if role == "hrbp":
        client_ids = hrbp_visible_client_ids(db, user.id)
        q = q.filter(HRBPExitTracking.client_id.in_(client_ids))
    elif role == "bh":
        bh_client_ids = [r.id for r in db.query(HRBPClient.id).filter_by(bh_id=user.id).all()]
        q = q.filter(HRBPExitTracking.client_id.in_(bh_client_ids))
    # ops_head / coo / ceo / admin → no filter
    return q


def _to_row(e: HRBPExitTracking, consultant: HRBPConsultant, client: HRBPClient | None) -> ReportRow:
    lwd = e.last_working_day or (e.exit_date if hasattr(e, "exit_date") else None)
    return ReportRow(
        emp_id      = consultant.emp_id if consultant else None,
        emp_name    = consultant.name if consultant else "—",
        exit_type   = _REASON_LABELS.get(e.exit_reason, e.exit_reason),
        client_name = client.name if client else None,
        lwd         = lwd,
        po_value    = float(consultant.monthly_po) if consultant and consultant.monthly_po else None,
        margin      = float(consultant.margin) if consultant and consultant.margin else None,
        hr_efforts  = e.hr_efforts,
    )


def _section(rows: list[ReportRow]) -> ReportSection:
    return ReportSection(
        count        = len(rows),
        total_po     = sum(r.po_value or 0 for r in rows),
        total_margin = sum(r.margin or 0 for r in rows),
        records      = rows,
    )


def get_monthly_report(
    db: Session,
    user: User,
    month: int,
    year: int,
) -> MonthlyReportResponse:
    month_start = date(year, month, 1)
    if month == 12:
        month_end = date(year + 1, 1, 1)
    else:
        month_end = date(year, month + 1, 1)

    base = (
        db.query(HRBPExitTracking)
        .join(HRBPConsultant, HRBPConsultant.id == HRBPExitTracking.consultant_id)
        .join(HRBPClient, HRBPClient.id == HRBPExitTracking.client_id)
    )
    base = _exit_scope(base, db, user)

    def _enrich(records) -> list[ReportRow]:
        rows = []
        for e in records:
            consultant = db.query(HRBPConsultant).get(e.consultant_id)
            client = db.query(HRBPClient).get(e.client_id)
            rows.append(_to_row(e, consultant, client))
        return rows

    # Exits: completed, LWD falls in this month
    exits_q = base.filter(
        HRBPExitTracking.status == "completed",
        or_(
            func.coalesce(HRBPExitTracking.last_working_day, HRBPExitTracking.exit_date) >= month_start,
            func.coalesce(HRBPExitTracking.last_working_day, HRBPExitTracking.exit_date).is_(None),
        ),
        or_(
            func.coalesce(HRBPExitTracking.last_working_day, HRBPExitTracking.exit_date) < month_end,
            func.coalesce(HRBPExitTracking.last_working_day, HRBPExitTracking.exit_date).is_(None),
        ),
    )
    # Narrow to records actually in this month (those with NULL LWD fall back to created_at)
    exits_with_lwd = base.filter(
        HRBPExitTracking.status == "completed",
        func.coalesce(HRBPExitTracking.last_working_day, HRBPExitTracking.exit_date) >= month_start,
        func.coalesce(HRBPExitTracking.last_working_day, HRBPExitTracking.exit_date) < month_end,
    ).all()

    # Exit in Progress: status initiated/acknowledged, created this month
    eip = base.filter(
        HRBPExitTracking.status.in_(["initiated", "acknowledged"]),
        func.date_trunc("month", HRBPExitTracking.created_at) == func.date_trunc("month", func.cast(month_start, HRBPExitTracking.created_at.type)),
    ).all()

    # Retentions: retained this month
    ret = base.filter(
        HRBPExitTracking.status == "retained",
        HRBPExitTracking.retained_at >= func.cast(month_start, HRBPExitTracking.retained_at.type),
        HRBPExitTracking.retained_at < func.cast(month_end, HRBPExitTracking.retained_at.type),
    ).all()

    # Retentions in Progress: status retention_in_progress, created this month
    rip = base.filter(
        HRBPExitTracking.status == "retention_in_progress",
        func.date_trunc("month", HRBPExitTracking.created_at) == func.date_trunc("month", func.cast(month_start, HRBPExitTracking.created_at.type)),
    ).all()

    label = f"{month_abbr[month]} {year}"

    return MonthlyReportResponse(
        month                  = month,
        year                   = year,
        label                  = label,
        exits                  = _section(_enrich(exits_with_lwd)),
        exits_in_progress      = _section(_enrich(eip)),
        retentions             = _section(_enrich(ret)),
        retentions_in_progress = _section(_enrich(rip)),
    )


# ── Excel export ──────────────────────────────────────────────────────────────

_THIN  = Side(style="thin",   color="D0D0D0")
_BORDER = Border(left=_THIN, right=_THIN, top=_THIN, bottom=_THIN)
_ALIGN_CTR  = Alignment(horizontal="center", vertical="center", wrap_text=True)
_ALIGN_LEFT = Alignment(horizontal="left",   vertical="center", wrap_text=True)
_ALIGN_WRAP = Alignment(horizontal="left",   vertical="top",    wrap_text=True)
_BODY_FONT  = Font(name="Calibri", size=10)
_BOLD_FONT  = Font(name="Calibri", size=10, bold=True)
_HDR_FONT   = Font(name="Calibri", bold=True, color="FFFFFF", size=11)

_FILLS = {
    "red":    PatternFill(fill_type="solid", fgColor="C0392B"),
    "green":  PatternFill(fill_type="solid", fgColor="27AE60"),
    "yellow": PatternFill(fill_type="solid", fgColor="F39C12"),
    "blue":   PatternFill(fill_type="solid", fgColor="2980B9"),
    "total":  PatternFill(fill_type="solid", fgColor="FFF9C4"),
}

_COLS = ["Emp ID", "Emp Name", "Exit Type", "Client Name", "LWD", "PO Value", "Margin", "HR Efforts"]
_WIDTHS = [14, 28, 20, 28, 14, 14, 14, 50]


def _write_section(ws, title: str, fill_key: str, section: ReportSection, start_row: int) -> int:
    """Write a single report section block. Returns the next available row."""
    row = start_row

    # Section header (merged across all 8 cols)
    ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=8)
    cell = ws.cell(row=row, column=1, value=title)
    cell.fill = _FILLS[fill_key]
    cell.font = _HDR_FONT
    cell.alignment = _ALIGN_CTR
    row += 1

    # Column headers
    for col, (name, width) in enumerate(zip(_COLS, _WIDTHS), start=1):
        c = ws.cell(row=row, column=col, value=name)
        c.fill = PatternFill(fill_type="solid", fgColor="1F2937")
        c.font = Font(name="Calibri", bold=True, color="FFFFFF", size=10)
        c.alignment = _ALIGN_CTR
        c.border = _BORDER
        ws.column_dimensions[get_column_letter(col)].width = width
    row += 1

    # Data rows
    for r in section.records:
        vals = [
            r.emp_id or "—",
            r.emp_name,
            r.exit_type,
            r.client_name or "—",
            r.lwd.strftime("%d-%m-%Y") if r.lwd else "—",
            r.po_value or 0,
            r.margin or 0,
            r.hr_efforts or "",
        ]
        for col, val in enumerate(vals, start=1):
            c = ws.cell(row=row, column=col, value=val)
            c.font = _BODY_FONT
            c.border = _BORDER
            c.alignment = _ALIGN_WRAP if col == 8 else _ALIGN_LEFT
        row += 1

    # Totals row
    totals = ["", "Total", "", "", str(section.count), section.total_po, section.total_margin, ""]
    for col, val in enumerate(totals, start=1):
        c = ws.cell(row=row, column=col, value=val)
        c.fill = _FILLS["total"]
        c.font = _BOLD_FONT
        c.border = _BORDER
        c.alignment = _ALIGN_CTR
    row += 2  # blank line between sections

    return row


def build_monthly_excel(report: MonthlyReportResponse) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = report.label
    ws.sheet_view.showGridLines = False

    row = 1

    # Title
    ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=8)
    t = ws.cell(row=row, column=1, value=f"HRBP Monthly Report — {report.label}")
    t.font = Font(name="Calibri", bold=True, size=14, color="1F2937")
    t.alignment = _ALIGN_CTR
    row += 2

    row = _write_section(ws, f"Exit in Progress ({report.label})",         "red",    report.exits_in_progress,      row)
    row = _write_section(ws, f"Exits ({report.label})",                    "blue",   report.exits,                  row)
    row = _write_section(ws, f"Retentions ({report.label})",               "green",  report.retentions,             row)
    row = _write_section(ws, f"Retentions in Progress ({report.label})",   "yellow", report.retentions_in_progress, row)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.read()
