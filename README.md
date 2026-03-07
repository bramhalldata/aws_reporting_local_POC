# AWS Reporting POC — Local Development

A local proof-of-concept of the client reporting platform that demonstrates
the full pipeline end-to-end using local substitutes for cloud services.

```
Parquet → DuckDB (SQL metrics) → Publisher → JSON artifacts → React portal
```

## Architecture Overview

This POC maps directly to the production architecture:

| Local POC | Production |
|-----------|-----------|
| `data/generate_fixtures.py` | ETL pipeline (Glue / Spark / Lambda) |
| `data/parquet/ccd_failures.parquet` | S3 gold Parquet tables |
| `sql/athena_views.sql` | AWS Athena reporting views / named queries |
| DuckDB in-memory | AWS Athena query engine |
| `src/publisher/main.py` | Publisher service (ECS / Fargate / Batch) |
| `artifacts/summary.json`, `artifacts/manifest.json` | S3 artifact bucket |
| Vite dev server | CloudFront + S3 static hosting |
| `portal/src/App.jsx` | React portal via CloudFront |

### Architecture rules

1. **Metrics are defined in SQL only** — `sql/athena_views.sql` is the single source of
   truth for all metric logic. The publisher executes these queries but never redefines them.
2. **Parquet is the analytical store** — all curated data lives in Parquet; the publisher
   reads it through DuckDB (locally) or Athena (production).
3. **Publisher generates deterministic artifacts** — each run produces the same output for
   the same input. `report_ts` is fixed once at run start; all SQL windows are relative to it.
4. **JSON artifacts are the portal contract** — the portal loads `manifest.json` then
   `summary.json`; it never computes metrics.
5. **Portal is presentation-only** — the React app renders artifact data and nothing else.

---

## Note on sql/athena_views.sql

`sql/athena_views.sql` is a **local query definitions file**, not literal Athena DDL.
It contains the same metric logic that in production would be expressed as Athena
`CREATE VIEW` statements or named Athena queries. The DuckDB syntax is compatible
with Athena SQL (Presto/Trino dialect) for the queries used here.

---

## Prerequisites

- Python 3.11+
- Node.js 18+

---

## Run the Local POC

### Step 1 — Install Python dependencies

```bash
pip install -r requirements.txt
```

### Step 2 — Generate synthetic Parquet data (ETL substitute)

Run once to create the data file, or re-run to regenerate with a fresh seed.

```bash
python data/generate_fixtures.py
```

Output: `data/parquet/ccd_failures.parquet` (200 rows, 5 sites, 10-day window)

### Step 3 — Run the publisher

Queries DuckDB, validates schemas, and writes both JSON artifacts.

```bash
python src/publisher/main.py
```

Output:
- `artifacts/summary.json`
- `artifacts/manifest.json`

### Step 4 — Start the portal

```bash
cd portal
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

The portal loads `manifest.json` to confirm pipeline status, then loads `summary.json`
to render the dashboard.

---

## Directory Structure

```
aws_reporting_POC/
├── CLAUDE.md                          # Architecture rules
├── README.md
├── requirements.txt                   # Python deps: duckdb, pyarrow, jsonschema
├── .gitignore
│
├── data/
│   ├── generate_fixtures.py           # ETL substitute — generates Parquet data
│   └── parquet/
│       └── ccd_failures.parquet       # Generated (gitignored)
│
├── sql/
│   └── athena_views.sql               # Metric definitions (DuckDB / Athena SQL)
│
├── src/
│   └── publisher/
│       ├── main.py                    # Publisher entry point
│       └── validators/
│           ├── summary_schema.py      # JSON Schema for summary.json
│           └── manifest_schema.py     # JSON Schema for manifest.json
│
├── artifacts/
│   ├── .gitkeep
│   ├── summary.json                   # Generated (gitignored)
│   └── manifest.json                  # Generated (gitignored)
│
├── portal/
│   ├── package.json
│   ├── vite.config.js                 # publicDir → ../artifacts
│   ├── index.html
│   └── src/
│       ├── main.jsx
│       └── App.jsx                    # Dashboard: manifest → summary → render
│
└── docs/
    ├── claude-startup-guide.md
    └── ...
```

---

## Verification

After running steps 1–3:

```bash
# Confirm both artifacts exist and are valid JSON
cat artifacts/manifest.json
cat artifacts/summary.json
```

Sanity check: `failures_last_7d` should be greater than or equal to `failures_last_24h`.

To test SQL block validation:

```bash
# Temporarily remove a block from sql/athena_views.sql, then run:
python src/publisher/main.py
# Should exit with: ERROR: Missing required SQL blocks ...
```

---

## Artifact Contracts

### artifacts/manifest.json

```json
{
  "artifacts": ["summary.json"],
  "generated_at": "2026-03-07T12:00:00+00:00",
  "schema_version": "1.0.0",
  "status": "ok"
}
```

### artifacts/summary.json

```json
{
  "failures_last_24h": 18,
  "failures_last_7d": 143,
  "generated_at": "2026-03-07T12:00:00+00:00",
  "report_ts": "2026-03-07T12:00:00Z",
  "schema_version": "1.0.0",
  "top_sites": [
    {"failures": 35, "site": "site_alpha"},
    {"failures": 29, "site": "site_bravo"}
  ]
}
```

Schema changes require updates to the validators and `docs/json-contracts.md`.
