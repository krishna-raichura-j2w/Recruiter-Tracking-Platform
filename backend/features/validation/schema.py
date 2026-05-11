from pydantic import BaseModel
from infra.models import ValidationStatus


class ValidationAction(BaseModel):
    candidate_id: int
    status: ValidationStatus
    comments: str | None = None
    submitted_to_client: str | None = None   # Y/N/NA
    submission_date: str | None = None
