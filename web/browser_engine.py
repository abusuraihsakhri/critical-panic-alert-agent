"""Browser adapter executing repository Python rules in Pyodide (no server required).

Imports enterprise portable rules and the original clinical and standalone agents.
No external patient data, real notification, or durable audit record is created.
"""
import csv
import io
import json
import math
import uuid
from datetime import datetime, timezone

from agents.base import PHIGuard, SecurityException
from agents.rules import evaluate_worker_rules
from critical_panic_alert_agent.models import ClinicalCasePayload
from critical_panic_alert_agent.agents import CriticalAlertCoordinator as ClinicalCoordinator
from panic_alert_agent import CriticalAlertCoordinator as StandaloneCoordinator

CLINICAL = ClinicalCoordinator()
STANDALONE = StandaloneCoordinator()
MODES = ("enterprise", "clinical", "standalone")
MAX_CSV_ROWS = 2000
MAX_TEXT_LENGTH = 2_000_000


def _safe_text(value, name, max_length=128):
    if not isinstance(value, str):
        raise ValueError(f"{name} must be text")
    result = value.strip()
    if not result or len(result) > max_length or any(ord(ch) < 32 for ch in result):
        raise ValueError(f"{name} must be nonempty, under {max_length} characters and contain no controls")
    return result


def _metric(value, name):
    if isinstance(value, bool):
        raise ValueError(f"{name} must be a number")
    try:
        n = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{name} must be a number") from exc
    if not math.isfinite(n):
        raise ValueError(f"{name} must be finite")
    return n


def _flag(value):
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        if value.strip().lower() in ("true", "1", "yes"):
            return True
        if value.strip().lower() in ("false", "0", "no", ""):
            return False
    raise ValueError("Critical/STAT flag must be true/false, 1/0 or yes/no")


def _validate(data):
    if not isinstance(data, dict):
        raise ValueError("Case must be a JSON object")
    clean = {
        "task_id": _safe_text(data.get("task_id"), "Task ID"),
        "target_identifier": _safe_text(data.get("target_identifier"), "Synthetic target ID"),
        "primary_metric": _metric(data.get("primary_metric"), "Primary metric"),
        "secondary_metric": _metric(data.get("secondary_metric", 0), "Secondary metric"),
        "status_descriptor": _safe_text(data.get("status_descriptor", "NOMINAL"), "Status", 64),
        "is_critical_flag": _flag(data.get("is_critical_flag", False)),
    }
    # Existing regex-based screen; this is NOT proof of clinical de-identification.
    try:
        PHIGuard.assert_no_phi(json.dumps(clean, ensure_ascii=False, allow_nan=False))
    except SecurityException as exc:
        raise ValueError("Potential direct identifier detected; use synthetic data only") from exc
    return clean


