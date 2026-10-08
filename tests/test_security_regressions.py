"""Regression checks for audit signing and API exposure."""
import pytest
from fastapi.testclient import TestClient

from agents.api import app
from agents.base import AuditTrail, SecurityException
from agents.models import SystemTaskPayload
from agents.supervisor import SystemSupervisor


def test_audit_hmac_detects_metadata_tampering():
    audit = AuditTrail(secret_key="test-only-key")
    entry = audit.log("worker", "test", "DONE", {"status": "ok"})
    assert audit.verify_integrity()
    entry["event_type"] = "FORGED"
    assert audit.verify_integrity(), "Returned entries must not mutate the log"
    snapshot = audit.get_trail()
    snapshot[0]["event_type"] = "FORGED"
    assert audit.verify_integrity(), "Returned snapshots must be independent"
    audit.logs[0]["event_type"] = "FORGED"
    assert not audit.verify_integrity(), "Modified signed metadata must invalidate HMAC"


def test_audit_hmac_detects_hash_replacement():
    audit = AuditTrail(secret_key="test-only-key")
    audit.log("worker", "test", "ONE", {"status": "ok"})
    audit.log("worker", "test", "TWO", {"status": "ok"})
    audit.logs[0]["current_hash"] = "0" * 64
    audit.logs[1]["prev_hash"] = "0" * 64
    assert not audit.verify_integrity(), "A forged consistent chain must fail HMAC check"


def test_nested_identifier_rejected_before_audit():
    supervisor = SystemSupervisor()
    with pytest.raises(SecurityException):
        supervisor.process_task(SystemTaskPayload(
            task_id="SYN-01", target_identifier="SPECIMEN-01", primary_metric=1,
            attributes={"nested": {"contact": "person@example.com"}}
        ))


def test_api_serves_console_and_works_on_synthetic_data():
    client = TestClient(app)
    assert client.get("/").status_code == 200
    assert client.get("/app.js").status_code == 200
    response = client.post("/api/audit", json={
        "task_id": "SYN-01",
        "target_identifier": "SPECIMEN-01",
        "primary_metric": 26.0,
        "secondary_metric": 13.0,
        "status_descriptor": "NOMINAL",
        "is_critical_flag": False
    })
    assert response.status_code == 200
    assert response.json()["total_alerts"] == 2


def test_api_rejects_nested_identifiers():
    client = TestClient(app)
    response = client.post("/api/audit", json={
        "task_id": "SYN-01", "target_identifier": "SPECIMEN-01",
        "primary_metric": 1, "attributes": {"contact": "person@example.com"}
    })
    assert response.status_code == 422


def test_audit_logs_require_explicit_key(monkeypatch):
    client = TestClient(app)
    monkeypatch.delenv("AUDIT_LOG_API_KEY", raising=False)
    assert client.get("/api/audit/logs").status_code == 404
    monkeypatch.setenv("AUDIT_LOG_API_KEY", "unit-test-local-key")
    assert client.get("/api/audit/logs").status_code == 403
    assert client.get("/api/audit/logs", headers={"x-audit-key": "incorrect"}).status_code == 403
    res = client.get("/api/audit/logs", headers={"x-audit-key": "unit-test-local-key"})
    assert res.status_code == 200
    assert res.json()["verified"] is True
