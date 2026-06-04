import os
import uuid
from datetime import datetime, timezone

import boto3
from azure.storage.blob import BlobServiceClient
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import HTTPException, UploadFile

# ── Azure config ──────────────────────────────────────────────────────────────
AZURE_ACCOUNT_NAME = os.getenv("AZURE_STORAGE_ACCOUNT_NAME")
AZURE_ACCOUNT_KEY = os.getenv("AZURE_STORAGE_ACCOUNT_KEY")
AZURE_CONTAINER_NAME = os.getenv("AZURE_STORAGE_CONTAINER_NAME")

# ── AWS S3 config ─────────────────────────────────────────────────────────────
AWS_ACCESS_KEY = os.getenv("AWS_S3_ACCESS_KEY")
AWS_SECRET_KEY = os.getenv("AWS_S3_SECRET_KEY")
AWS_REGION = os.getenv("AWS_REGION")
AWS_BUCKET = os.getenv("AWS_BUCKET_NAME")


# ── Azure (kept for reference) ────────────────────────────────────────────────

def _azure_client() -> BlobServiceClient:
    connection_string = (
        f"DefaultEndpointsProtocol=https;"
        f"AccountName={AZURE_ACCOUNT_NAME};"
        f"AccountKey={AZURE_ACCOUNT_KEY};"
        f"EndpointSuffix=core.windows.net"
    )
    return BlobServiceClient.from_connection_string(connection_string)


def upload_bytes_azure(data: bytes, filename: str) -> str:
    """Upload raw bytes to Azure Blob Storage."""
    if not AZURE_ACCOUNT_NAME or not AZURE_ACCOUNT_KEY or not AZURE_CONTAINER_NAME:
        raise HTTPException(status_code=500, detail="Azure Blob Storage is not configured")

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    unique_name = f"{timestamp}_{uuid.uuid4().hex[:8]}_{filename}"
    blob_name = f"exports/{unique_name}"

    try:
        client = _azure_client()
        blob_client = client.get_blob_client(container=AZURE_CONTAINER_NAME, blob=blob_name)
        blob_client.upload_blob(data, overwrite=True)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Azure upload failed: {exc}") from exc

    return f"https://{AZURE_ACCOUNT_NAME}.blob.core.windows.net/{AZURE_CONTAINER_NAME}/{blob_name}"


def upload_file_azure(file: UploadFile) -> str:
    """Upload a file to Azure Blob Storage."""
    if not AZURE_ACCOUNT_NAME or not AZURE_ACCOUNT_KEY or not AZURE_CONTAINER_NAME:
        raise HTTPException(status_code=500, detail="Azure Blob Storage is not configured")

    ext = file.filename.rsplit(".", 1)[-1] if "." in file.filename else ""
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    unique_name = f"{timestamp}_{uuid.uuid4().hex[:8]}.{ext}" if ext else f"{timestamp}_{uuid.uuid4().hex[:8]}"
    blob_name = f"uploads/{unique_name}"

    try:
        client = _azure_client()
        blob_client = client.get_blob_client(container=AZURE_CONTAINER_NAME, blob=blob_name)
        blob_client.upload_blob(file.file, overwrite=True)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Azure upload failed: {exc}") from exc

    return f"https://{AZURE_ACCOUNT_NAME}.blob.core.windows.net/{AZURE_CONTAINER_NAME}/{blob_name}"


# ── AWS S3 ────────────────────────────────────────────────────────────────────

def _s3_client():
    return boto3.client(
        "s3",
        aws_access_key_id=AWS_ACCESS_KEY,
        aws_secret_access_key=AWS_SECRET_KEY,
        region_name=AWS_REGION,
    )


def upload_bytes_s3(data: bytes, filename: str) -> str:
    """Upload raw bytes to AWS S3."""
    if not AWS_ACCESS_KEY or not AWS_SECRET_KEY or not AWS_BUCKET:
        raise HTTPException(status_code=500, detail="AWS S3 is not configured")

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    unique_name = f"{timestamp}_{uuid.uuid4().hex[:8]}_{filename}"
    key = f"exports/{unique_name}"

    try:
        _s3_client().put_object(Bucket=AWS_BUCKET, Key=key, Body=data)
    except (BotoCoreError, ClientError) as exc:
        raise HTTPException(status_code=500, detail=f"S3 upload failed: {exc}") from exc

    return f"https://{AWS_BUCKET}.s3.{AWS_REGION}.amazonaws.com/{key}"


def upload_file_s3(file: UploadFile) -> str:
    """Upload a file to AWS S3 and return a publicly accessible URL.

    Tries public-read ACL first (works when bucket ACLs are enabled).
    Falls back to a presigned URL (7-day expiry) when the bucket uses
    'Bucket owner enforced' ownership and ACLs are disabled.
    """
    if not AWS_ACCESS_KEY or not AWS_SECRET_KEY or not AWS_BUCKET:
        raise HTTPException(status_code=500, detail="AWS S3 is not configured")

    ext = file.filename.rsplit(".", 1)[-1] if "." in file.filename else ""
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    unique_name = f"{timestamp}_{uuid.uuid4().hex[:8]}.{ext}" if ext else f"{timestamp}_{uuid.uuid4().hex[:8]}"
    key = f"uploads/{unique_name}"
    content_type = file.content_type or "application/octet-stream"

    # Read into memory so we can retry without re-reading the stream
    content = file.file.read()
    client = _s3_client()

    # ── Attempt 1: public-read ACL ────────────────────────────────────────────
    try:
        client.put_object(
            Bucket=AWS_BUCKET,
            Key=key,
            Body=content,
            ContentType=content_type,
            ACL="public-read",
        )
        return f"https://{AWS_BUCKET}.s3.{AWS_REGION}.amazonaws.com/{key}"
    except (BotoCoreError, ClientError):
        pass  # ACLs likely disabled on this bucket — fall through

    # ── Attempt 2: upload without ACL, return presigned URL (7 days) ─────────
    try:
        client.put_object(
            Bucket=AWS_BUCKET,
            Key=key,
            Body=content,
            ContentType=content_type,
        )
        return client.generate_presigned_url(
            "get_object",
            Params={"Bucket": AWS_BUCKET, "Key": key},
            ExpiresIn=604800,  # 7 days — max for IAM user credentials
        )
    except (BotoCoreError, ClientError) as exc:
        raise HTTPException(status_code=500, detail=f"S3 upload failed: {exc}") from exc


# ── Active provider — AWS S3 ──────────────────────────────────────────────────
# All callers use upload_bytes / upload_file.
# To switch back to Azure, point these at upload_bytes_azure / upload_file_azure.

def upload_bytes(data: bytes, filename: str) -> str:
    return upload_bytes_s3(data, filename)


def upload_file(file: UploadFile) -> str:
    return upload_file_s3(file)
