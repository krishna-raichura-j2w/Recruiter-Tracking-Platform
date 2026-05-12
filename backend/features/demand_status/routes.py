from fastapi import APIRouter, Query, HTTPException, Depends
from core.deps import require_roles
from datetime import datetime, timezone, timedelta
import pymysql
import pymysql.cursors
import os

router = APIRouter(prefix="/demand-status", tags=["demand-status"])

_IST = timedelta(hours=5, minutes=30)

_SQL = """
SELECT
    c.company_name                           AS company_name,
    jp.id                                    AS demand_id,
    prev_jp.id                               AS last_demand_id,
    jp.title                                 AS job_title_name,
    jp.no_of_opening                         AS no_of_positions,
    jp.user_id                               AS created_by_account_manager_id,
    CONCAT(am.first_name, ' ', am.last_name) AS account_manager_name,
    GROUP_CONCAT(
        DISTINCT CASE
            WHEN u.role_id = 6
            THEN CONCAT(u.first_name, ' ', u.last_name)
        END
    ) AS delivery_lead,
    GROUP_CONCAT(
        DISTINCT CASE
            WHEN u.role_id = 3
            THEN CONCAT(u.first_name, ' ', u.last_name)
        END
    ) AS recruiter
FROM offerletter.job_postings jp
LEFT JOIN offerletter.clients c
    ON c.user_id = jp.client_id
LEFT JOIN offerletter.users am
    ON am.id = jp.user_id
   AND am.role_id = 5
LEFT JOIN offerletter.job_assignments ja
    ON ja.job_posting_id = jp.id
LEFT JOIN offerletter.users u
    ON u.id = ja.user_id
LEFT JOIN offerletter.job_postings prev_jp
    ON prev_jp.id = (
        SELECT MAX(id)
        FROM offerletter.job_postings
        WHERE client_id = jp.client_id
          AND id < jp.id
    )
WHERE YEAR(CONVERT_TZ(jp.created_at, '+00:00', '+05:30'))  = %(year)s
  AND MONTH(CONVERT_TZ(jp.created_at, '+00:00', '+05:30')) = %(month)s
GROUP BY jp.id
ORDER BY jp.id DESC
"""


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
