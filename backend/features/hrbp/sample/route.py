from core.response_format import error_response, success_response
from fastapi import APIRouter
from pydantic import BaseModel

from features.hrbp.sample import service

router = APIRouter(prefix="/sample", tags=["hrbp-sample"])


class AIRequest(BaseModel):
    prompt: str


@router.get("/get")
def get_sample_api():
    try:
        data = service.get_sample()
        return success_response(
            data=data,
            message="Sample get API executed successfully",
        )
    except Exception as exc:
        return error_response(message=str(exc))


@router.post("/ai")
def sample_ai_api(body: AIRequest):
    try:
        data = service.get_sample_ai_response(prompt=body.prompt)
        return success_response(data=data, message="AI response fetched successfully")
    except Exception as exc:
        return error_response(message=str(exc))
