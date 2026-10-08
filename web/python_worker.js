/* Execute the repository's real Python source inside a dedicated Web Worker. */
"use strict";

const PYODIDE_URL = "https://cdn.jsdelivr.net/pyodide/v0.28.3/full/pyodide.js";
const PYTHON_FILES = [
    "agents/__init__.py",
    "agents/base.py",
    "agents/rules.py",
    "critical_panic_alert_agent/__init__.py",
    "critical_panic_alert_agent/models.py",
    "critical_panic_alert_agent/engine.py",
    "critical_panic_alert_agent/agents.py",
    "panic_alert_agent.py",
    "browser_engine.py"
];

let runtimePromise = null;

async function initialize() {
    importScripts(PYODIDE_URL);
    const runtime = await loadPyodide();
    const contents = await Promise.all(PYTHON_FILES.map(async path => {
        const url = new URL("./python/" + path, self.location.href);
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error("Python source unavailable (" + response.status + "): " + path);
        }
        return [path, await response.text()];
    }));
    runtime.FS.mkdir("/app");
    runtime.FS.mkdir("/app/python");
    runtime.FS.mkdir("/app/python/agents");
    runtime.FS.mkdir("/app/python/critical_panic_alert_agent");
    for (const [path, code] of contents) {
        runtime.FS.writeFile("/app/python/" + path, code);
    }
    runtime.runPython(
        "import sys\nsys.path.insert(0, '/app/python')\nfrom browser_engine import run_json"
    );
    return runtime;
}

function ensureRuntime() {
    if (!runtimePromise) {
        runtimePromise = initialize();
    }
    return runtimePromise;
}

self.onmessage = async function (event) {
    const request = event.data || {};
    try {
        const pyodide = await ensureRuntime();
        if (request.action === "init") {
            self.postMessage({type: "ready"});
            return;
        }
        const runner = pyodide.globals.get("run_json");
        try {
            const result = runner(JSON.stringify(request));
            self.postMessage({type: "result", id: request.id, result: JSON.parse(result)});
        } finally {
            runner.destroy();
        }
    } catch (error) {
        self.postMessage({
            type: request.action === "init" ? "init-error" : "error",
            id: request.id,
            error: String(error && error.message ? error.message : error)
        });
    }
};
