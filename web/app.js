/* Synthetic-data browser demonstration of the server's three worker rules. */
(function (global) {
    "use strict";

    const LIMIT_PRIMARY = 25.0;
    const LIMIT_SECONDARY = 12.0;
    const DISCORDANCE_TERMS = ["DISCORDANT", "ANOMALY", "MUTANT", "VIOLATION", "FAIL", "REJECT"];

    function validatePayload(payload) {
        if (!payload || typeof payload !== "object") {
            throw new Error("A task payload is required.");
        }
        for (const key of ["task_id", "target_identifier", "status_descriptor"]) {
            if (typeof payload[key] !== "string" || !payload[key].trim() || payload[key].length > (key === "status_descriptor" ? 64 : 128)) {
                throw new Error(key + " must be nonempty and within the character limit.");
            }
        }
        for (const key of ["primary_metric", "secondary_metric"]) {
            if (typeof payload[key] !== "number" || !Number.isFinite(payload[key])) {
                throw new Error(key + " must be a finite number.");
            }
        }
        if (typeof payload.is_critical_flag !== "boolean") {
            throw new Error("The critical flag must be boolean.");
        }
    }

    function evaluateDemo(payload) {
        validatePayload(payload);
        const alerts = [];
        function add(worker, urgency, summary, details, remediation) {
            alerts.push({
                origin_worker: worker,
                urgency: urgency,
                summary: summary,
                technical_details: details,
                actionable_remediation: remediation
            });
        }
        if (payload.primary_metric > LIMIT_PRIMARY) {
            add("InvariantQCWorker", "ELEVATED_RISK", "Primary Metric Threshold Exceeded",
                "Primary measurement (" + payload.primary_metric.toFixed(2) + ") exceeds illustrative limit (25.00).",
                "Review the synthetic measurement and rule configuration.");
        }
        if (payload.is_critical_flag || payload.secondary_metric > LIMIT_SECONDARY) {
            add("SafetyEscalationWorker",
                payload.is_critical_flag ? "CRITICAL_STAT_PANIC" : "ELEVATED_RISK",
                "Critical Safety Interlock Triggered",
                "Critical flag: " + payload.is_critical_flag + "; secondary index: " + payload.secondary_metric.toFixed(2) + ".",
                "In a real deployment, use an independently validated escalation workflow.");
        }
        if (DISCORDANCE_TERMS.some(term => payload.status_descriptor.toUpperCase().includes(term))) {
            add("ProtocolConformanceWorker", "ELEVATED_RISK", "Protocol Conformance Discordance Detected",
                "Status descriptor indicates a simulated discordance.",
                "Review the synthetic specimen and status classification.");
        }
        const critical = alerts.filter(a => a.urgency === "CRITICAL_STAT_PANIC").length;
        const elevated = alerts.filter(a => a.urgency === "ELEVATED_RISK").length;
        const urgency = critical ? "CRITICAL_STAT_PANIC" : (elevated ? "ELEVATED_RISK" : "ROUTINE");
        return {
            mode: "LOCAL_BROWSER_DEMONSTRATION",
            task_id: payload.task_id,
            target_identifier: payload.target_identifier,
            overall_urgency: urgency,
            integrity_status: critical ? "RECALIBRATION_REQUIRED" : (elevated ? "DISCORDANT_ANOMALY" : "VALIDATED_OPTIMAL"),
            total_alerts: alerts.length,
            critical_alerts_count: critical,
            alerts: alerts,
            audit_hash: null,
            notice: "No server-side audit signature, callback, notification, or patient monitoring was performed."
        };
    }

    function isStaticDemo() {
        return global.location.protocol === "file:" || /\.github\.io$/i.test(global.location.hostname);
    }

    if (typeof document !== "undefined") {
        const byId = id => document.getElementById(id);
        let tasks = 0;
        let totalAlerts = 0;
        const mode = isStaticDemo() ? "Browser demo" : "API server";
        global.addEventListener("DOMContentLoaded", function () {
            byId("mode-badge").textContent = mode;
            byId("run-audit").addEventListener("click", async function () {
                const output = byId("outputConsole");
                const primaryInput = byId("primary_metric");
                const secondaryInput = byId("secondary_metric");
                const payload = {
                    task_id: byId("task_id").value.trim(),
                    target_identifier: byId("target_id").value.trim(),
                    primary_metric: primaryInput.value.trim() === "" ? NaN : Number(primaryInput.value),
                    secondary_metric: secondaryInput.value.trim() === "" ? NaN : Number(secondaryInput.value),
                    status_descriptor: byId("status_descriptor").value.trim(),
                    is_critical_flag: byId("is_critical").checked
                };
                const button = byId("run-audit");
                button.disabled = true;
                try {
                    validatePayload(payload);
                    let data;
                    if (isStaticDemo()) {
                        data = evaluateDemo(payload);
                    } else {
                        const response = await global.fetch("/api/audit", {
                            method: "POST",
                            headers: {"Content-Type": "application/json"},
                            body: JSON.stringify(payload)
                        });
                        if (!response.ok) {
                            throw new Error("API returned HTTP " + response.status + ". Check API and input configuration.");
                        }
                        data = await response.json();
                    }
                    tasks += 1;
                    totalAlerts += Number(data.total_alerts) || 0;
                    byId("m-tasks").textContent = String(tasks);
                    byId("m-audit").textContent = String(tasks);
                    byId("m-phi").textContent = String(totalAlerts);
                    byId("m-status").textContent = data.overall_urgency || "COMPLETE";
                    output.textContent = JSON.stringify(data, null, 2);
                } catch (error) {
                    byId("m-status").textContent = "ERROR";
                    output.textContent = "Evaluation failed: " + String(error.message || error) +
                        "\nNo fallback or fabricated result was generated.";
                } finally {
                    button.disabled = false;
                }
            });
        });
    }

    if (typeof module !== "undefined" && module.exports) {
        module.exports = { evaluateDemo, validatePayload };
    }
})(typeof window !== "undefined" ? window : globalThis);
