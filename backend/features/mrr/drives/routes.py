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


# NOTE: declared BEFORE "/{drive_id}" so "summary" is not captured as a drive id.
@router.get("/summary")
def drives_summary(
    scope: str | None = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("admin", "kam", "delivery_lead", "bh")),
):
    # Admin defaults to all drives; KAM/DL/BH default to the ones they own.
    if scope not in ("mine", "all"):
        scope = "all" if current_user.role.value == "admin" else "mine"
    return service.drives_summary(db, current_user, scope=scope)


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
    # Runs the SAME full create-flow as POST /candidates (OL dup check, onboarding
    # flags, activity log, caller assignment) so the candidate is a first-class
    # record in the same table — just linked to this drive. KAM is allowed here.
    from features.mrr.candidates import service as cand_service

    data = body.model_dump()
    data["job_id"] = drive.job_id            # the drive supplies the job
    candidate = cand_service.create_candidate_full(
        db, data, current_user, drive_id=drive_id,
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
