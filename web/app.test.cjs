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

const fs = require("node:fs");
const vm = require("node:vm");

function mountConsole(hostname, fetchImpl) {
    const elements = {};
    for (const id of ["mode-badge", "run-audit", "outputConsole", "task_id", "target_id",
        "primary_metric", "secondary_metric", "status_descriptor", "is_critical",
        "m-status", "m-tasks", "m-audit", "m-phi"]) {
        elements[id] = {value: "", textContent: "", checked: false};
    }
    elements.task_id.value = "SYN-01";
    elements.target_id.value = "SPECIMEN-01";
    elements.primary_metric.value = "26";
    elements.secondary_metric.value = "12";
    elements.status_descriptor.value = "NOMINAL";
    let click;
    elements["run-audit"].addEventListener = (_event, handler) => {click = handler;};
    const fakeWindow = {
        location: {protocol: "https:", hostname},
        addEventListener: (_event, handler) => handler(),
        fetch: fetchImpl
    };
    const context = {window: fakeWindow, document: {getElementById: id => elements[id]}};
    vm.runInNewContext(fs.readFileSync(require.resolve("./app.js"), "utf8"), context);
    return {elements, click: () => click()};
}

test("GitHub Pages UI uses local rules without calling the API", async () => {
    const page = mountConsole("example.github.io", () => {throw Error("should not fetch");});
    await page.click();
    assert.equal(page.elements["m-tasks"].textContent, "1");
    assert.equal(page.elements["m-audit"].textContent, "1");
    assert.equal(page.elements["m-phi"].textContent, "1");
    assert.match(page.elements.outputConsole.textContent, /LOCAL_BROWSER_DEMONSTRATION/);
});

test("API failure is reported without fabricated audit output", async () => {
    const page = mountConsole("localhost", async () => {throw Error("network unavailable");});
    await page.click();
    assert.equal(page.elements["m-tasks"].textContent, "");
    assert.match(page.elements.outputConsole.textContent, /No fallback or fabricated result/);
});
