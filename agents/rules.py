"""Portable worker rules shared by FastAPI/Pydantic and the browser Python runtime.

The numeric limits are demonstration settings, not validated clinical thresholds.
This module deliberately depends only on the Python standard library.
"""

PRIMARY_THRESHOLD = 25.0
SECONDARY_THRESHOLD = 12.0
DISCORDANCE_MARKERS = ("DISCORDANT", "ANOMALY", "MUTANT", "VIOLATION", "FAIL", "REJECT")


def evaluate_worker_rules(primary_metric, secondary_metric, status_descriptor, is_critical_flag):
    """Return the same structured findings used by the three enterprise workers."""
    findings = []
    if primary_metric > PRIMARY_THRESHOLD:
        findings.append({
            "origin_worker": "InvariantQCWorker",
            "urgency": "ELEVATED_RISK",
            "summary": "Primary Metric Threshold Exceeded",
            "technical_details": (
                f"Primary measurement ({primary_metric:.2f}) exceeds upper reference limit "
                f"(25.00) under CAP / CLSI / ISO Standards."
            ),
            "actionable_remediation": "Initiate recalibration workflow and review secondary parameters.",
        })
    if is_critical_flag or secondary_metric > SECONDARY_THRESHOLD:
        findings.append({
            "origin_worker": "SafetyEscalationWorker",
            "urgency": "CRITICAL_STAT_PANIC" if is_critical_flag else "ELEVATED_RISK",
            "summary": "Critical Safety Interlock Triggered",
            "technical_details": f"CriticalFlag={is_critical_flag} with secondary index {secondary_metric:.2f}.",
            "actionable_remediation": "Execute immediate closed-loop escalation and notify attending supervisor.",
        })
    if any(marker in str(status_descriptor).upper() for marker in DISCORDANCE_MARKERS):
        findings.append({
            "origin_worker": "ProtocolConformanceWorker",
            "urgency": "ELEVATED_RISK",
            "summary": "Protocol Conformance Discordance Detected",
            "technical_details": (
                f"Descriptor '{status_descriptor}' indicates discordance with "
                "CAP / CLSI / ISO Standards standards."
            ),
            "actionable_remediation": "Re-evaluate input specimen or rerun secondary confirmation assay.",
        })
    return findings
