"""Parity, CSV and validation checks for the real browser Python adapter."""
import importlib.util
import json
from pathlib import Path

import pytest

from agents.models import SystemTaskPayload
from agents.supervisor import SystemSupervisor
from agents.rules import evaluate_worker_rules

SPEC = importlib.util.spec_from_file_location(
    "browser_engine", Path(__file__).resolve().parents[1] / "web" / "browser_engine.py"
)
browser = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(browser)


def example(**changes):
    return {
        "task_id": "SYN-001", "target_identifier": "SPECIMEN-001",
        "primary_metric": 28.5, "secondary_metric": 14.2,
        "status_descriptor": "DISCORDANT", "is_critical_flag": True,
        **changes,
    }


@pytest.mark.parametrize("case", [
    example(), example(primary_metric=25, secondary_metric=12, status_descriptor="NOMINAL", is_critical_flag=False),
    example(primary_metric=25.1, secondary_metric=12.1, status_descriptor="ANOMALY", is_critical_flag=False),
    example(primary_metric=-10, secondary_metric=0, status_descriptor="NOMINAL", is_critical_flag=True),
])
def test_enterprise_browser_results_match_actual_backend(case):
    server_result = SystemSupervisor().process_task(SystemTaskPayload(**case)).to_dict()
    browser_result = browser.evaluate_case("enterprise", case)
    for name in ("overall_urgency", "integrity_status", "total_alerts", "critical_alerts_count"):
        assert browser_result[name] == server_result[name]
    assert [
        (a["origin_worker"], a["urgency"], a["technical_details"]) for a in browser_result["alerts"]
    ] == [
        (a["origin_worker"], a["urgency"], a["technical_details"]) for a in server_result["alerts"]
    ]
    assert browser_result["audit_hash"] is None


def test_original_clinical_and_standalone_engines_run_directly():
    clinical = browser.evaluate_case("clinical", example(
        primary_metric=24, secondary_metric=11, status_descriptor="EQUIVOCAL", is_critical_flag=False))
    assert clinical["total_alerts"] == 3
    assert clinical["overall_status"] == "DISCORDANCE_DETECTED"

    standalone = browser.evaluate_case("standalone", example(
        primary_metric=24, secondary_metric=13, status_descriptor="SUSPICIOUS", is_critical_flag=False))
    assert standalone["total_alerts"] == 3
    assert standalone["overall_status"] == "CRITICAL_ACTION_REQUIRED"


def test_browser_batch_matches_backend_and_exports_csv():
    csv_text = (
        "task_id,target_identifier,primary_metric,secondary_metric,status_descriptor,is_critical_flag\n"
        "SYN-001,SPECIMEN-001,28.5,14.2,DISCORDANT,true\n"
        "SYN-002,SPECIMEN-002,12,4,NOMINAL,false\n"
    )
    result = browser.evaluate_batch("enterprise", csv_text)
    assert result["processed"] == 2 and result["errors"] == []
    assert "result_json" in result["export_csv"]
    assert result["results"][0]["total_alerts"] == 3
    assert result["results"][1]["total_alerts"] == 0


def test_clinical_sample_schema_and_invalid_row():
    csv_text = (
        "case_id,patient_synthetic_id,metric_primary,metric_secondary,is_stat,status_flag\n"
        "SYN-001,SYNTH-001,25,11,true,DISCORDANT\n"
        "SYN-002,SYNTH-002,not-number,0,false,NORMAL\n"
    )
    result = browser.evaluate_batch("clinical", csv_text)
    assert result["processed"] == 1
    assert len(result["errors"]) == 1
    assert result["errors"][0]["row"] == 3


def test_rejects_bad_inputs_and_direct_identifier():
    with pytest.raises(ValueError, match="finite"):
        browser.evaluate_case("enterprise", example(primary_metric=float("nan")))
    with pytest.raises(ValueError, match="Potential direct identifier"):
        browser.evaluate_case("enterprise", example(target_identifier="person@example.com"))
    with pytest.raises(ValueError, match="Missing required"):
        browser.evaluate_batch("enterprise", "case_id,metric_primary\nSYN-01,1\n")
    with pytest.raises(ValueError, match="row limit"):
        browser.evaluate_batch("enterprise",
            "task_id,target_identifier,primary_metric\n"
            + "SYN-01,SPECIMEN-01,1\n" * 2001)


def test_json_bridge_end_to_end():
    data = json.loads(browser.run_json(json.dumps({
        "action": "evaluate", "mode": "enterprise", "payload": example()
    })))
    assert data["total_alerts"] == 3
