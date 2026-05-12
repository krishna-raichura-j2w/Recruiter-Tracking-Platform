import asyncio
from fastapi import APIRouter, UploadFile, File, Query, HTTPException, Depends
from core.deps import get_current_user
from infra.s3 import upload_file, get_presigned_url

router = APIRouter(prefix="/upload", tags=["upload"])

ALLOWED_FOLDERS = {"resumes", "exit-proofs", "logos", "jd-files"}
MAX_BYTES = 15 * 1024 * 1024  # 15 MB


@router.post("")
async def upload(
    file: UploadFile = File(...),
    folder: str = Query("resumes"),
    _=Depends(get_current_user),
):
    if folder not in ALLOWED_FOLDERS:
        raise HTTPException(400, detail=f"folder must be one of: {sorted(ALLOWED_FOLDERS)}")
    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(413, detail="File too large (max 15 MB)")
    ct = file.content_type or "application/octet-stream"
    # boto3 is sync — offload to threadpool so other requests on this worker
    # keep flowing while S3 is being hit.
    key = await asyncio.to_thread(upload_file, data, folder, file.filename or "file", ct)
    url = await asyncio.to_thread(get_presigned_url, key)
    return {"key": key, "url": url}


@router.get("/url")
def view_url(
    key: str = Query(...),
    _=Depends(get_current_user),
):
    """Generate a fresh presigned URL for an existing S3 key."""
    try:
        return {"url": get_presigned_url(key)}
    except Exception:
        raise HTTPException(404, detail="File not found")
