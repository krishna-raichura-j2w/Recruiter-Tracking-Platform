from fastapi import APIRouter, Query, HTTPException, Depends
from core.deps import require_roles
from core.sql_loader import load_sql
from datetime import datetime, timezone, timedelta
import pymysql
import pymysql.cursors
import os

router = APIRouter(prefix="/demand-status", tags=["demand-status"])

_IST = timedelta(hours=5, minutes=30)

_SQL = load_sql("001-demand_status_monthly.sql")


def _get_conn() -> pymysql.connections.Connection:
    return pymysql.connect(
        host=os.getenv("OL_REPLICA_HOST", ""),
        port=int(os.getenv("OL_REPLICA_PORT", "3306")),
        db=os.getenv("OL_REPLICA_DATABASE", "mysql"),
        user=os.getenv("OL_REPLICA_USER", ""),
        password=os.getenv("OL_REPLICA_PASSWORD", ""),
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        connect_timeout=15,
        read_timeout=15,
        autocommit=True,
    )


@router.get("")
def get_demand_status(
    month: int | None = Query(None, ge=1, le=12),
    year: int | None = Query(None, ge=2020, le=2030),
    _=Depends(require_roles("admin", "kam", "delivery_lead")),
):
    now_ist = datetime.now(timezone.utc) + _IST
    m = month if month is not None else now_ist.month
    y = year if year is not None else now_ist.year

    try:
        conn = _get_conn()
        with conn:
            with conn.cursor() as cur:
                cur.execute(_SQL, {"year": y, "month": m})
                rows = cur.fetchall()
        data = [
            {
                "company_name":                  r["company_name"],
                "demand_id":                     r["demand_id"],
                "last_demand_id":                r["last_demand_id"],
                "job_title_name":                r["job_title_name"],
                "no_of_positions":               r["no_of_positions"],
                "created_by_account_manager_id": r["created_by_account_manager_id"],
                "account_manager_name":          r["account_manager_name"],
                "delivery_lead":                 r["delivery_lead"],
                "recruiter":                     r["recruiter"],
            }
            for r in rows
        ]
        return {"month": m, "year": y, "total": len(data), "data": data}
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to fetch demand status")
