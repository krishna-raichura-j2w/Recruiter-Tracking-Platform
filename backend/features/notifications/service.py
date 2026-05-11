from sqlalchemy.orm import Session
from infra.models import Notification, NotifType, User, UserRole


def push(db: Session, user_id: int, message: str,
         notif_type: NotifType = NotifType.general,
         entity_id: int | None = None) -> Notification:
    n = Notification(user_id=user_id, message=message,
                     notif_type=notif_type, entity_id=entity_id)
    db.add(n)
    # caller is responsible for committing the outer transaction
    return n


def push_to_role(db: Session, role: UserRole, message: str,
                 notif_type: NotifType = NotifType.general,
                 entity_id: int | None = None,
                 exclude_user_id: int | None = None):
    users = db.query(User).filter(User.role == role, User.is_active == True).all()
    for u in users:
        if u.id == exclude_user_id:
            continue
        push(db, u.id, message, notif_type, entity_id)


def get_new_since(db: Session, user_id: int, since_id: int) -> list[dict]:
    rows = (
        db.query(Notification)
        .filter(Notification.user_id == user_id, Notification.id > since_id)
        .order_by(Notification.id)
        .all()
    )
    return [
        {
            "id":          r.id,
            "message":     r.message,
            "notif_type":  r.notif_type.value if r.notif_type else "general",
            "is_read":     r.is_read,
            "entity_id":   r.entity_id,
            "created_at":  r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


def mark_all_read(db: Session, user_id: int):
    db.query(Notification).filter(
        Notification.user_id == user_id, Notification.is_read == False
    ).update({"is_read": True})
    db.commit()
