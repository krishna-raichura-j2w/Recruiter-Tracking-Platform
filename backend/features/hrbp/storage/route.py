from core.response_format import error_response, success_response
from fastapi import APIRouter, UploadFile

from features.hrbp.storage import service

router = APIRouter(prefix="/storage", tags=["hrbp-storage"])


@router.post("/upload")
def upload_file(file: UploadFile):
    try:
        url = service.upload_file(file)
        return success_response(data={"url": url}, message="File uploaded successfully")
    except Exception as exc:
        return error_response(message=str(exc))
