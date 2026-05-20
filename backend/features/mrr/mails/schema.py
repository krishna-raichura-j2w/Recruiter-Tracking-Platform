from pydantic import BaseModel


class MailCreate(BaseModel):
    candidate_id: int


class MailUpdate(BaseModel):
    exit_date: str | None = None
    acknowledgement_received: bool | None = None
    dl_verified: bool | None = None
    exit_proof: str | None = None   # base64 data URL of uploaded image/PDF
