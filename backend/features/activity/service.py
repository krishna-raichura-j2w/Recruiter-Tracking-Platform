"""User activity logging — writes to the existing audit_logs table."""
from sqlalchemy.orm import Session
from infra.models import AuditLog, User, to_iso_utc


def log(
    db: Session,
    user_id: int,
    action: str,
    description: str,
    entity_type: str | None = None,
    entity_id: int | None = None,
):
    """Fire-and-forget activity log entry. Never raises."""
    try:
        entry = AuditLog(
            user_id=user_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            detail=description,
        )
        db.add(entry)
        db.commit()
    except Exception:
        db.rollback()


def get_activity_summary(db: Session) -> list[dict]:
    """Return every active user with their last activity log entry."""
    users = db.query(User).filter(User.is_active == True).all()

    # Bulk: latest audit log per user
    from sqlalchemy import text
    rows = db.execute(text("""
        SELECT DISTINCT ON (user_id)
            user_id, action, detail, entity_type, entity_id, created_at
        FROM audit_logs
        ORDER BY user_id, created_at DESC
    """)).fetchall()

    last_act: dict[int, dict] = {}
    for r in rows:
        last_act[r.user_id] = {
            "action":      r.action,
            "description": r.detail,
            "entity_type": r.entity_type,
            "entity_id":   r.entity_id,
            "at":          to_iso_utc(r.created_at),
        }

    result = []
    for u in users:
        act = last_act.get(u.id)
        result.append({
            "id":            u.id,
            "name":          u.name,
            "role":          u.role.value,
            "secondary_role":u.secondary_role,
            "last_login_at": to_iso_utc(u.last_login_at),
            "last_action":   act,
        })
    return result
