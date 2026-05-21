import os
import uuid
from datetime import datetime, timezone

from azure.storage.blob import BlobServiceClient
from fastapi import HTTPException, UploadFile

ACCOUNT_NAME = os.getenv("AZURE_STORAGE_ACCOUNT_NAME")
ACCOUNT_KEY = os.getenv("AZURE_STORAGE_ACCOUNT_KEY")
CONTAINER_NAME = os.getenv("AZURE_STORAGE_CONTAINER_NAME")


def _client() -> BlobServiceClient:
    connection_string = (
        f"DefaultEndpointsProtocol=https;"
        f"AccountName={ACCOUNT_NAME};"
        f"AccountKey={ACCOUNT_KEY};"
        f"EndpointSuffix=core.windows.net"
    )
    return BlobServiceClient.from_connection_string(connection_string)


def upload_bytes(data: bytes, filename: str) -> str:
    """Upload raw bytes directly (no UploadFile wrapper needed)."""
    if not ACCOUNT_NAME or not ACCOUNT_KEY or not CONTAINER_NAME:
        raise HTTPException(status_code=500, detail="Azure Blob Storage is not configured")

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    unique_name = f"{timestamp}_{uuid.uuid4().hex[:8]}_{filename}"
    blob_name = f"exports/{unique_name}"

    try:
        client = _client()
        blob_client = client.get_blob_client(container=CONTAINER_NAME, blob=blob_name)
        blob_client.upload_blob(data, overwrite=True)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Upload failed: {exc}") from exc

    return f"https://{ACCOUNT_NAME}.blob.core.windows.net/{CONTAINER_NAME}/{blob_name}"


def upload_file(file: UploadFile) -> str:
    if not ACCOUNT_NAME or not ACCOUNT_KEY or not CONTAINER_NAME:
        raise HTTPException(status_code=500, detail="Azure Blob Storage is not configured")

    ext = file.filename.rsplit(".", 1)[-1] if "." in file.filename else ""
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    unique_name = f"{timestamp}_{uuid.uuid4().hex[:8]}.{ext}" if ext else f"{timestamp}_{uuid.uuid4().hex[:8]}"
    blob_name = f"uploads/{unique_name}"

    try:
        client = _client()
        blob_client = client.get_blob_client(container=CONTAINER_NAME, blob=blob_name)
        blob_client.upload_blob(file.file, overwrite=True)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Upload failed: {exc}") from exc

    return f"https://{ACCOUNT_NAME}.blob.core.windows.net/{CONTAINER_NAME}/{blob_name}"
