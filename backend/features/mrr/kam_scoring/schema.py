from pydantic import BaseModel


class RunIn(BaseModel):
    keys: list[str] | None = None      # unified row keys (mrr:.. / ol:..)


class JdOverrideIn(BaseModel):
    demand_key: str                    # "mrr:{job_id}" or "ol:{ol_job_posting_id}"
    jd_text: str


class DecisionIn(BaseModel):
    key: str                           # unified row key
    decision: str                      # select | reject | pending
    reason: str | None = None
