from __future__ import annotations

from datetime import datetime, timezone

from core.pagination import PageResult, paginate
from fastapi import HTTPException
from infra.hrbp_models import HRBPAuditLog
from infra.models import User
from sqlalchemy.orm import Session


def log_action(
    db: Session,
    *,
    actor_id: int | None,
    entity_type: str,
    entity_id: int,
    action: str,
    old_value: dict | None = None,
    new_value: dict | None = None,
) -> None:
    entry = HRBPAuditLog(
        actor_id=actor_id,
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        old_value=old_value,
        new_value=new_value,
        ts=datetime.now(timezone.utc),
    )
    db.add(entry)
    # Caller is responsible for db.commit(); we just stage the entry.


def list_paginated(
    db: Session,
    page_no: int,
    per_page: int,
    entity_type: str | None = None,
    entity_id: int | None = None,
    actor_id: int | None = None,
    action: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> PageResult:
    q = db.query(HRBPAuditLog)
    if entity_type is not None:
        q = q.filter(HRBPAuditLog.entity_type == entity_type)
    if entity_id is not None:
        q = q.filter(HRBPAuditLog.entity_id == entity_id)
    if actor_id is not None:
        q = q.filter(HRBPAuditLog.actor_id == actor_id)
    if action is not None:
        q = q.filter(HRBPAuditLog.action == action)
    if date_from is not None:
        q = q.filter(HRBPAuditLog.ts >= date_from)
    if date_to is not None:
        q = q.filter(HRBPAuditLog.ts <= date_to)
    q = q.order_by(HRBPAuditLog.ts.desc())
    result = paginate(q, page_no, per_page)

    # Enrich with actor names in one query
    actor_ids = {r.actor_id for r in result.items if r.actor_id}
    name_map: dict[int, str] = {}
    if actor_ids:
        rows = db.query(User.id, User.name).filter(User.id.in_(actor_ids)).all()
        name_map = {r.id: r.name for r in rows}

    # Attach actor_name as a dynamic attribute for serialisation
    for item in result.items:
        item.__dict__["actor_name"] = name_map.get(item.actor_id) if item.actor_id else None

    return result


def get_by_id(db: Session, id: int) -> HRBPAuditLog:
    record = db.query(HRBPAuditLog).filter_by(id=id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Audit log entry not found")
    actor_name = None
    if record.actor_id:
        user = db.query(User.name).filter(User.id == record.actor_id).first()
        actor_name = user.name if user else None
    record.__dict__["actor_name"] = actor_name
    return record
