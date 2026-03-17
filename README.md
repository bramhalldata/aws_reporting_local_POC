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
| `artifacts/{client}/{env}/` | S3 artifact bucket (client/env scoped) |
| Vite dev server | CloudFront + S3 static hosting |
| `portal/src/App.jsx` | React portal via CloudFront |

### Architecture rules

1. **Metrics are defined in SQL only** — `sql/athena_views.sql` is the single source of
   truth for all metric logic. The publisher executes these queries but never redefines them.
2. **Parquet is the analytical store** — all curated data lives in Parquet; the publisher
   reads it through DuckDB (locally) or Athena (production).
3. **Publisher generates deterministic artifacts** — each run produces the same output for
   the same input. `report_ts` is fixed once at run start; all SQL windows are relative to it.
4. **JSON artifacts are the portal contract** — the portal loads artifacts from the scoped
   path `/{client}/{env}/current/{dashboard}/`; it never computes metrics.
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

Install the publisher as an editable package (installs the `publisher` CLI command):

```bash
pip install -e .
```

This installs all Python dependencies (`duckdb`, `pyarrow`, `jsonschema`) and registers
the `publisher` command. If you prefer not to use the editable install, you can still
use `pip install -r requirements.txt` and invoke the publisher directly (see Legacy path below).

### Step 2 — Generate synthetic Parquet data (ETL substitute)

Run once to create the data file, or re-run to regenerate with a fresh seed.

```bash
python data/generate_fixtures.py
```

Output:
- `data/parquet/ccd_failures.parquet` — DLQ failure events (200 rows, 5 sites, 10-day window)
- `data/parquet/ccd_sent_to_udm.parquet` — CCD files sent to UDM (300 rows, 6 sites, 60-day window)

### Step 3 — Run the publisher

```bash
publisher run --env local --dashboard dlq_operations
publisher run --env local --dashboard pipeline_health

# Client-scoped dashboard (uses contexture/prod artifact path)
publisher run --client contexture --env prod --dashboard sent_to_udm
```

**`--env local`** runs the local POC stack: DuckDB in-memory with the Parquet data files
as the data source. This is the local substitute for AWS Athena + S3 Parquet gold tables.
`--client` and `--env` control the artifact output scope.

Artifacts are written to the scoped path (default scope is `default/local`):

```
artifacts/default/local/current/dlq_operations/   ← dashboard artifacts (current run)
artifacts/default/local/current/pipeline_health/
artifacts/default/local/current/run_history.json  ← run history index
artifacts/default/local/runs/{run_id}/             ← immutable historical snapshots

artifacts/contexture/prod/current/sent_to_udm/     ← client-scoped dashboard artifacts
artifacts/contexture/prod/current/run_history.json
```

#### Legacy path (no editable install required)

```bash
python src/publisher/main.py
```

This is equivalent to `publisher run --env local --dashboard dlq_operations` and will
continue to work for backward compatibility.

### Step 4 — Start the portal

```bash
cd portal
npm install
npm run dev
```

Open [http://localhost:5173/default/local/dlq_operations](http://localhost:5173/default/local/dlq_operations)

The root URL (`http://localhost:5173`) redirects automatically to the default client/env.

Example URLs:

| URL | Dashboard |
|-----|-----------|
| `http://localhost:5173/default/local/dlq_operations` | DLQ Operations |
| `http://localhost:5173/default/local/pipeline_health` | Pipeline Health |
| `http://localhost:5173/contexture/prod/sent_to_udm` | CCD Sent to UDM (contexture/prod) |
| `http://localhost:5173/default/local/history` | Run History |

---

## Multi-Client & Multi-Environment Routing

The portal uses URL-prefix routing: `/:client/:env/<dashboard>`.

To publish artifacts for a different client or environment:

```bash
publisher run --client contexture --env prod --dashboard dlq_operations
```

Artifacts are written to `artifacts/contexture/prod/` and served at `/contexture/prod/...`.
Navigate to `http://localhost:5173/contexture/prod/dlq_operations` in the portal.

Legacy bookmarks (pre-v1.2.0 paths without `/{client}/{env}`) redirect automatically
to `/default/local/...`.

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
│       ├── ccd_failures.parquet       # Generated (gitignored)
│       └── ccd_sent_to_udm.parquet    # Generated (gitignored)
│
├── sql/
│   └── athena_views.sql               # Metric definitions (DuckDB / Athena SQL)
│
├── src/
│   └── publisher/
│       ├── main.py                    # Publisher entry point
│       ├── validators/
│       │   ├── run_history_schema.py  # JSON Schema for run_history.json (v1.2.0)
│       │   ├── summary_schema.py      # JSON Schema for summary.json
│       │   ├── manifest_schema.py     # JSON Schema for manifest.json
│       │   └── ...                   # Per-dashboard artifact schemas
│       └── tests/
│           └── test_sent_to_udm_*_schema.py  # Validator unit tests (20 tests)
│
├── artifacts/
│   ├── .gitkeep
│   └── default/local/                 # Generated (gitignored)
│       ├── current/
│       │   ├── run_history.json
│       │   ├── dlq_operations/
│       │   └── pipeline_health/
│       └── runs/
│           └── {run_id}/
│               ├── dlq_operations/
│               └── pipeline_health/
│
├── portal/
│   ├── package.json
│   ├── vite.config.js                 # publicDir → ../artifacts
│   ├── index.html
│   └── src/
│       ├── main.jsx
│       ├── App.jsx                    # Routes: /:client/:env/*
│       ├── AppShell.jsx               # Identity bar + NavBar + Outlet
│       ├── theme/
│       ├── components/
│       │   └── NavBar.jsx
│       ├── hooks/
│       │   └── useArtifactPath.js     # Artifact URL resolver
│       ├── dashboards/
│       │   ├── index.js               # Dashboard registry
│       │   ├── dlq_operations/
│       │   ├── pipeline_health/
│       │   └── sent_to_udm/
│       └── pages/
│           ├── RunHistory.jsx
│           └── RunDetail.jsx
│
└── docs/
    ├── claude-startup-guide.md
    ├── json-contracts.md
    └── architecture/
        ├── artifact-layout.md
        └── portal-routing.md
```

---

## Verification

After running steps 1–3:

```bash
# Confirm run history index exists and is valid JSON
cat artifacts/default/local/current/run_history.json

# Confirm dashboard artifacts exist
cat artifacts/default/local/current/dlq_operations/manifest.json
cat artifacts/default/local/current/dlq_operations/summary.json
```

Sanity check: in `summary.json`, `failures_last_7d` should be greater than or equal to `failures_last_24h`.

To test SQL block validation:

```bash
# Temporarily remove a block from sql/athena_views.sql, then run:
python src/publisher/main.py
# Should exit with: ERROR: Missing required SQL blocks ...
```

---

## Artifact Contracts

See [docs/json-contracts.md](docs/json-contracts.md) for complete schema documentation.

Schema changes require updates to the validators and `docs/json-contracts.md`.
