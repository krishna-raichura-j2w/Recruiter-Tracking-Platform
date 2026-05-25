from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from core.database import get_db
from core.deps import get_current_user
from core.response_format import error_response, success_response
from features.hrbp.ai import service
from infra.models import User

router = APIRouter(prefix="/ai", tags=["hrbp-ai"])


class ChatMessageIn(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class AIChatRequest(BaseModel):
    message: str
    history: list[ChatMessageIn] = []


@router.post("/chat")
def ai_chat(
    payload: AIChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Multi-turn chat endpoint for the HR Email Copilot."""
    try:
        if not payload.message.strip():
            return error_response(message="Message cannot be empty")

        history = [{"role": m.role, "content": m.content} for m in payload.history]
        response = service.handle_chat(payload.message, history)
        return success_response(data={"response": response}, message="OK")
    except Exception as exc:
        return error_response(message=str(exc))
