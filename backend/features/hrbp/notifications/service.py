from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException
from infra.hrbp_models import HRBPNotificationHistory
from sqlalchemy.orm import Session


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ── Internal: called by scheduler and other services ─────────────────────────

def push(
    db: Session,
    user_id: int,
    title: str,
    message: str,
    notif_type: str = "general",
    ticket_id: int | None = None,
) -> HRBPNotificationHistory:
    n = HRBPNotificationHistory(
        user_id=user_id,
        ticket_id=ticket_id,
        title=title,
        message=message,
        notif_type=notif_type,
    )
    db.add(n)
    # caller is responsible for committing
    return n


# ── List ──────────────────────────────────────────────────────────────────────

def list_for_user(
    db: Session,
    user_id: int,
    unread_only: bool = False,
    page_no: int = 1,
    per_page: int = 10,
) -> dict:
    q = (
        db.query(HRBPNotificationHistory)
        .filter(HRBPNotificationHistory.user_id == user_id)
    )
    if unread_only:
        q = q.filter(HRBPNotificationHistory.is_read == False)  # noqa: E712

    total = q.count()
    offset = (page_no - 1) * per_page
    items = (
        q.order_by(HRBPNotificationHistory.created_at.desc())
        .offset(offset)
        .limit(per_page)
        .all()
    )
    return {
        "total": total,
        "unread_count": db.query(HRBPNotificationHistory)
            .filter(
                HRBPNotificationHistory.user_id == user_id,
                HRBPNotificationHistory.is_read == False,  # noqa: E712
            )
            .count(),
        "items": [_serialize(n) for n in items],
    }


# ── Mark one read ─────────────────────────────────────────────────────────────

def mark_read(db: Session, notif_id: int, user_id: int) -> dict:
    n = _get_owned(db, notif_id, user_id)
    if not n.is_read:
        n.is_read = True
        n.read_at = _now()
        db.commit()
        db.refresh(n)
    return _serialize(n)


# ── Mark all read ─────────────────────────────────────────────────────────────

def mark_all_read(db: Session, user_id: int) -> dict:
    now = _now()
    updated = (
        db.query(HRBPNotificationHistory)
        .filter(
            HRBPNotificationHistory.user_id == user_id,
            HRBPNotificationHistory.is_read == False,  # noqa: E712
        )
        .all()
    )
    for n in updated:
        n.is_read = True
        n.read_at = now
    db.commit()
    return {"marked_read": len(updated)}


# ── Delete one ────────────────────────────────────────────────────────────────

def delete(db: Session, notif_id: int, user_id: int) -> dict:
    n = _get_owned(db, notif_id, user_id)
    db.delete(n)
    db.commit()
    return {"deleted": notif_id}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_owned(db: Session, notif_id: int, user_id: int) -> HRBPNotificationHistory:
    n = db.query(HRBPNotificationHistory).filter_by(id=notif_id).first()
    if not n:
        raise HTTPException(status_code=404, detail="Notification not found")
    if n.user_id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    return n


def _serialize(n: HRBPNotificationHistory) -> dict:
    return {
        "id":         n.id,
        "ticket_id":  n.ticket_id,
        "title":      n.title,
        "message":    n.message,
        "notif_type": n.notif_type,
        "is_read":    n.is_read,
        "read_at":    n.read_at.isoformat() if n.read_at else None,
        "created_at": n.created_at.isoformat() if n.created_at else None,
    }
