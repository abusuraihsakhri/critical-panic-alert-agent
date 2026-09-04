# Critical Panic Alert Agent

> **Domain:** Clinical Decision Support & Biomedical Computing
> **Standards:** CAP / CLSI / ISO / NCCN / WHO

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Python](https://img.shields.io/badge/Python-3.10%20%7C%203.11%20%7C%203.12-3776AB.svg?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688.svg?logo=fastapi&logoColor=white)
![Audit Trail](https://img.shields.io/badge/Audit-HMAC--SHA256_Tamper--Evident-brightgreen.svg)
![Zero-PHI Guard](https://img.shields.io/badge/Guard-Zero--PHI_Outbound-blue.svg)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg?logo=docker&logoColor=white)

</div>

---

## 📖 What It Does

**Critical Panic Alert Agent** is an advanced analytical and computational platform implementing a 15-Minute Closed-Loop Critical Panic Lab Escalation Agent. It automates critical laboratory panic value interception, delta verification, and closed-loop verbal clinician escalation tracking.

---

## ⚙️ Key Capabilities & Algorithmic Modules

### 🔬 Core Algorithmic & Evaluation Engines

- **`Severity`** — Severity evaluation and state verification (INFO, ADVISORY, WARNING, CRITICAL_ACTION_REQUIRED)
- **`DomainKnowledgeRegistry`**: Enterprise domain rules, guideline matrices, and evidence benchmarks
- **`AgentAlert`** — Agent alert evaluation and state verification
- **`PanicThresholdDetectorAgent`**: Primary metric threshold monitoring
- **`DeltaCheckCorrelatorAgent`**: Secondary parameter delta verification and escalation
- **`EscalationTimerAgent`**: Biomarker discordance and concordance triage

### 🏗️ Architecture

The project contains two parallel implementations:

1. **`agents/` package** — Enterprise-grade implementation with Pydantic v2 models, HMAC-SHA256 audit trail, and PHI guard
2. **`critical_panic_alert_agent/` package** — Clinical laboratory-focused implementation with CLSI EP28-A3 & Westgard Multi-Rule QC standards

---

## 💻 Installation

```bash
# Clone the repository
git clone https://github.com/abusuraihsakhri/critical-panic-alert-agent.git
cd critical-panic-alert-agent

# Install dependencies
pip install fastapi uvicorn pydantic pytest
```

---

## 🚀 CLI Quickstart & Usage

### 1. Single Case Audit (Enterprise Agent)
```bash
python cli.py audit --task-id TASK-001 --primary 28.5 --secondary 14.2 --critical --status DISCORDANT
```

### 2. Single Case Audit (Clinical Agent)
```bash
python critical_panic_alert_agent_app.py audit --case-id CASE-001 --primary 26.2 --secondary 12.5 --stat --status DISCORDANT
```

### 3. Batch Processing
```bash
python cli.py batch -i sample.csv -o results.csv
```

### 4. Query Air-Gapped Assistant
```bash
python cli.py chat "What is the system status?"
```

### 5. Verify Audit Trail Integrity
```bash
python cli.py verify-audit
```

### 6. Launch REST API Server
```bash
python cli.py serve --host 127.0.0.1 --port 8000
```

### Parameter Reference
- `--task-id` / `--case-id`: Unique task/case identifier
- `--target`: Target entity or specimen identifier
- `--primary`: Primary measurement value (float)
- `--secondary`: Secondary metric value (float)
- `--critical` / `--stat`: Emergency escalation flag
- `--status`: Status/phenotype descriptor

### Input Data Schema (CSV)

| Field | Description | Requirement |
|:------|:------------|:------------|
| `task_id` / `case_id` | Unique identifier | Required |
| `target_identifier` | Entity or specimen key | Required |
| `primary_metric` | Primary measurement | Required |
| `secondary_metric` | Secondary measurement | Optional |
| `is_critical_flag` / `is_stat` | Emergency flag | Optional |
| `status_descriptor` / `status_flag` | Status descriptor | Optional |

---

## 🛡️ Security & Enterprise Architecture

* **Zero-PHI Outbound Interceptor:** Active regex inspection blocking SSNs, MRNs, phone numbers, emails, and patient identifiers
* **Tamper-Evident HMAC-SHA256 Audit Trail:** Chained, cryptographically signed logs for every evaluation
* **Input Validation:** Pydantic v2 validators reject NaN, Infinity, and malformed inputs
* **String Sanitization:** Automatic whitespace stripping and control character removal
* **Secure Defaults:** Cryptographically random audit key generated if `AUDIT_SECRET_KEY` env var not set

### Environment Variables
- `AUDIT_SECRET_KEY`: Secret key for HMAC-SHA256 audit trail (generate with `python -c "import secrets; print(secrets.token_hex(32))"`)
- `MODEL_PROVIDER`: LLM provider selection (`mock`, `ollama`, `claude`, `openai`)

---

## 🧪 Testing & Verification

Run the automated test suite:

```bash
pytest -v
```

Execute high-throughput batch simulation benchmarks:

```bash
python simulator.py 1000
```

---

## 🐳 Container Deployment

```bash
docker build -t critical-panic-alert-agent .
docker run -p 8000:8000 -e AUDIT_SECRET_KEY=$(python -c "import secrets; print(secrets.token_hex(32))") critical-panic-alert-agent
```

Or using Docker Compose:

```bash
docker-compose up -d
```

---

## 📁 Project Structure

```
critical-panic-alert-agent/
├── agents/                          # Enterprise agent package
│   ├── __init__.py
│   ├── api.py                       # FastAPI REST endpoints
│   ├── base.py                      # PHI guard, HMAC audit trail
│   ├── learning.py                  # Bayesian calibration engine
│   ├── llm_factory.py               # LLM provider factory
│   ├── metrics.py                   # Prometheus metrics collector
│   ├── models.py                    # Pydantic v2 data models
│   ├── streamer.py                  # WebSocket telemetry broadcaster
│   ├── supervisor.py                # Master orchestrator
│   └── workers.py                   # Specialized worker agents
├── critical_panic_alert_agent/      # Clinical agent package
│   ├── __init__.py
│   ├── agents.py                    # Clinical sub-agents
│   ├── cli.py                       # Clinical CLI
│   ├── engine.py                    # Clinical domain rules
│   ├── models.py                    # Clinical data models
│   └── server.py                    # Clinical FastAPI server
├── tests/                           # Test suite
│   ├── test_critical_panic_alert_agent.py
│   └── test_enrichment.py
├── web/                             # Operations console
│   └── index.html
├── cli.py                           # Enterprise CLI entry point
├── panic_alert_agent.py             # Standalone agent implementation
├── enrichment.py                    # Enrichment feature engines
├── simulator.py                     # High-throughput simulator
├── pyproject.toml                   # Project configuration
├── Dockerfile                       # Container build
├── docker-compose.yml               # Container orchestration
└── README.md                        # This file
```

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.
