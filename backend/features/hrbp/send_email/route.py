from core.deps import get_current_user
from core.email import send_outlook_email
from core.response_format import error_response, success_response
from fastapi import APIRouter, Depends
from pydantic import BaseModel, EmailStr

router = APIRouter(prefix="/send-email", tags=["hrbp-send-email"])


class SendEmailPayload(BaseModel):
    to: EmailStr
    subject: str
    body: str


@router.post("")
def send_email_endpoint(
    payload: SendEmailPayload,
    _: object = Depends(get_current_user),
):
    try:
        send_outlook_email([payload.to], payload.subject, payload.body)
        return success_response(data={}, message="Email sent successfully")
    except Exception as exc:
        return error_response(message=str(exc))
