import os
import time
import mimetypes
import boto3
from botocore.exceptions import ClientError

_client = None

def _s3():
    global _client
    if _client is None:
        _client = boto3.client(
            "s3",
            aws_access_key_id=os.getenv("AWS_S3_ACCESS_KEY"),
            aws_secret_access_key=os.getenv("AWS_S3_SECRET_KEY"),
            region_name=os.getenv("AWS_REGION", "us-east-1"),
        )
    return _client


def _bucket() -> str:
    return os.getenv("AWS_BUCKET_NAME", "")


# 7-day presigned URL expiry — long enough that a user opening a page sees working links
PRESIGN_EXPIRY = 7 * 24 * 3600


def upload_file(data: bytes, folder: str, filename: str, content_type: str) -> str:
    """Upload bytes to S3. Returns the S3 key."""
    ts = int(time.time())
    safe = filename.replace(" ", "_").replace("/", "_")
    key = f"{folder}/{ts}_{safe}"
    _s3().put_object(
        Bucket=_bucket(),
        Key=key,
        Body=data,
        ContentType=content_type,
        ContentDisposition="inline",  # browser opens inline, not download-prompt
    )
    return key


def get_presigned_url(key: str) -> str:
    """Return a presigned GET URL that opens the file inline in the browser."""
    ct, _ = mimetypes.guess_type(key)
    params: dict = {
        "Bucket": _bucket(),
        "Key": key,
        "ResponseContentDisposition": "inline",
    }
    if ct:
        params["ResponseContentType"] = ct
    return _s3().generate_presigned_url("get_object", Params=params, ExpiresIn=PRESIGN_EXPIRY)


def to_viewable_url(value: str | None) -> str | None:
    """
    Convert a stored DB value to a URL suitable for the browser.
    - None / empty → None
    - Legacy base64 data URL (starts with 'data:') → returned unchanged
    - S3 key (anything else) → generates a fresh presigned URL
    """
    if not value:
        return None
    if value.startswith("data:") or "://" in value:
        return value
    try:
        return get_presigned_url(value)
    except ClientError:
        return None
