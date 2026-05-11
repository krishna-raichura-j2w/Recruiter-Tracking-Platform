from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from core.database import get_db
from core.deps import get_current_user, require_roles
from features.users.schema import UserCreate, UserUpdate, UserOut
from features.users import service
from features.allocation.service import team_loads
from infra.models import UserRole

router = APIRouter(prefix="/users", tags=["users"])


def _out(user) -> dict:
    return {
        "id":             user.id,
        "name":           user.name,
        "email":          user.email,
        "role":           user.role.value,
        "recruiter_type": user.recruiter_type.value if user.recruiter_type else None,
        "is_active":      user.is_active,
        "pod_lead_id":    user.pod_lead_id,
    }


@router.get("")
def list_users(
    role: str | None = Query(None),
    available: bool  = Query(False),
    db: Session      = Depends(get_db),
    current_user     = Depends(require_roles("admin", "delivery_lead")),
):
    """
    admin: all users
    delivery_lead: their team; ?available=true returns unassigned callers/sourcing_partners
    """
    is_dl = current_user.role.value == "delivery_lead"
    if available and is_dl:
        users = service.list_available_team(db, dl_id=current_user.id)
    elif is_dl:
        users = service.list_users(db, role=role, pod_lead_id=current_user.id)
    else:
        users = service.list_users(db, role=role)
    return [_out(u) for u in users]


@router.post("")
def create_user(
    body: UserCreate,
    db: Session = Depends(get_db),
    _=Depends(require_roles("admin")),
):
    return _out(service.create_user(db, body.model_dump()))


@router.post("/{user_id}/reset-password")
def reset_password(
    user_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_roles("admin")),
):
    user = service.reset_password(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": f"Password reset to default for {user.name}"}


@router.patch("/{user_id}")
def update_user(
    user_id: int,
    body: UserUpdate,
    db: Session    = Depends(get_db),
    current_user   = Depends(require_roles("admin", "delivery_lead")),
):
    data = body.model_dump(exclude_none=True)
    if current_user.role.value == "delivery_lead":
        allowed_keys = {"pod_lead_id"}
        data = {k: v for k, v in data.items() if k in allowed_keys}
    user = service.update_user(db, user_id, data)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return _out(user)


class AssignPodBody(BaseModel):
    recruiter_type: str  # "sourcer", "caller", or "both"


@router.post("/{user_id}/assign-pod")
def assign_pod(
    user_id: int,
    body: AssignPodBody,
    db: Session  = Depends(get_db),
    current_user = Depends(require_roles("admin", "delivery_lead")),
):
    dl_id = current_user.id if current_user.role.value == "delivery_lead" else None
    user = service.assign_to_pod(db, user_id, dl_id, recruiter_type=body.recruiter_type)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return _out(user)


@router.get("/delivery-leads")
def list_delivery_leads(
    db: Session  = Depends(get_db),
    _            = Depends(require_roles("admin", "kam")),
):
    """KAM fetches active delivery leads; includes the clients each DL is currently handling."""
    from infra.models import Job, JobStatus
    users = service.list_users(db, role=UserRole.delivery_lead)
    result = []
    for u in users:
        if not u.is_active:
            continue
        client_rows = (
            db.query(Job.client_name)
            .filter(Job.delivery_lead_id == u.id, Job.status != JobStatus.closed)
            .distinct()
            .all()
        )
        data = _out(u)
        data["clients"] = [r.client_name for r in client_rows]
        result.append(data)
    return result


@router.get("/team-loads")
def get_team_loads(
    db: Session  = Depends(get_db),
    current_user = Depends(require_roles("admin", "delivery_lead")),
):
    """Return per-role load counts for each DL's team."""
    dl_id = current_user.id if current_user.role.value == "delivery_lead" else None
    if dl_id is None:
        return {"sourcers": [], "callers": []}
    recruiters = team_loads(db, dl_id, UserRole.recruiter)
    return {
        "sourcers": recruiters,
        "callers":  recruiters,
    }


@router.get("/{user_id}/activity")
def get_activity(
    user_id: int,
    date: str | None = Query(None, description="YYYY-MM-DD filter"),
    db: Session      = Depends(get_db),
    _                = Depends(require_roles("admin", "delivery_lead")),
):
    """Return sourced & called candidate lists for a team member, optionally filtered by date."""
    return service.get_user_activity(db, user_id, date)


@router.delete("/{user_id}/pod")
def remove_from_pod(
    user_id: int,
    db: Session  = Depends(get_db),
    _            = Depends(require_roles("admin", "delivery_lead")),
):
    user = service.assign_to_pod(db, user_id, None)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return _out(user)


@router.delete("/{user_id}")
def deactivate_user(
    user_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_roles("admin")),
):
    if not service.delete_user(db, user_id):
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User deactivated"}
