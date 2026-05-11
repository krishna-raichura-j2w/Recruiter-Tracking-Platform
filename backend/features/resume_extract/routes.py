from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from core.deps import require_roles
from features.resume_extract import service
from features.resume_extract.schema import ExtractResponse

router = APIRouter(prefix="/resume-extract", tags=["resume-extract"])

ALLOWED_ROLES = ("recruiter", "admin", "delivery_lead")
IMAGE_MIMES   = {"image/jpeg", "image/png", "image/webp", "image/gif"}


@router.post("", response_model=ExtractResponse)
async def extract_profile(
    text: str | None             = Form(None),
    file: UploadFile | None      = File(None),
    _=Depends(require_roles(*ALLOWED_ROLES)),
):
    if file:
        data  = await file.read()
        mime  = file.content_type or ""
        if mime == "application/pdf":
            profile, cost = service.extract_from_pdf(data)
        elif mime in IMAGE_MIMES:
            profile, cost = service.extract_from_image(data, mime)
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported file type: {mime}")
    elif text and text.strip():
        profile, cost = service.extract_from_text(text.strip())
    else:
        raise HTTPException(status_code=400, detail="Provide either text or a file (PDF/image)")

    return ExtractResponse(profile=profile, cost_info=cost)
