"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluateDemo, validatePayload } = require("./app.js");

function sample(changes = {}) {
    return {
        task_id: "SYN-01", target_identifier: "SPECIMEN-01",
        primary_metric: 25, secondary_metric: 12,
        status_descriptor: "NOMINAL", is_critical_flag: false,
        ...changes
    };
}

test("exact boundaries are routine", () => {
    const r = evaluateDemo(sample());
    assert.equal(r.overall_urgency, "ROUTINE");
    assert.equal(r.total_alerts, 0);
    assert.equal(r.audit_hash, null);
});
test("primary threshold is elevated", () => {
    const r = evaluateDemo(sample({primary_metric: 25.1}));
    assert.equal(r.total_alerts, 1);
    assert.equal(r.overall_urgency, "ELEVATED_RISK");
});
test("critical flag triggers critical status", () => {
    const r = evaluateDemo(sample({is_critical_flag: true}));
    assert.equal(r.overall_urgency, "CRITICAL_STAT_PANIC");
    assert.equal(r.critical_alerts_count, 1);
});
test("discordance and secondary threshold add independent alerts", () => {
    const r = evaluateDemo(sample({secondary_metric: 13, status_descriptor: "DISCORDANT"}));
    assert.equal(r.total_alerts, 2);
    assert.equal(r.critical_alerts_count, 0);
});
test("input validation rejects missing, nonfinite and oversized values", () => {
    assert.throws(() => validatePayload(sample({primary_metric: Infinity})), /finite/);
    assert.throws(() => validatePayload(sample({task_id: " "})), /nonempty/);
    assert.throws(() => validatePayload(sample({status_descriptor: "x".repeat(65)})), /character limit/);
});
