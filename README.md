# Critical Panic Alert Agent

### [Open the Live Application →](https://abusuraihsakhri.github.io/critical-panic-alert-agent/)

A **research prototype** for evaluating synthetic laboratory alert inputs and exploring rules-based escalation logic. It provides Python command-line tools, a FastAPI service, test fixtures, and a static browser demonstration.

**Not a validated clinical decision support system.** No analyte names, units, patient-specific critical thresholds, notification delivery, acknowledgement workflow, or clinical deployment controls are implemented. The numeric thresholds are illustrative and must not be used for patient care.

## Features

- **Enterprise evaluation** (`agents/`, `cli.py`): three independent rules for primary metric >25, secondary metric >12 or a critical flag, and status-descriptor discordance; summary dossier and an in-memory HMAC audit chain
- **Clinical-package variant** (`critical_panic_alert_agent/`): separate demonstration rules for primary metric >20, secondary metric >10 or STAT flag, and a biomarker status flag; results are not interchangeable with enterprise evaluation
- **Legacy standalone variant** (`panic_alert_agent.py`): maintained for backward compatibility, with its own rules and CLI
- **Browser demonstration** (`web/`): evaluates synthetic inputs locally on GitHub Pages using the enterprise worker conditions; when opened from the FastAPI server, submits data to its `/api/audit` endpoint
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

## Browser demonstration

Open `web/index.html` directly for a local demonstration, or use the GitHub Pages deployment when it is enabled. It runs in the browser without Python, Pyodide, a backend, or network requests to the API. It does not produce real cryptographic audit signatures or contact clinicians. Use **synthetic data only**.

When served by the FastAPI application, the same interface uses the real Python evaluation endpoint. That endpoint is a research demonstration and has **no authentication** for submissions; do not expose it to the public internet or process identifiable patient data.

## Security and data handling

- The enterprise API applies a limited regular-expression identifier screen, including nested payload data. **Regex checks do not establish HIPAA de-identification, privacy compliance, or complete PHI detection.**
- Audit events are signed with HMAC-SHA256 and checked on verification. The ledger is **in memory only**, so records, chain state, and any randomly generated signing key are lost after a restart. This is not durable evidence storage.
- Set `AUDIT_SECRET_KEY` explicitly for a stable signing key. Never commit keys. A signing key previously included in Compose configuration must be treated as exposed if it was ever used.
- `GET /api/audit/logs` is disabled unless `AUDIT_LOG_API_KEY` is set; requests must then send that value in the `X-Audit-Key` header. Use HTTPS and independent service authentication for any nonlocal access.
- The static browser demonstration stores no case history or data outside the current page session and does not transmit data to the API on GitHub Pages.

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

CI runs Python 3.10–3.12 and Node.js 22. JavaScript browser logic has no external dependencies; modern browsers supporting ES2019+ are recommended.

## Technology and license

Python, Pydantic v2, FastAPI, standard-library HMAC-SHA256, vanilla JavaScript, and HTML/CSS. Released under the [MIT License](LICENSE).
