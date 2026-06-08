from features.mrr.candidates.schema import CandidateCreate
from infra.models import DriveCallType, DriveStatus, DriveTrackerStage, DriveType
from pydantic import BaseModel


class DriveCreate(BaseModel):
    """Add another drive event to an existing walk-in/drive job (reschedule / cohort)."""
    job_id: int
    drive_type: DriveType | None = None
    drive_date_from: str | None = None
    drive_date_upto: str | None = None
    start_time: str | None = None
    end_time: str | None = None
    open_positions: int | None = None


class DriveUpdate(BaseModel):
    """Partial update of the fulfilment plan. Only non-None fields are applied."""
    drive_type: DriveType | None = None
    status: DriveStatus | None = None
    open_positions: int | None = None
    conversion_rate: float | None = None
    buffer_pct: float | None = None
    show_rate: float | None = None
    submission_target_override: int | None = None
    drive_date_from: str | None = None
    drive_date_upto: str | None = None
    start_time: str | None = None
    end_time: str | None = None
    venue: str | None = None
    dress_code: str | None = None
    virtual_link: str | None = None
    portal_cutoff: str | None = None
    bh_owner_id: int | None = None
    kam_owner_id: int | None = None
    dl_owner_id: int | None = None
    notes: str | None = None


class DriveCandidateCreate(CandidateCreate):
    """Add a fresh candidate to a drive. Same shape as the normal sourcing form
    (CandidateCreate — full required fields incl. resume) so the candidate is a
    first-class record saved to the same table. job_id is supplied by the drive,
    so it's optional here and overridden server-side."""
    job_id: int | None = None  # overridden from the drive's job


class DriveTrackerUpdate(BaseModel):
    tracker_stage: DriveTrackerStage


class DriveCallCreate(BaseModel):
    call_type: DriveCallType
    outcome: str | None = None
    notes: str | None = None
