import asyncio

from core.deps import require_roles
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from features.mrr.boolean_builder import service

router = APIRouter(prefix="/skills", tags=["boolean-builder"])

# Anyone who sources should be able to use this. Recruiters need it most;
# DLs source/call too; admins/KAMs may also experiment.
ALLOWED = ("admin", "recruiter", "delivery_lead", "kam")

IMAGE_MIMES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
DOCX_MIMES = {
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
}


class ExtractRequest(BaseModel):
    jd: str
    strictness: int = 3


@router.post("/extract")
async def extract_from_text(
    body: ExtractRequest,
    _=Depends(require_roles(*ALLOWED)),
):
    jd = (body.jd or "").strip()
    if not jd:
        raise HTTPException(status_code=400, detail="JD text is required.")
    try:
        return await asyncio.to_thread(service.build_boolean, jd, body.strictness)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Extraction failed: {e}")


@router.post("/extract-file")
async def extract_from_file(
    file: UploadFile = File(...),
    strictness: int = Form(3),
    _=Depends(require_roles(*ALLOWED)),
):
    fname = (file.filename or "").lower()
    mime = file.content_type or ""
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    try:
        if mime == "application/pdf" or fname.endswith(".pdf"):
            jd_text = await asyncio.to_thread(service.extract_text_from_pdf, data)
        elif mime in DOCX_MIMES or fname.endswith((".docx", ".doc")):
            jd_text = await asyncio.to_thread(service.extract_text_from_docx, data)
        else:
            raise HTTPException(
                status_code=400,
                detail="Unsupported file. Upload PDF/DOC/DOCX.",
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not read file: {e}")

    if not jd_text:
        raise HTTPException(
            status_code=422,
            detail="No readable text in the uploaded file.",
        )

    try:
        result = await asyncio.to_thread(service.build_boolean, jd_text, strictness)
        result["extracted_text_preview"] = jd_text[:400]
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Extraction failed: {e}")
