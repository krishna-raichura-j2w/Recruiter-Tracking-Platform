from pydantic import BaseModel
from infra.models import JobStatus, WorkMode


class JobCreate(BaseModel):
    client_name: str
    role_title: str
    skill_stack: str | None = None
    work_mode: WorkMode | None = None
    work_auth: str | None = None
    headcount: int = 1
    location: str | None = None
    jd_summary: str | None = None
    jd_parsed: str | None = None
    jd_raw_text: str | None = None
    min_experience: int | None = None
    max_experience: int | None = None
    salary_range: str | None = None
    delivery_lead_id: int | None = None
    business_head_id: int | None = None
    deadline: str | None = None
    sourcing_deadline: str | None = None
    calling_deadline: str | None = None


class JobUpdate(BaseModel):
    role_title: str | None = None
    skill_stack: str | None = None
    work_mode: WorkMode | None = None
    work_auth: str | None = None
    headcount: int | None = None
    status: JobStatus | None = None
    location: str | None = None
    jd_summary: str | None = None
    jd_parsed: str | None = None
    jd_raw_text: str | None = None
    min_experience: int | None = None
    max_experience: int | None = None
    salary_range: str | None = None
    business_head_id: int | None = None
    deadline: str | None = None


class JobOut(BaseModel):
    id: int
    client_name: str
    role_title: str
    skill_stack: str | None
    work_mode: str | None
    work_auth: str | None
    headcount: int
    status: str
    location: str | None = None
    jd_summary: str | None = None
    jd_parsed: str | None = None
    min_experience: int | None = None
    max_experience: int | None = None
    salary_range: str | None = None
    created_by_id: int | None
    candidate_count: int = 0

    model_config = {"from_attributes": True}
