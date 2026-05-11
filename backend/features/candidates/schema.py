from pydantic import BaseModel
from infra.models import CandidateStatus


class CandidateCreate(BaseModel):
    job_id: int
    full_name: str
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


class CandidateUpdate(BaseModel):
    pool_verified: bool | None = None
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
    pool_added_at: str | None = None
    call_time: str | None = None
    validation_done_at: str | None = None
    submission_time_ts: str | None = None
    feedback_received_at: str | None = None
