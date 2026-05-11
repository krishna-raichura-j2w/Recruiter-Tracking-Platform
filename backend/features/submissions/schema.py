from pydantic import BaseModel
from infra.models import InterviewStage


class SubmitToClient(BaseModel):
    candidate_id: int
    notes: str | None = None


class StageUpdate(BaseModel):
    current_stage: InterviewStage
    # Timeline metadata
    interview_date: str | None = None   # datetime string for scheduled stages
    feedback: str | None = None         # Pass / Fail / Hold
    # TA / HM
    ta_feedback: str | None = None
    hm_feedback: str | None = None
    tat_window: str | None = None
    # L1
    l1_date: str | None = None
    l1_feedback: str | None = None
    l1_briefing_done: bool | None = None
    # L2
    l2_date: str | None = None
    l2_feedback: str | None = None
    l2_briefing_done: bool | None = None
    # Final
    final_date: str | None = None
    final_feedback: str | None = None
    final_briefing_done: bool | None = None
    # Offer
    offered_ctc: float | None = None
    offer_date: str | None = None
    joining_date_confirmed: str | None = None
    actual_joining_date: str | None = None
    # Risk
    other_offers_count: str | None = None
    counter_offer_risk: str | None = None
    # Notes
    last_notes: str | None = None
    next_action: str | None = None
    next_action_date: str | None = None
