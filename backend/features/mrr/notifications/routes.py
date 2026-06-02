import asyncio
import json

from core.database import SessionLocal, get_db
from core.deps import get_current_user
from core.security import decode_token
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from infra.models import Notification
from sqlalchemy.orm import Session

from features.mrr.notifications import service

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("/stream")
async def stream(token: str = Query(...)):
    """SSE endpoint — TEMPORARILY DISABLED for DB-load relief.

    The previous implementation polled the database every 5s per connected
    client; with ~80 users that was ~16 DB queries/sec of constant churn on a
    79-connection RDS instance, a major cause of pool exhaustion. This now keeps
    the EventSource connection alive with comment pings only (NO DB queries), so
    both new and old cached frontends generate zero database load. Notifications
    still appear via the regular /dashboard/notifications fetch on page load.
    """
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")

    async def generator():
        yield f"data: {json.dumps({'type': 'connected'})}\n\n"
        # Heartbeat only — no DB polling.
        while True:
            await asyncio.sleep(30)
            yield ": ping\n\n"

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/mark-all-read")
def mark_all_read(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    service.mark_all_read(db, current_user.id)
    return {"ok": True}


@router.post("/{notif_id}/read")
def mark_one_read(
    notif_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    n = (
        db.query(Notification)
        .filter(
            Notification.id == notif_id,
            Notification.user_id == current_user.id,
        )
        .first()
    )
    if n:
        n.is_read = True
        db.commit()
    return {"ok": True}
