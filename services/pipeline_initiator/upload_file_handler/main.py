import os
import re
import uuid

from fastapi import HTTPException
from fastapi import UploadFile
from google.cloud import storage

_client: storage.Client | None = None
_SAFE_FILENAME = re.compile(r"[^A-Za-z0-9._-]")


def get_bucket() -> storage.Bucket:
    """
    Returns a lazily-initialised GCS bucket handle. Raises 503 if GCS_BUCKET is unset.
    """
    global _client
    bucket_name = os.getenv("GCS_BUCKET")
    if not bucket_name:
        raise HTTPException(503, {"error": "gcs_not_configured"})
    if _client is None:
        _client = storage.Client()
    return _client.bucket(bucket_name)


def sanitize(name: str) -> str:
    """
    Replaces unsafe characters in a filename and caps length.
    """
    return _SAFE_FILENAME.sub("_", name)[:200] or "file"


async def upload_stream(file: UploadFile, max_bytes: int, workflow_id: int) -> dict:
    """
    Streams an upload to gs://<bucket>/uploads/<workflow_id>/<uuid>/<filename>; returns {uri, filename}.
    """
    bucket = get_bucket()
    safe = sanitize(file.filename or "file")
    object_path = f"uploads/{workflow_id}/{uuid.uuid4()}/{safe}"
    blob = bucket.blob(object_path)

    written = 0
    chunk = await file.read(1024 * 1024)
    parts: list[bytes] = []
    while chunk:
        written += len(chunk)
        if written > max_bytes:
            raise HTTPException(413, {"error": "file_too_large", "max_bytes": max_bytes})
        parts.append(chunk)
        chunk = await file.read(1024 * 1024)
    blob.upload_from_string(b"".join(parts), content_type=file.content_type)
    return {"uri": f"gs://{bucket.name}/{object_path}", "filename": file.filename}
