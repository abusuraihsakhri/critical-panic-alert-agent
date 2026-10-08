# Critical Panic Alert Agent

### [Open the Live Application →](https://abusuraihsakhri.github.io/critical-panic-alert-agent/)

A **research prototype** for evaluating synthetic laboratory alert inputs and exploring rules-based escalation logic. It provides Python command-line tools, a FastAPI service, test fixtures, and an executable browser application powered by Python in WebAssembly.

**Not a validated clinical decision support system.** No analyte names, units, patient-specific critical thresholds, notification delivery, acknowledgement workflow, or clinical deployment controls are implemented. The numeric thresholds are illustrative and must not be used for patient care.

## Features

- **Enterprise evaluation** (`agents/`, `cli.py`): three independent rules for primary metric >25, secondary metric >12 or a critical flag, and status-descriptor discordance; summary dossier and an in-memory HMAC audit chain
- **Clinical-package variant** (`critical_panic_alert_agent/`): separate demonstration rules for primary metric >20, secondary metric >10 or STAT flag, and a biomarker status flag; results are not interchangeable with enterprise evaluation
- **Legacy standalone variant** (`panic_alert_agent.py`): maintained for backward compatibility, with its own rules and CLI
- **Live Python browser application** (`web/`): Pyodide runs `agents/rules.py`, the original clinical package and the standalone coordinator in-browser; evaluates cases and local CSV files without a backend
- **File workflows**: choose the Python engine, enter an individual synthetic case, upload CSV (up to 2 MB/2,000 rows), inspect diagnostics, download JSON/CSV, and download correctly formatted example CSV files
- **CLI and CSV batch processing**, plus an optional JSON API and regression tests

The `enrichment.py` module contains **generic threshold demonstrations**, not operational callback tracking, on-call notification, CAP peer benchmarking, or patient-specific enrichment.

## Installation

Requires Python 3.10 or later.

```bash
git clone https://github.com/abusuraihsakhri/critical-panic-alert-agent.git
cd critical-panic-alert-agent
python -m venv .venv
source .venv/bin/activate
python -m pip install -e ".[test]"
```

On Windows, use `.venv\\Scripts\\activate` instead of `source .venv/bin/activate`.

## Usage

```bash
# Enterprise evaluator
python cli.py audit --task-id SYN-001 --target SPECIMEN-001 --primary 28 --secondary 14 --critical
python cli.py batch -i enterprise-input.csv -o results.csv
python cli.py verify-audit

# Distinct clinical demonstration
python critical_panic_alert_agent_app.py audit --case-id SYN-001 --primary 26 --secondary 12 --stat

# Legacy CLI
python panic_alert_agent_app.py audit --case-id SYN-001

# REST API and browser interface at http://127.0.0.1:8000/
python cli.py serve --host 127.0.0.1 --port 8000
```

The enterprise batch CSV needs `task_id,target_identifier,primary_metric`, with optional `secondary_metric,status_descriptor,is_critical_flag`. The included `sample.csv` uses the **clinical variant's** column names; process it using `python critical_panic_alert_agent_app.py batch -i sample.csv -o results.csv` rather than `python cli.py batch`.

The FastAPI application provides `GET /health`, `GET /metrics`, `POST /api/audit`, and `POST /api/chat`. OpenAPI documentation is at `/docs`. The browser UI is at `/`.

## Live GitHub Pages application

**[Open the live Python application](https://abusuraihsakhri.github.io/critical-panic-alert-agent/)**.

The published site loads pinned Pyodide **0.28.3** (Python compiled to WebAssembly) from the jsDelivr CDN, then loads the Python source bundled with the repository and executes it **locally in the browser**. The first launch requires an internet connection to fetch the Python runtime. No server-side Python process or API credentials are necessary for the Pages application.

The single-case UI has three modes:

1. **Enterprise** — actual `agents.rules.evaluate_worker_rules` shared with the FastAPI workers, so server and browser use the same thresholds and findings
2. **Clinical** — the existing `critical_panic_alert_agent` dataclasses and coordinator (its thresholds differ)
3. **Standalone** — the original `panic_alert_agent.CriticalAlertCoordinator`

CSV processing runs through Python's `csv.DictReader` in the browser. Use **Sample CSV** to get each mode's supported schema, upload a synthetic CSV, inspect accepted/rejected rows and download the results. The interface also provides JSON export for individual dossiers. Missing fields, invalid numeric values, unexpected CSV columns, and oversize files are reported rather than replaced with fabricated results.

The browser does not transmit entered clinical cases to the application's own backend. Static files and the Pyodide runtime must be downloaded from their respective hosts. Exports occur through your browser's download mechanism. **No clinician notification, closed-loop acknowledgement, scheduled callback, durable audit record, or validated clinical rulebook is implemented.** The browser's enterprise output has no audit signature (`audit_hash: null`).

To run the full interface locally, install the project and start `python cli.py serve`, then open `http://127.0.0.1:8000/`. It also offers an explicit **Use enterprise server API** option for the server implementation. Directly opening `web/index.html` via `file://` is not supported because Pyodide needs HTTP access to the bundled Python source.

## Security and data handling

- The enterprise API applies a limited regular-expression identifier screen, including nested payload data. **Regex checks do not establish HIPAA de-identification, privacy compliance, or complete PHI detection.**
- Audit events are signed with HMAC-SHA256 and checked on verification. The ledger is **in memory only**, so records, chain state, and any randomly generated signing key are lost after a restart. This is not durable evidence storage.
- Set `AUDIT_SECRET_KEY` explicitly for a stable signing key. Never commit keys. A signing key previously included in Compose configuration must be treated as exposed if it was ever used.
- `GET /api/audit/logs` is disabled unless `AUDIT_LOG_API_KEY` is set; requests must then send that value in the `X-Audit-Key` header. Use HTTPS and independent service authentication for any nonlocal access.
- The Pyodide browser application holds data in memory for the current page session. Uploaded CSV data and calculated results stay in the browser; code and runtime assets come from GitHub Pages and jsDelivr. For the optional local server-API mode, case inputs are sent to the local server.

## Container

```bash
export AUDIT_SECRET_KEY="$(python -c 'import secrets; print(secrets.token_hex(32))')"
docker compose up --build
```

Docker Compose refuses to start without `AUDIT_SECRET_KEY`. Its default port mapping binds `8000` to `127.0.0.1` on the host; do not expose the unauthenticated API directly on a public interface.

## Tests

```bash
python -m pytest -q
python -m pip check
python -m compileall -q agents critical_panic_alert_agent
node --check web/app.js
node --test web/app.test.cjs
```

CI runs Python 3.10–3.12 and Node.js 22; the Pages deployment additionally executes Chromium against the live URL, checking Python loading, all three engines, CSV processing, downloads and validation. The browser requires JavaScript, WebAssembly and access to the pinned Pyodide CDN.

## Technology and license

Python, Pyodide/WebAssembly, Pydantic v2 (server only), FastAPI, standard-library HMAC-SHA256 (server audit), vanilla JavaScript, and HTML/CSS. Released under the [MIT License](LICENSE).