def evaluate_case(mode, case):
    if mode not in MODES:
        raise ValueError("Unknown evaluation mode")
    p = _validate(case)
    if mode == "enterprise":
        alerts = []
        for finding in evaluate_worker_rules(
            p["primary_metric"], p["secondary_metric"],
            p["status_descriptor"], p["is_critical_flag"],
        ):
            prefix = {"InvariantQCWorker": "QC", "SafetyEscalationWorker": "SAFE",
                      "ProtocolConformanceWorker": "CONF"}[finding["origin_worker"]]
            alerts.append({
                "alert_id": f"{prefix}-{uuid.uuid4().hex[:6]}",
                **finding,
                "standard_reference": "CAP / CLSI / ISO Standards",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
        crit = sum(a["urgency"] == "CRITICAL_STAT_PANIC" for a in alerts)
        elev = sum(a["urgency"] == "ELEVATED_RISK" for a in alerts)
        urgency = "CRITICAL_STAT_PANIC" if crit else ("ELEVATED_RISK" if elev else "ROUTINE")
        integrity = "RECALIBRATION_REQUIRED" if crit else ("DISCORDANT_ANOMALY" if elev else "VALIDATED_OPTIMAL")
        return {
            "dossier_id": f"DOSSIER-{uuid.uuid4().hex[:8].upper()}",
            "system_slug": "critical-panic-alert-agent",
            "domain": "Clinical & Biomedical AI",
            "task_id": p["task_id"], "target_identifier": p["target_identifier"],
            "overall_urgency": urgency, "integrity_status": integrity,
            "total_alerts": len(alerts), "critical_alerts_count": crit,
            "alerts": alerts, "standard_reference": "CAP / CLSI / ISO Standards",
            "consensus_summary": f"Multi-agent consensus completed with status [{urgency}]. Total alerts: {len(alerts)}.",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "audit_hash": None,
            "runtime": "Python (Pyodide; enterprise rule module)",
        }

    if mode == "clinical":
        payload = ClinicalCasePayload(
            case_id=p["task_id"], patient_synthetic_id=p["target_identifier"],
            primary_metric=p["primary_metric"], secondary_metric=p["secondary_metric"],
            status_flag=p["status_descriptor"], is_stat=p["is_critical_flag"],
        )
        result = CLINICAL.process_case(payload)
        result["runtime"] = "Python (Pyodide; clinical package)"
        return result

    result = STANDALONE.audit_case({
        "case_id": p["task_id"],
        "metric_primary": p["primary_metric"],
        "metric_secondary": p["secondary_metric"],
        "critical_flag": p["is_critical_flag"],
        "status_text": p["status_descriptor"],
    })
    result["runtime"] = "Python (Pyodide; standalone package)"
    return result


def _row_case(mode, row):
    if mode == "enterprise":
        return {
            "task_id": row.get("task_id", ""),
            "target_identifier": row.get("target_identifier", ""),
            "primary_metric": row.get("primary_metric", ""),
            "secondary_metric": row.get("secondary_metric", 0) or 0,
            "status_descriptor": row.get("status_descriptor", "NOMINAL") or "NOMINAL",
            "is_critical_flag": row.get("is_critical_flag", "") or "",
        }
    return {
        "task_id": row.get("case_id", ""),
        "target_identifier": row.get("patient_synthetic_id", "SYNTHETIC-SPECIMEN") or "SYNTHETIC-SPECIMEN",
        "primary_metric": row.get("metric_primary", row.get("primary_metric", "")),
        "secondary_metric": row.get("metric_secondary", row.get("secondary_metric", 0)) or 0,
        "status_descriptor": row.get("status_flag", row.get("status_text", "NORMAL")) or "NORMAL",
        "is_critical_flag": row.get("is_stat", row.get("critical_flag", "")) or "",
    }


def _safe_csv_cell(cell):
    text = str(cell) if cell is not None else ""
    if text.lstrip().startswith(("=", "+", "-", "@")) or text.startswith(("\t", "\r", "\n")):
        return "'" + text
    return text


def evaluate_batch(mode, csv_text):
    if mode not in MODES:
        raise ValueError("Unknown evaluation mode")
    if not isinstance(csv_text, str) or not csv_text or len(csv_text) > MAX_TEXT_LENGTH:
        raise ValueError("CSV must be nonempty and no larger than 2 MB")
    reader = csv.DictReader(io.StringIO(csv_text.lstrip("\ufeff"), newline=""), strict=True)
    if not reader.fieldnames:
        raise ValueError("CSV header row is missing")
    if len(reader.fieldnames) > 100 or len(set(reader.fieldnames)) != len(reader.fieldnames):
        raise ValueError("CSV has duplicate or excessive columns")
    required = ("task_id", "target_identifier", "primary_metric") if mode == "enterprise" else ("case_id", "metric_primary")
    # Clinical and standalone CSV can also use primary_metric as in their APIs.
    if mode != "enterprise":
        required = ("case_id",)
        if not any(k in reader.fieldnames for k in ("metric_primary", "primary_metric")):
            raise ValueError("Missing required CSV column: metric_primary")
    for name in required:
        if name not in reader.fieldnames:
            raise ValueError(f"Missing required CSV column: {name}")
    export_fields = list(dict.fromkeys(reader.fieldnames + [
        "overall_status", "total_alerts", "critical_alerts", "result_json",
    ]))
    buf = io.StringIO(newline="")
    writer = csv.DictWriter(buf, fieldnames=export_fields, extrasaction="ignore")
    writer.writeheader()
    outcomes, errors = [], []
    for line_number, row in enumerate(reader, start=2):
        if line_number > MAX_CSV_ROWS + 1:
            raise ValueError(f"CSV exceeds the {MAX_CSV_ROWS} row limit")
        try:
            if None in row:
                raise ValueError("Too many CSV columns")
            result = evaluate_case(mode, _row_case(mode, row))
            status = result.get("overall_urgency", result.get("overall_status", "UNKNOWN"))
            critical = result.get("critical_alerts_count", result.get("stat_critical_alerts", result.get("critical_count", 0)))
            export = dict(row)
            export.update(
                overall_status=status,
                total_alerts=result["total_alerts"],
                critical_alerts=critical,
                result_json=json.dumps(result, ensure_ascii=False, allow_nan=False),
            )
            writer.writerow({key: _safe_csv_cell(val) for key, val in export.items()})
            outcomes.append({
                "case_id": result.get("task_id", result.get("case_id")),
                "status": status,
                "total_alerts": result["total_alerts"],
            })
        except (ValueError, TypeError) as exc:
            errors.append({"row": line_number, "error": str(exc)})
    return {
        "mode": mode, "processed": len(outcomes), "errors": errors,
        "results": outcomes, "export_csv": buf.getvalue(),
        "runtime": "Python (Pyodide; csv.DictReader and repository rules)",
    }


def run_json(request_json):
    req = json.loads(request_json)
    if req.get("action") == "evaluate":
        result = evaluate_case(req.get("mode"), req.get("payload"))
    elif req.get("action") == "batch":
        result = evaluate_batch(req.get("mode"), req.get("csv_text"))
    else:
        raise ValueError("Unsupported action")
    return json.dumps(result, ensure_ascii=False, allow_nan=False)
