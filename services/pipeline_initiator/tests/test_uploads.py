from io import BytesIO
from unittest.mock import MagicMock


def test_upload_too_large_returns_413(monkeypatch, client, initiator_module, seeded_workflow):
    """
    Uploading more than MAX_UPLOAD_BYTES returns 413 with max_bytes in the body.
    """
    monkeypatch.setenv("MAX_UPLOAD_BYTES", "1048576")
    monkeypatch.setenv("GCS_BUCKET", "fake-bucket")
    fake_bucket = MagicMock()
    fake_bucket.name = "fake-bucket"
    monkeypatch.setattr(
        initiator_module,
        "get_bucket",
        lambda: fake_bucket,
    )
    monkeypatch.setattr(
        "upload_file_handler.main.get_bucket",
        lambda: fake_bucket,
    )
    payload = b"x" * (2 * 1024 * 1024)
    res = client.post(
        "/uploads",
        data={
            "workflow_id": str(seeded_workflow["workflow_id"]),
            "parameter_name": "fastq_url",
        },
        files={"file": ("big.bin", BytesIO(payload), "application/octet-stream")},
    )
    assert res.status_code == 413
    detail = res.json()["detail"]
    assert detail["error"] == "file_too_large"
    assert detail["max_bytes"] == 1048576


def test_upload_to_non_file_parameter_returns_400(monkeypatch, client, initiator_module, seeded_workflow):
    """
    Uploading to a parameter whose type is not 'file' returns 400 wrong_parameter_type.
    """
    monkeypatch.setenv("GCS_BUCKET", "fake-bucket")
    monkeypatch.setattr(initiator_module, "get_bucket", lambda: MagicMock(name="fake-bucket"))
    res = client.post(
        "/uploads",
        data={
            "workflow_id": str(seeded_workflow["workflow_id"]),
            "parameter_name": "reference_genome",
        },
        files={"file": ("ref.bin", BytesIO(b"zz"), "application/octet-stream")},
    )
    assert res.status_code == 400
    detail = res.json()["detail"]
    assert detail["error"] == "wrong_parameter_type"
    assert detail["type"] == "select"
