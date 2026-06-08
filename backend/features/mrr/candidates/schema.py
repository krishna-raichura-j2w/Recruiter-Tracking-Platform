from infra.models import CandidateStatus
from pydantic import BaseModel, EmailStr


class CandidateCreate(BaseModel):
    job_id: int
    full_name: str  # legacy, still required (existing form sends it)

    # ── New required fields ──────────────────────────────────────────────────
    first_name: str
    last_name: str
    email: EmailStr
    contact_phone: str
    gender: str
    location: str
    designation: str
    employer: str
    min_experience: float
    max_experience: float
    current_ctc: float
    expected_ctc: float
    resume: str  # S3 key for the resume file

    # ── Optional legacy / helper fields (kept so existing form still works) ──
    mobile: str | None = None
    linkedin_url: str | None = None
    education: str | None = None
    city: str | None = None
    exp_range: str | None = None
    current_company: str | None = None
    skills: str | None = None
    naukri_active: str | None = None
    immediate_joiner: str | None = None
    lead_source: str | None = None
    sourcing_date: str | None = None
    resume_data: str | None = None
    total_experience: float | None = None
    # Set when sourced fresh for a walk-in/drive — links the candidate to that drive.
    drive_id: int | None = None


class CandidateUpdate(BaseModel):
    assigned_to_id: int | None = None
    status: CandidateStatus | None = None
    full_name: str | None = None
    mobile: str | None = None
    email: str | None = None
    linkedin_url: str | None = None
    education: str | None = None
    city: str | None = None
    exp_range: str | None = None
    current_company: str | None = None
    skills: str | None = None
    naukri_active: str | None = None
    immediate_joiner: str | None = None
    lead_source: str | None = None
    sourcing_date: str | None = None
    resume_data: str | None = None
    pool_added_at: str | None = None
    call_time: str | None = None
    validation_done_at: str | None = None
    submission_time_ts: str | None = None
    feedback_received_at: str | None = None
    # New fields are also editable
    first_name: str | None = None
    last_name: str | None = None
    contact_phone: str | None = None
    gender: str | None = None
    location: str | None = None
    designation: str | None = None
    employer: str | None = None
    total_experience: float | None = None
    min_experience: float | None = None
    max_experience: float | None = None
    current_ctc: float | None = None
    expected_ctc: float | None = None
    resume: str | None = None
