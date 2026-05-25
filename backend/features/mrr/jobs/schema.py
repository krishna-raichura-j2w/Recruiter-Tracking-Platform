from infra.models import JobStatus, WorkMode
from pydantic import BaseModel


class JobCreate(BaseModel):
    client_name:         str
    role_title:          str
    job_id:              int | None = None       # OL job ID (existing job only)
    ol_job_type:         str | None = None       # UI-only — "new" / "existing"
    probing_id:          int | None = None
    client_job_id:       str | None = None
    demand_source:       str | None = None
    demand_type:         str | None = None
    demand_exclusivity:  str | None = None
    skill_stack:         str | None = None
    work_mode:           WorkMode | None = None
    work_auth:           str | None = None
    headcount:           int = 1
    location:            str | None = None
    jd_summary:          str | None = None
    jd_parsed:           str | None = None
    jd_raw_text:         str | None = None
    min_experience:      int | None = None
    max_experience:      int | None = None
    salary_range:        str | None = None
    delivery_lead_id:    int | None = None
    delivery_lead_ids:   list[int] = []
    business_head_id:    int | None = None
    kam_id:              int | None = None
    deadline:            str | None = None
    sourcing_deadline:   str | None = None
    calling_deadline:    str | None = None
    # ── OL-mapped fields ──────────────────────────────────────────────────────
    designation:          str | None = None
    walkin:               bool = False
    drive:                bool = False
    start_time:           str | None = None
    end_time:             str | None = None
    date_from:            str | None = None
    date_upto:            str | None = None
    salary_from:          float | None = None
    salary_to:            float | None = None
    maximum_submission:   int | None = None
    requested_date:       str | None = None
    requested_by:         str | None = None
    expected_submission:  str | None = None
    requirement_type:     str | None = None
    job_responsibilities: str | None = None
    billable_leaves:      bool | None = None
    is_vip:               bool = False
    po_opportunity_mrr:   str | None = None
    potential_gm:         str | None = None
    key_string:           str | None = None
    referral_amount:      int | None = None
    group_name:           str | None = None
    sub_group:            str | None = None


class JobUpdate(BaseModel):
    client_name:         str | None = None
    role_title:          str | None = None
    job_id:              int | None = None
    probing_id:          int | None = None
    client_job_id:       str | None = None
    demand_source:       str | None = None
    demand_type:         str | None = None
    demand_exclusivity:  str | None = None
    skill_stack:         str | None = None
    work_mode:           WorkMode | None = None
    work_auth:           str | None = None
    headcount:           int | None = None
    status:              JobStatus | None = None
    location:            str | None = None
    jd_summary:          str | None = None
    jd_parsed:           str | None = None
    jd_raw_text:         str | None = None
    min_experience:      int | None = None
    max_experience:      int | None = None
    salary_range:        str | None = None
    business_head_id:    int | None = None
    deadline:            str | None = None
    delivery_lead_id:    int | None = None
    delivery_lead_ids:   list[int] | None = None
    # ── OL-mapped fields ──────────────────────────────────────────────────────
    designation:          str | None = None
    walkin:               bool | None = None
    drive:                bool | None = None
    start_time:           str | None = None
    end_time:             str | None = None
    date_from:            str | None = None
    date_upto:            str | None = None
    salary_from:          float | None = None
    salary_to:            float | None = None
    maximum_submission:   int | None = None
    requested_date:       str | None = None
    requested_by:         str | None = None
    expected_submission:  str | None = None
    requirement_type:     str | None = None
    job_responsibilities: str | None = None
    billable_leaves:      bool | None = None
    is_vip:               bool | None = None
    po_opportunity_mrr:   str | None = None
    potential_gm:         str | None = None
    key_string:           str | None = None
    referral_amount:      int | None = None
    group_name:           str | None = None
    sub_group:            str | None = None


class JobOut(BaseModel):
    id:                   int
    client_name:          str
    role_title:           str
    job_id:               int | None = None
    designation:          str | None = None
    skill_stack:          str | None = None
    work_mode:            str | None = None
    work_auth:            str | None = None
    headcount:            int
    status:               str
    location:             str | None = None
    jd_summary:           str | None = None
    jd_parsed:            str | None = None
    min_experience:       int | None = None
    max_experience:       int | None = None
    salary_range:         str | None = None
    salary_from:          float | None = None
    salary_to:            float | None = None
    created_by_id:        int | None = None
    candidate_count:      int = 0
    walkin:               bool = False
    drive:                bool = False
    start_time:           str | None = None
    end_time:             str | None = None
    date_from:            str | None = None
    date_upto:            str | None = None
    maximum_submission:   int | None = None
    requested_date:       str | None = None
    requested_by:         str | None = None
    expected_submission:  str | None = None
    requirement_type:     str | None = None
    job_responsibilities: str | None = None
    billable_leaves:      bool | None = None
    is_vip:               bool = False
    po_opportunity_mrr:   str | None = None
    potential_gm:         str | None = None
    key_string:           str | None = None
    referral_amount:      int | None = None
    group_name:           str | None = None
    sub_group:            str | None = None
    client_job_id:             str | None = None
    questionnaire_notes:       str | None = None
    questionnaire_generated_at: str | None = None

    model_config = {"from_attributes": True}
