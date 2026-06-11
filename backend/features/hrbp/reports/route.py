from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from core.database import get_db
from core.deps import get_current_user
from core.response_format import error_response, success_response
from features.hrbp.reports import service
from infra.models import User

router = APIRouter(prefix="/reports", tags=["hrbp-reports"])


@router.get("/monthly")
def get_monthly_report(
    month: int = Query(default=None, ge=1, le=12),
    year:  int = Query(default=None, ge=2020, le=2100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    today = date.today()
    m = month or today.month
    y = year  or today.year
    try:
        data = service.get_monthly_report(db, current_user, m, y)
        return success_response(data=data.model_dump(), message="Monthly report fetched")
    except Exception as exc:
        return error_response(message=str(exc))


@router.get("/monthly/export")
def export_monthly_report(
    month: int = Query(default=None, ge=1, le=12),
    year:  int = Query(default=None, ge=2020, le=2100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    today = date.today()
    m = month or today.month
    y = year  or today.year
    try:
        report = service.get_monthly_report(db, current_user, m, y)
        xlsx = service.build_monthly_excel(report)
        filename = f"HRBP_Monthly_Report_{report.label.replace(' ', '_')}.xlsx"
        return Response(
            content=xlsx,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except Exception as exc:
        return error_response(message=str(exc))
