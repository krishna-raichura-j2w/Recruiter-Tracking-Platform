from core.database import get_db
from core.deps import get_current_user, require_roles
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from features.mrr.activity.service import log as log_activity
from features.mrr.drives import service
from features.mrr.drives.schema import (
    DriveCallCreate,
    DriveCandidateCreate,
    DriveCreate,
    DriveTrackerUpdate,
    DriveUpdate,
)

router = APIRouter(prefix="/drives", tags=["drives"])

# Coarse role gates. Finer field-level rules (e.g. recruiters can't edit the
# fulfilment plan) are handled per-endpoint / in the UI.
_VIEW = ("admin", "kam", "delivery_lead", "bh", "recruiter")
_PLAN_EDIT = ("admin", "kam", "delivery_lead", "bh")
_LINEUP = ("admin", "kam", "delivery_lead", "recruiter")


@router.get("")
def list_drives(
    status: str | None = Query(None),
    mine: bool = Query(False),
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(*_VIEW)),
):
    return service.list_drives(db, status=status, user=current_user, mine=mine)


@router.post("")
def create_drive(
    body: DriveCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("admin", "kam", "delivery_lead")),
):
    drive = service.create_drive(db, body.model_dump(), current_user.id)
    if not drive:
        raise HTTPException(status_code=404, detail="Job not found")
    log_activity(
        db, current_user.id, "drive_created",
        f"Added drive event for job #{drive.job_id}",
        entity_type="drive", entity_id=drive.id,
    )
    return service._drive_dict(db, drive)


@router.get("/{drive_id}")
def get_drive(
    drive_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(*_VIEW)),
):
    drive = service.get_drive(db, drive_id)
    if not drive:
        raise HTTPException(status_code=404, detail="Drive not found")
    return service._drive_dict(db, drive)


@router.patch("/{drive_id}")
def update_drive(
    drive_id: int,
    body: DriveUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(*_PLAN_EDIT)),
):
    drive = service.update_drive(db, drive_id, body.model_dump(exclude_unset=True))
    if not drive:
        raise HTTPException(status_code=404, detail="Drive not found")
    log_activity(
        db, current_user.id, "drive_updated",
        f"Updated fulfilment plan for drive #{drive_id}",
        entity_type="drive", entity_id=drive_id,
    )
    return service._drive_dict(db, drive)


@router.get("/{drive_id}/candidates")
def list_drive_candidates(
    drive_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(*_VIEW)),
):
    drive = service.get_drive(db, drive_id)
    if not drive:
        raise HTTPException(status_code=404, detail="Drive not found")
    return service.list_drive_candidates(db, drive_id)


@router.post("/{drive_id}/candidates")
def add_drive_candidate(
    drive_id: int,
    body: DriveCandidateCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(*_LINEUP)),
):
    drive = service.get_drive(db, drive_id)
    if not drive:
        raise HTTPException(status_code=404, detail="Drive not found")
    role = current_user.role.value
    sourced_by_id = current_user.id if role in ("recruiter", "delivery_lead") else None
    candidate = service.add_drive_candidate(
        db,
        drive_id,
        drive.job_id,
        body.model_dump(),
        sourced_by_id=sourced_by_id,
        created_by_email=current_user.email,
    )
    log_activity(
        db, current_user.id, "drive_candidate_added",
        f"Added {candidate.full_name} to drive #{drive_id}",
        entity_type="drive", entity_id=drive_id,
    )
    return service._candidate_dict(db, candidate)


@router.patch("/{drive_id}/candidates/{candidate_id}/tracker")
def update_tracker(
    drive_id: int,
    candidate_id: int,
    body: DriveTrackerUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("admin", "kam", "delivery_lead", "recruiter")),
):
    c = service.update_tracker(db, drive_id, candidate_id, body.tracker_stage)
    if not c:
        raise HTTPException(status_code=404, detail="Candidate not found on this drive")
    log_activity(
        db, current_user.id, "drive_tracker_updated",
        f"{c.full_name} → {body.tracker_stage.value} (drive #{drive_id})",
        entity_type="drive", entity_id=drive_id,
    )
    return service._candidate_dict(db, c)


@router.get("/{drive_id}/candidates/{candidate_id}/calls")
def list_calls(
    drive_id: int,
    candidate_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(*_VIEW)),
):
    return service.list_drive_calls(db, drive_id, candidate_id)


@router.post("/{drive_id}/candidates/{candidate_id}/calls")
def add_call(
    drive_id: int,
    candidate_id: int,
    body: DriveCallCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("admin", "kam", "delivery_lead", "recruiter", "bh")),
):
    call = service.add_drive_call(
        db,
        drive_id,
        candidate_id,
        current_user.id,
        body.call_type,
        body.outcome,
        body.notes,
    )
    if not call:
        raise HTTPException(status_code=404, detail="Candidate not found on this drive")
    log_activity(
        db, current_user.id, "drive_call_logged",
        f"Logged {body.call_type.value} call (drive #{drive_id})",
        entity_type="drive", entity_id=drive_id,
    )
    return service._call_dict(call)
