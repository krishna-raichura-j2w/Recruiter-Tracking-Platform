from pydantic import BaseModel


class RunIn(BaseModel):
    candidate_ids: list[int] | None = None


class JdOverrideIn(BaseModel):
    job_id: int
    jd_text: str


class DecisionIn(BaseModel):
    candidate_id: int
    job_id: int
    decision: str  # select | reject | pending
    reason: str | None = None
