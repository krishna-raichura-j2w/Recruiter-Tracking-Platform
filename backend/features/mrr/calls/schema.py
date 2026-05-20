from pydantic import BaseModel
from infra.models import CallOutcome, AutoRecommendation


class CallLogCreate(BaseModel):
    candidate_id: int
    outcome: CallOutcome
    callback_date: str | None = None
    notes: str | None = None


class AssessmentUpsert(BaseModel):
    candidate_id: int
    # Verification basics (Stage A)
    full_name_confirmed: str | None = None
    email_verified: str | None = None
    alt_phone: str | None = None
    linkedin_verified: str | None = None
    total_exp: float | None = None
    relevant_exp: float | None = None
    qualification: str | None = None
    last_company: str | None = None
    last_tenure: str | None = None
    tenure_from: str | None = None
    tenure_to: str | None = None
    notice_period_weeks: int | None = None
    lwd_confirmed: str | None = None
    last_working_day: str | None = None
    # Deployment Target
    deploying_client: str | None = None
    role_position: str | None = None
    primary_skill_stack: str | None = None
    # CTC
    current_ctc: float | None = None
    expected_ctc: float | None = None
    # Stage B extras
    skill_match_last_role: str | None = None
    tech_q_used: str | None = None
    # Scores
    comm_score: float | None = None
    self_art_score: float | None = None
    role_art_score: float | None = None
    resume_skill_score: float | None = None
    tech_qa_score: float | None = None
    # Stage C
    paraphrase_score: float | None = None
    # Stage D - Availability & Commercials
    project_status: str | None = None
    open_to_relocation: str | None = None
    work_mode_pref: str | None = None
    work_auth_status: str | None = None
    current_city: str | None = None
    reason_for_change: str | None = None
    interviewing_elsewhere: str | None = None
    offers_in_hand: str | None = None
    counter_offer_risk: str | None = None
    last_appraisal_context: str | None = None
    # Close
    email_acknowledged: str | None = None
    validation_slot_locked: str | None = None
    confidence_score: float | None = None
    gut_score: float | None = None
    # Verdict
    pass_to_validation: str | None = None
    red_flags: str | None = None
    caller_notes: str | None = None
    submit_for_review: bool = False
