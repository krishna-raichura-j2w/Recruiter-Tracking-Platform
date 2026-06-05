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


class DriveCandidateCreate(BaseModel):
    """Add a fresh candidate to a drive. Name is required; the rest is optional so
    walk-in/drive-day entry stays fast. Creates a full candidate row linked to the
    drive (candidates.drive_id)."""
    full_name: str
    mobile: str | None = None
    email: str | None = None
    skills: str | None = None
    designation: str | None = None
    employer: str | None = None
    current_company: str | None = None
    location: str | None = None
    city: str | None = None
    min_experience: float | None = None
    max_experience: float | None = None
    total_experience: float | None = None
    current_ctc: float | None = None
    expected_ctc: float | None = None
    immediate_joiner: str | None = None
    lead_source: str | None = None


class DriveTrackerUpdate(BaseModel):
    tracker_stage: DriveTrackerStage


class DriveCallCreate(BaseModel):
    call_type: DriveCallType
    outcome: str | None = None
    notes: str | None = None
