import math
import pytest
from panic_alert_agent import PanicThresholdDetectorAgent, DeltaCheckCorrelatorAgent, EscalationTimerAgent, CriticalAlertCoordinator, main, _safe_float, Severity


def test_sub_agents():
    a1 = PanicThresholdDetectorAgent()
    alerts1 = a1.evaluate({"metric_primary": 35.0})
    assert len(alerts1) == 1

    a2 = DeltaCheckCorrelatorAgent()
    alerts2 = a2.evaluate({"critical_flag": True})
    assert len(alerts2) == 1

    a3 = EscalationTimerAgent()
    alerts3 = a3.evaluate({"status_text": "DISCORDANT_FINDING"})
    assert len(alerts3) == 1


def test_coordinator():
    coord = CriticalAlertCoordinator()
    dossier = coord.audit_case({"case_id": "TEST-100", "metric_primary": 10.0, "metric_secondary": 2.0})
    assert dossier["overall_status"] == "CONCORDANT_NORMAL"
    assert dossier["total_alerts"] == 0

    ans = coord.query_assistant("What are the guidelines?")
    assert "guidelines" in ans or "standards" in ans


def test_cli():
    assert main(["audit", "--case-id", "CLI-01"]) == 0
    assert main(["chat", "What", "is", "the", "system", "status?"]) == 0


def test_domain_registry():
    from panic_alert_agent import DomainKnowledgeRegistry
    assert DomainKnowledgeRegistry.ZERO_PHI_COMPLIANCE is True
    assert "PRO" in DomainKnowledgeRegistry.SYSTEM_VERSION


def test_safe_float_with_nan():
    """Test that _safe_float handles NaN gracefully."""
    assert _safe_float(float("nan"), 5.0) == 5.0


def test_safe_float_with_infinity():
    """Test that _safe_float handles Infinity gracefully."""
    assert _safe_float(float("inf"), 5.0) == 5.0
    assert _safe_float(float("-inf"), 5.0) == 5.0


def test_safe_float_with_invalid_input():
    """Test that _safe_float handles invalid input gracefully."""
    assert _safe_float("not_a_number", 5.0) == 5.0
    assert _safe_float(None, 5.0) == 5.0


def test_safe_float_with_valid_input():
    """Test that _safe_float correctly converts valid input."""
    assert _safe_float("3.14", 5.0) == 3.14
    assert _safe_float(42, 5.0) == 42.0


def test_severity_enum_values():
    """Test that Severity enum has correct values."""
    assert Severity.INFO.value == "INFO"
    assert Severity.ADVISORY.value == "ADVISORY"
    assert Severity.WARNING.value == "WARNING"
    assert Severity.CRITICAL.value == "CRITICAL_ACTION_REQUIRED"


def test_sub_agents_with_nan_metrics():
    """Test that sub-agents handle NaN metrics gracefully."""
    a1 = PanicThresholdDetectorAgent()
    alerts1 = a1.evaluate({"metric_primary": float("nan")})
    # NaN should be converted to default (15.0), which is below threshold (20.0)
    assert len(alerts1) == 0

    a2 = DeltaCheckCorrelatorAgent()
    alerts2 = a2.evaluate({"metric_secondary": float("nan"), "critical_flag": False})
    # NaN should be converted to default (5.0), which is below threshold (12.0)
    assert len(alerts2) == 0
