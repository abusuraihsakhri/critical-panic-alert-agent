"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {parseMetric, validateCase, browserMode, SAMPLE_ROWS} = require("./app.js");

const caseData = () => ({
    task_id: "SYN-01",
    target_identifier: "SPECIMEN-01",
    primary_metric: 25,
    secondary_metric: 12,
    status_descriptor: "NOMINAL",
    is_critical_flag: false
});

test("validates browser single-case inputs", () => {
    assert.doesNotThrow(() => validateCase(caseData()));
    assert.throws(() => validateCase({...caseData(), primary_metric: NaN}), /finite/);
    assert.throws(() => validateCase({...caseData(), task_id: ""}), /nonempty/);
    assert.throws(() => validateCase({...caseData(), status_descriptor: "X".repeat(65)}), /at most/);
    assert.throws(() => validateCase({...caseData(), is_critical_flag: "false"}), /boolean/);
});

test("rejects empty and malformed numeric inputs", () => {
    assert.equal(parseMetric("2.5", "Primary metric"), 2.5);
    assert.throws(() => parseMetric("", "Primary metric"), /required/);
    assert.throws(() => parseMetric("Infinity", "Primary metric"), /finite/);
});

test("recognizes GitHub Pages without guessing in local mode", () => {
    assert.equal(browserMode({hostname: "account.github.io", protocol: "https:"}), true);
    assert.equal(browserMode({hostname: "localhost", protocol: "http:"}), false);
    assert.equal(browserMode({hostname: "", protocol: "file:"}), true);
});

test("provides distinct example CSV schemas", () => {
    assert.match(SAMPLE_ROWS.enterprise, /^task_id,target_identifier,primary_metric/);
    assert.match(SAMPLE_ROWS.clinical, /^case_id,patient_synthetic_id,metric_primary/);
    assert.match(SAMPLE_ROWS.standalone, /^case_id,metric_primary/);
});
