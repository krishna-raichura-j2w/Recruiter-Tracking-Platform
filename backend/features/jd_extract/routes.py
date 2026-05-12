import asyncio
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from core.deps import require_roles
from features.jd_extract import service
from features.jd_extract.schema import JDExtractResponse

router = APIRouter(prefix="/jd-extract", tags=["jd-extract"])

ALLOWED_ROLES = ("admin", "kam")
IMAGE_MIMES   = {"image/jpeg", "image/png", "image/webp", "image/gif"}


@router.post("", response_model=JDExtractResponse)
async def extract_jd(
    text: str | None        = Form(None),
    file: UploadFile | None = File(None),
    _=Depends(require_roles(*ALLOWED_ROLES)),
):
    # PDF parsing (CPU) and the OpenAI SDK call (sync I/O) both block. Offload
    # them so this worker can serve other requests while extraction runs.
    if file:
        data = await file.read()
        mime = file.content_type or ""
        if mime == "application/pdf":
            parsed, cost, raw_text = await asyncio.to_thread(service.extract_from_pdf, data)
        elif mime in IMAGE_MIMES:
            parsed, cost, raw_text = await asyncio.to_thread(service.extract_from_image, data, mime)
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported file type: {mime}")
    elif text and text.strip():
        parsed, cost, raw_text = await asyncio.to_thread(service.extract_from_text, text.strip())
    else:
        raise HTTPException(status_code=400, detail="Provide either text or a file (PDF/image)")

    return JDExtractResponse(parsed=parsed, cost_info=cost, raw_text=raw_text)
