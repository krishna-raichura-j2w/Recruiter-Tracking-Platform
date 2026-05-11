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

    async def generator():
        # Initialise last_id to current max so we only send *new* ones
        init_db = SessionLocal()
        try:
            row = init_db.query(Notification.id).filter(
                Notification.user_id == user_id
            ).order_by(Notification.id.desc()).first()
            last_id = row[0] if row else 0
        finally:
            init_db.close()

        yield f"data: {json.dumps({'type': 'connected'})}\n\n"

        while True:
            await asyncio.sleep(5)
            poll_db = SessionLocal()
            try:
                new = service.get_new_since(poll_db, user_id, last_id)
                if new:
                    last_id = new[-1]["id"]
                    for n in new:
                        yield f"data: {json.dumps(n)}\n\n"
                else:
                    yield ": ping\n\n"
            except Exception:
                yield ": error\n\n"
            finally:
                poll_db.close()

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
