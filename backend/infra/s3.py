import mimetypes
import os
import time

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

# Canonical S3 layout for candidate resumes:
#   mrr_tracking/uploads/candidates/resumes/<candidate_id>/<filename>
# The DB stores only <filename>; the prefix is constructed in code.
RESUME_PREFIX = "mrr_tracking/uploads/candidates/resumes"
RESUME_PENDING = f"{RESUME_PREFIX}/_pending"


def _safe_filename(filename: str) -> str:
    return filename.replace(" ", "_").replace("/", "_")


def build_resume_key(candidate_id: int, filename: str) -> str:
    """Final S3 key for a candidate's resume."""
    return f"{RESUME_PREFIX}/{candidate_id}/{_safe_filename(filename)}"


def upload_resume_pending(
    data: bytes,
    filename: str,
    content_type: str,
) -> tuple[str, str]:
    """
    Upload a resume to the pending area before a candidate row exists.
    Returns (pending_key, filename) — the filename component is what the DB
    will eventually store; the pending_key tells the candidate create flow
    where to fetch the bytes from when finalizing.
    """
    ts = int(time.time())
    safe = _safe_filename(filename)
    pending_key = f"{RESUME_PENDING}/{ts}_{safe}"
    _s3().put_object(
        Bucket=_bucket(),
        Key=pending_key,
        Body=data,
        ContentType=content_type,
        ContentDisposition="inline",
    )
    return pending_key, safe


def finalize_resume(source_key: str, candidate_id: int) -> str:
    """
    Move (copy + delete) a resume from any source key (pending or legacy)
    to the canonical layout for this candidate. Returns the filename portion
    that should be stored in the DB.
    """
    filename = source_key.rsplit("/", 1)[-1]
    final_key = build_resume_key(candidate_id, filename)
    if source_key == final_key:
        return filename
    _s3().copy_object(
        Bucket=_bucket(),
        CopySource={"Bucket": _bucket(), "Key": source_key},
        Key=final_key,
        MetadataDirective="COPY",
        ContentDisposition="inline",
    )
    try:
        _s3().delete_object(Bucket=_bucket(), Key=source_key)
    except ClientError:
        # Non-fatal: pending objects clutter the bucket but don't break anything
        pass
    return filename


def copy_resume_to_canonical(source_key: str, candidate_id: int) -> str:
    """
    Copy-only variant of finalize_resume — leaves the source object in place.
    Used by the legacy backfill so existing files stay as a safety net.
    """
    filename = source_key.rsplit("/", 1)[-1]
    final_key = build_resume_key(candidate_id, filename)
    if source_key == final_key:
        return filename
    _s3().copy_object(
        Bucket=_bucket(),
        CopySource={"Bucket": _bucket(), "Key": source_key},
        Key=final_key,
        MetadataDirective="COPY",
        ContentDisposition="inline",
    )
    return filename


def upload_file(data: bytes, folder: str, filename: str, content_type: str) -> str:
    """
    Upload bytes to S3. Returns the S3 key.
    Resumes go to the pending area under the canonical prefix; everything else
    keeps the historical flat-folder layout.
    """
    safe = _safe_filename(filename)
    if folder == "resumes":
        pending_key, _ = upload_resume_pending(data, filename, content_type)
        return pending_key
    ts = int(time.time())
    key = f"{folder}/{ts}_{safe}"
    _s3().put_object(
        Bucket=_bucket(),
        Key=key,
        Body=data,
        ContentType=content_type,
        ContentDisposition="inline",
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
    return _s3().generate_presigned_url(
        "get_object",
        Params=params,
        ExpiresIn=PRESIGN_EXPIRY,
    )


def resolve_resume_key(value: str | None, candidate_id: int | None = None) -> str | None:
    """Resolve a stored resume DB value to its S3 object key.
    Mirrors to_viewable_url's key logic but returns the key (for server-side
    download) instead of a presigned URL. Returns None for data-URLs / http URLs.
    """
    if not value or value == "None":
        return None
    if value.startswith("data:") or "://" in value:
        return None
    if "/" not in value and candidate_id is not None:
        return build_resume_key(candidate_id, value)
    return value


def get_object_bytes(key: str) -> bytes:
    """Download an S3 object's raw bytes (server-side; no presigned URL)."""
    resp = _s3().get_object(Bucket=_bucket(), Key=key)
    return resp["Body"].read()


def to_viewable_url(value: str | None, candidate_id: int | None = None) -> str | None:
    """
    Convert a stored DB value to a URL suitable for the browser.
    - None / empty → None
    - Legacy base64 data URL (starts with 'data:') → returned unchanged
    - Already a full URL → returned unchanged
    - Filename only (no "/", candidate_id given) → built into canonical resume key
    - S3 key (contains "/") → used directly
    """
    if not value:
        return None
    if value == "None":  # historical bad data — treat as missing
        return None
    if value.startswith("data:") or "://" in value:
        return value
    key = value
    if "/" not in value and candidate_id is not None:
        key = build_resume_key(candidate_id, value)
    try:
        return get_presigned_url(key)
    except ClientError:
        return None
