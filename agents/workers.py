"""Specialized enterprise workers; rule definitions live in agents.rules."""

import uuid
from typing import List

from .models import SystemTaskPayload, AgentAlert
from .rules import evaluate_worker_rules


class _WorkerBase:
    worker_name = ""
    prefix = ""

    @classmethod
    def evaluate(cls, payload: SystemTaskPayload) -> List[AgentAlert]:
        findings = evaluate_worker_rules(
            payload.primary_metric, payload.secondary_metric,
            payload.status_descriptor, payload.is_critical_flag,
        )
        return [
            AgentAlert(alert_id=f"{cls.prefix}-{uuid.uuid4().hex[:6]}", **finding)
            for finding in findings if finding["origin_worker"] == cls.worker_name
        ]


class InvariantQCWorker(_WorkerBase):
    worker_name = "InvariantQCWorker"
    prefix = "QC"


class SafetyEscalationWorker(_WorkerBase):
    worker_name = "SafetyEscalationWorker"
    prefix = "SAFE"


class ProtocolConformanceWorker(_WorkerBase):
    worker_name = "ProtocolConformanceWorker"
    prefix = "CONF"
