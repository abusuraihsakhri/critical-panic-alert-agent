"""
FastAPI REST API Server for Critical Panic Alert Agent.
"""
import os
import hmac
from pathlib import Path
from typing import Dict, Any, List, Optional
from fastapi import FastAPI, HTTPException, Header
from fastapi.responses import FileResponse
from pydantic import BaseModel
from .base import AuditLogger, PHIGuard, SecurityException
from .models import SystemTaskPayload, ConsensusDossier
from .supervisor import SystemSupervisor

supervisor = SystemSupervisor(model_provider="mock")

app = FastAPI(
    title="Critical Panic Alert Agent API",
    description="Enterprise Distributed Component Platform (Clinical & Biomedical AI)",
    version="3.0.0-ENTERPRISE",
)


class ChatRequest(BaseModel):
    query: str


@app.get("/", include_in_schema=False)
def web_console():
    return FileResponse(Path(__file__).resolve().parent.parent / "web" / "index.html")


@app.get("/app.js", include_in_schema=False)
def web_javascript():
    return FileResponse(Path(__file__).resolve().parent.parent / "web" / "app.js")

@app.get("/python_worker.js", include_in_schema=False)
def web_python_worker():
    return FileResponse(Path(__file__).resolve().parent.parent / "web" / "python_worker.js")


# Explicit allowlist protects the code-serving endpoint against path traversal.
BROWSER_PYTHON_FILES = {
    "agents/__init__.py",
    "agents/base.py",
    "agents/rules.py",
    "critical_panic_alert_agent/__init__.py",
    "critical_panic_alert_agent/models.py",
    "critical_panic_alert_agent/engine.py",
    "critical_panic_alert_agent/agents.py",
    "panic_alert_agent.py",
    "browser_engine.py",
}


@app.get("/python/{source_path:path}", include_in_schema=False)
def browser_python_source(source_path: str):
    if source_path not in BROWSER_PYTHON_FILES:
        raise HTTPException(status_code=404, detail="Not found")
    root = Path(__file__).resolve().parent.parent
    file_path = root / ("web/browser_engine.py" if source_path == "browser_engine.py" else source_path)
    return FileResponse(file_path, media_type="text/plain")


@app.get("/health")
def health():
    return {"status": "HEALTHY", "service": "critical-panic-alert-agent", "domain": "Clinical & Biomedical AI", "standard": "CAP / CLSI / ISO Standards", "version": "3.0.0-ENTERPRISE"}


@app.get("/metrics")
def metrics():
    return {
        "dossiers_processed_total": len(supervisor.dossier_registry),
        "audit_blocks_total": len(AuditLogger.get_trail()),
        "system_status": "NOMINAL_OPTIMAL"
    }


@app.post("/api/audit")
def api_audit(payload: SystemTaskPayload):
    try:
        dossier = supervisor.process_task(payload)
    except SecurityException:
        raise HTTPException(status_code=422, detail="Input contains a prohibited identifier")
    return dossier.to_dict()


@app.post("/api/chat")
def api_chat(req: ChatRequest):
    try:
        ans = supervisor.query_supervisory_chat(req.query)
        return {"response": ans}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/audit/logs")
def api_audit_logs(x_audit_key: Optional[str] = Header(default=None)):
    """Disable audit metadata exposure unless an explicit access key is set."""
    expected_key = os.getenv("AUDIT_LOG_API_KEY")
    if not expected_key:
        raise HTTPException(status_code=404, detail="Not found")
    if not x_audit_key or not hmac.compare_digest(x_audit_key, expected_key):
        raise HTTPException(status_code=403, detail="Forbidden")
    return {"audit_trail": AuditLogger.get_trail(), "verified": AuditLogger.verify_integrity()}
