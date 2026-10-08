/* Browser application: real repository Python rules run in a Pyodide worker. */
(function (global) {
    "use strict";

    const MAX_UPLOAD_BYTES = 2_000_000;
    const SAMPLE_ROWS = {
        enterprise: [
            "task_id,target_identifier,primary_metric,secondary_metric,status_descriptor,is_critical_flag",
            "SYN-001,SPECIMEN-001,28.5,14.2,DISCORDANT,true",
            "SYN-002,SPECIMEN-002,12,4,NOMINAL,false",
            "SYN-003,SPECIMEN-003,26,8,NOMINAL,false"
        ].join("\n") + "\n",
        clinical: [
            "case_id,patient_synthetic_id,metric_primary,metric_secondary,is_stat,status_flag",
            "SYN-001,SYNTH-001,26,12,true,DISCORDANT",
            "SYN-002,SYNTH-002,12,4,false,NORMAL"
        ].join("\n") + "\n",
        standalone: [
            "case_id,metric_primary,metric_secondary,critical_flag,status_text",
            "SYN-001,26,13,true,DISCORDANT",
            "SYN-002,12,4,false,NORMAL"
        ].join("\n") + "\n"
    };

    function parseMetric(value, name) {
        if (typeof value !== "string" || !value.trim()) {
            throw new Error(name + " is required");
        }
        const result = Number(value);
        if (!Number.isFinite(result)) {
            throw new Error(name + " must be a finite number");
        }
        return result;
    }

    function validateCase(p) {
        if (!p || typeof p !== "object") {
            throw new Error("A case is required");
        }
        for (const key of ["task_id", "target_identifier", "status_descriptor"]) {
            const length = key === "status_descriptor" ? 64 : 128;
            if (typeof p[key] !== "string" || !p[key].trim() || p[key].length > length) {
                throw new Error(key + " must be nonempty and at most " + length + " characters");
            }
        }
        for (const key of ["primary_metric", "secondary_metric"]) {
            if (typeof p[key] !== "number" || !Number.isFinite(p[key])) {
                throw new Error(key + " must be a finite number");
            }
        }
        if (typeof p.is_critical_flag !== "boolean") {
            throw new Error("The critical flag must be boolean");
        }
    }

    function browserMode(location) {
        return /\.github\.io$/i.test(location.hostname) || location.protocol === "file:";
    }

    if (typeof document !== "undefined") {
        const byId = id => document.getElementById(id);
        let worker;
        let ready = false;
        let requestId = 0;
        let resolveInitialization;
        let rejectInitialization;
        const pending = new Map();
        let sessionCount = 0;
        let sessionAlerts = 0;
        let lastResult = null;
        let lastCsv = null;

        function notify(message, error = false) {
            const el = byId("runtime-status");
            el.textContent = message;
            el.classList.toggle("is-error", error);
        }

        function setBusy(busy) {
            for (const id of ["run-audit", "run-batch", "download-json", "download-csv"]) {
                byId(id).disabled = busy || (!ready && (id === "run-audit" || id === "run-batch")) ||
                    (id === "download-json" && !lastResult) || (id === "download-csv" && !lastCsv);
            }
        }

        function receiveMessage(event) {
            const message = event.data || {};
            if (message.type === "ready") {
                ready = true;
                resolveInitialization();
                notify("Python runtime ready — repository source loaded locally");
                byId("mode-badge").textContent = "Python · Pyodide";
                setBusy(false);
            } else if (message.type === "init-error") {
                rejectInitialization(new Error(message.error));
            } else if (message.type === "result" || message.type === "error") {
                const req = pending.get(message.id);
                if (!req) return;
                pending.delete(message.id);
                if (message.type === "error") {
                    req.reject(new Error(message.error));
                } else {
                    req.resolve(message.result);
                }
            }
        }

        function initializePython() {
            notify("Loading Python WebAssembly runtime and source files…");
            const initialization = new Promise((resolve, reject) => {
                resolveInitialization = resolve;
                rejectInitialization = reject;
            });
            worker = new Worker("./python_worker.js");
            worker.addEventListener("message", receiveMessage);
            worker.addEventListener("error", event => {
                const err = new Error("Python worker failed to load. Check the network and browser console.");
                if (!ready) rejectInitialization(err);
                for (const task of pending.values()) task.reject(err);
                pending.clear();
                notify(err.message, true);
            });
            worker.postMessage({action: "init"});
            return initialization;
        }

        function runPython(action, extra) {
            if (!ready) throw new Error("Python is not ready");
            requestId++;
            const id = requestId;
            return new Promise((resolve, reject) => {
                pending.set(id, {resolve, reject});
                worker.postMessage({id, action, mode: byId("engine-mode").value, ...extra});
            });
        }

        function collectPayload() {
            const payload = {
                task_id: byId("task_id").value.trim(),
                target_identifier: byId("target_id").value.trim(),
                primary_metric: parseMetric(byId("primary_metric").value, "Primary metric"),
                secondary_metric: parseMetric(byId("secondary_metric").value, "Secondary metric"),
                status_descriptor: byId("status_descriptor").value.trim(),
                is_critical_flag: byId("is_critical").checked
            };
            validateCase(payload);
            return payload;
        }

        function output(result, isBatch) {
            lastResult = result;
            lastCsv = isBatch ? result.export_csv : null;
            const status = isBatch ? result.processed + " rows processed" :
                (result.overall_urgency || result.overall_status || "COMPLETE");
            sessionCount += isBatch ? result.processed : 1;
            sessionAlerts += isBatch ? 0 : (Number(result.total_alerts) || 0);
            byId("m-tasks").textContent = String(sessionCount);
            byId("m-audit").textContent = String(sessionAlerts);
            byId("m-status").textContent = status;
            const display = isBatch
                ? {...result, export_csv: "(Available through Download CSV)"}
                : result;
            byId("outputConsole").textContent = JSON.stringify(display, null, 2);
            notify(isBatch && result.errors.length
                ? "Batch completed with " + result.errors.length + " rejected row(s)"
                : "Evaluation completed in Python · " + byId("engine-mode").selectedOptions[0].textContent);
        }

        function fail(err) {
            const msg = err && err.message ? err.message : String(err);
            byId("m-status").textContent = "ERROR";
            byId("outputConsole").textContent = "Evaluation failed: " + msg;
            notify("Error: " + msg, true);
        }

        function saveFile(name, contents, mime) {
            const url = URL.createObjectURL(new Blob([contents], {type: mime}));
            const a = document.createElement("a");
            a.href = url;
            a.download = name;
            document.body.appendChild(a);
            a.click();
            a.remove();
            global.setTimeout(() => URL.revokeObjectURL(url), 2000);
        }

        async function evaluateSingle() {
            setBusy(true);
            try {
                const payload = collectPayload();
                let result;
                if (byId("api-mode").checked) {
                    if (byId("engine-mode").value !== "enterprise") {
                        throw new Error("The server API supports enterprise mode only");
                    }
                    const response = await fetch("/api/audit", {
                        method: "POST", headers: {"Content-Type": "application/json"},
                        body: JSON.stringify(payload)
                    });
                    if (!response.ok) throw new Error("Server returned HTTP " + response.status);
                    result = await response.json();
                } else {
                    result = await runPython("evaluate", {payload});
                }
                output(result, false);
            } catch (err) {
                fail(err);
            } finally {
                setBusy(false);
            }
        }

        async function evaluateBatch() {
            setBusy(true);
            try {
                const file = byId("csv-file").files[0];
                if (!file) throw new Error("Choose a CSV file first");
                if (file.size > MAX_UPLOAD_BYTES) throw new Error("CSV exceeds the 2 MB limit");
                const csv_text = await file.text();
                output(await runPython("batch", {csv_text}), true);
            } catch (err) {
                fail(err);
            } finally {
                setBusy(false);
            }
        }

        global.addEventListener("DOMContentLoaded", function () {
            const apiContainer = byId("api-container");
            if (browserMode(global.location)) {
                apiContainer.hidden = true;
            }
            byId("run-audit").addEventListener("click", evaluateSingle);
            byId("run-batch").addEventListener("click", evaluateBatch);
            byId("engine-mode").addEventListener("change", () => {
                byId("api-mode").checked = false;
                byId("csv-file").value = "";
            });
            byId("download-json").addEventListener("click", () => {
                if (lastResult) {
                    const result = {...lastResult};
                    delete result.export_csv;
                    saveFile("critical-panic-results.json", JSON.stringify(result, null, 2),
                             "application/json;charset=utf-8");
                }
            });
            byId("download-csv").addEventListener("click", () => {
                if (lastCsv) saveFile("critical-panic-results.csv", lastCsv, "text/csv;charset=utf-8");
            });
            byId("sample-csv").addEventListener("click", () => {
                saveFile("synthetic-" + byId("engine-mode").value + ".csv",
                    SAMPLE_ROWS[byId("engine-mode").value], "text/csv;charset=utf-8");
            });
            setBusy(true);
            initializePython().catch(err => {
                fail(err);
                byId("mode-badge").textContent = "Python unavailable";
                setBusy(false);
            });
        });
    }

    if (typeof module !== "undefined" && module.exports) {
        module.exports = {parseMetric, validateCase, browserMode, SAMPLE_ROWS};
    }
})(typeof window !== "undefined" ? window : globalThis);
