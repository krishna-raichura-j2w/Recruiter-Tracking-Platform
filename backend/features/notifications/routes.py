import asyncio
import json
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from core.database import get_db, SessionLocal
from core.deps import get_current_user
from core.security import decode_token
from infra.models import Notification
from features.notifications import service

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("/stream")
async def stream(token: str = Query(...)):
    """SSE endpoint. Polls for new notifications every 5 s and pushes them."""
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    user_id = int(payload["sub"])

    # The DB driver (psycopg2) is sync. Running queries directly in this async
    # generator would block the event loop for the duration of every query — so
    # with N connected SSE clients, all their polls would serialize on one
    # worker. Wrapping in asyncio.to_thread runs each query on the threadpool
    # and lets the loop service other requests in parallel.

    def _initial_last_id() -> int:
        db = SessionLocal()
        try:
            row = (
                db.query(Notification.id)
                .filter(Notification.user_id == user_id)
                .order_by(Notification.id.desc())
                .first()
            )
            return row[0] if row else 0
        finally:
            db.close()

    def _poll(last_id: int):
        db = SessionLocal()
        try:
            return service.get_new_since(db, user_id, last_id)
        finally:
            db.close()

    async def generator():
        last_id = await asyncio.to_thread(_initial_last_id)
        yield f"data: {json.dumps({'type': 'connected'})}\n\n"

        while True:
            await asyncio.sleep(5)
            try:
                new = await asyncio.to_thread(_poll, last_id)
                if new:
                    last_id = new[-1]["id"]
                    for n in new:
                        yield f"data: {json.dumps(n)}\n\n"
                else:
                    yield ": ping\n\n"
            except Exception:
                yield ": error\n\n"

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
    n = db.query(Notification).filter(
        Notification.id == notif_id,
        Notification.user_id == current_user.id,
    ).first()
    if n:
        n.is_read = True
        db.commit()
    return {"ok": True}
