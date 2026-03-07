# Plan: Local POC — dlq_operations Dashboard

## Context

The repository contains only architecture documentation (CLAUDE.md, docs/claude-startup-guide.md).
No application code exists yet. The goal is to scaffold a minimal vertical slice of the full
reporting pipeline that runs entirely locally, demonstrating the architecture with local substitutes:

- Athena → DuckDB
- S3 Parquet → local `data/parquet/` files
- S3 artifacts → local `artifacts/` directory
- CloudFront → Vite dev server

The "dlq_operations" dashboard will be the single vertical slice.

---

## Architecture Rules (from docs — must not be violated)

1. **Metrics are defined in SQL** (`sql/athena_views.sql`) — never in Python or React
2. **Parquet is the data store** — publisher reads it via DuckDB
3. **Publisher assembles artifacts** — it executes SQL, validates schema, writes JSON
4. **Artifacts are the portal contract** — portal loads JSON, renders only
5. **Portal is presentation-only** — no metric logic in React components

---

## Key Design Decisions

### 1. Deterministic report timestamp

The publisher computes `report_ts` exactly once at run start:

```python
report_ts = datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
```

The SQL file uses a `{report_ts}` placeholder. Before execution, the publisher substitutes
the actual value into the SQL string. All metric windows (24h, 7d) are computed relative to
this single fixed timestamp — not `now()`. This makes runs deterministic and testable.

SQL pattern:
```sql
-- [failures_last_24h]
SELECT COUNT(*) AS failures_last_24h
FROM ccd_failures
WHERE timestamp >= TIMESTAMPTZ '{report_ts}' - INTERVAL 24 HOURS;
```

### 2. SQL file naming and purpose

`sql/athena_views.sql` is kept as the filename (matches the architecture docs). The file
header must document clearly that it contains **local query definitions** that stand in for
AWS Athena reporting logic — not literal Athena view DDL. In production these queries become
Athena CREATE VIEW statements or named query executions.

### 3. SQL block validation

Before executing any queries, the publisher validates that all required named blocks are
present in the SQL file. If any are missing it raises a clear error and exits. Required
blocks: `failures_last_24h`, `failures_last_7d`, `top_sites_by_failures`.

### 4. Two artifacts: manifest.json + summary.json

**manifest.json** is written first, as the index artifact:
```json
{
  "generated_at": "...",
  "schema_version": "1.0.0",
  "status": "ok",
  "artifacts": ["summary.json"]
}
```

**summary.json** carries the metrics payload:
```json
{
  "schema_version": "1.0.0",
  "generated_at": "...",
  "report_ts": "...",
  "failures_last_24h": 123,
  "failures_last_7d": 456,
  "top_sites": [
    {"site": "siteA", "failures": 50}
  ]
}
```

Both share the same `generated_at` and `schema_version`.

### 5. Portal load order: manifest → summary

Portal fetches `manifest.json` first to confirm status and discover artifacts.
If status is not `"ok"`, portal renders an error state. Then it fetches `summary.json`
and renders the dashboard. This establishes the right pattern from the start.

---

## Complete File List

### Data Layer (ETL substitute)
| File | Purpose |
|------|---------|
| `data/generate_fixtures.py` | Generates synthetic CCD failure Parquet |
| `data/parquet/ccd_failures.parquet` | Output of generate_fixtures.py (gitignored) |
| `data/.gitignore` | Ignores `*.parquet` |

Fixture fields: `site`, `timestamp`, `failure_type`, `document_id`
~200 rows, 5 sites, spread over the past 10 days from a fixed seed date.

### SQL Metric Definitions (Athena substitute)
| File | Purpose |
|------|---------|
| `sql/athena_views.sql` | Named query blocks; all metric logic lives here |

Named blocks (delimited by `-- [block_name]` / `-- [end]` comments):
- `failures_last_24h` — COUNT WHERE timestamp >= {report_ts} - 24h
- `failures_last_7d` — COUNT WHERE timestamp >= {report_ts} - 7d
- `top_sites_by_failures` — GROUP BY site, COUNT, ORDER DESC LIMIT 10

All queries use `{report_ts}` placeholder.

### Publisher
| File | Purpose |
|------|---------|
| `src/publisher/__init__.py` | Package marker |
| `src/publisher/validators/__init__.py` | Package marker |
| `src/publisher/validators/summary_schema.py` | jsonschema validator for summary.json |
| `src/publisher/validators/manifest_schema.py` | jsonschema validator for manifest.json |
| `src/publisher/main.py` | Entry point — full pipeline |

Publisher flow in `main.py`:
1. Compute `report_ts` (single fixed timestamp for entire run)
2. Connect DuckDB in-memory; register Parquet table
3. Read `sql/athena_views.sql`; substitute `{report_ts}`
4. Validate all required named blocks are present (fail fast if missing)
5. Execute each named query; collect scalar and tabular results
6. Build `summary.json` payload; validate schema
7. Build `manifest.json` payload; validate schema
8. Write `artifacts/summary.json` then `artifacts/manifest.json` (deterministic, sorted keys)
9. Print success message with artifact paths

### Artifacts
| File | Purpose |
|------|---------|
| `artifacts/.gitkeep` | Keeps directory tracked in git |
| `artifacts/summary.json` | Generated — gitignored |
| `artifacts/manifest.json` | Generated — gitignored |

### Portal
| File | Purpose |
|------|---------|
| `portal/package.json` | Vite + React |
| `portal/index.html` | HTML entry |
| `portal/vite.config.js` | `publicDir: '../artifacts'` — serves artifacts at root |
| `portal/src/main.jsx` | React entry |
| `portal/src/App.jsx` | Loads manifest → summary; renders dashboard |

Portal render order:
1. Fetch `/manifest.json` → check `status === "ok"`; show error if not
2. Fetch `/summary.json` → render KPI cards + top sites table
3. Show `generated_at` timestamp for freshness awareness

Portal renders:
- Failures last 24h (KPI card)
- Failures last 7d (KPI card)
- Top sites table (site | failures)
- Generated at timestamp

### Root Config
| File | Purpose |
|------|---------|
| `requirements.txt` | `duckdb`, `pyarrow`, `jsonschema` |
| `README.md` | Run instructions + architecture mapping table |
| `.gitignore` | Ignores `artifacts/*.json`, `data/parquet/*.parquet`, `node_modules/` |

---

## Run Sequence

```bash
# 1. Install Python dependencies
pip install -r requirements.txt

# 2. Generate synthetic Parquet data (run once; represents ETL output)
python data/generate_fixtures.py

# 3. Run publisher — produces artifacts/summary.json and artifacts/manifest.json
python src/publisher/main.py

# 4. Start portal dev server
cd portal
npm install
npm run dev
# Open http://localhost:5173
```

---

## Directory Mapping: Local POC → Production

| Local POC | Production |
|-----------|-----------|
| `data/generate_fixtures.py` | ETL pipeline (Glue / Spark / Lambda) |
| `data/parquet/ccd_failures.parquet` | S3 gold Parquet tables |
| `sql/athena_views.sql` | AWS Athena reporting views / named queries |
| DuckDB in-memory + `{report_ts}` substitution | Athena query engine with parameterized execution |
| `src/publisher/main.py` | Publisher service (ECS / Fargate / Batch) |
| `artifacts/summary.json` + `manifest.json` | S3 artifact bucket |
| Vite dev server (`publicDir: ../artifacts`) | CloudFront + S3 static hosting |
| `portal/src/App.jsx` | React portal served via CloudFront |

---

## Verification Steps

1. `python data/generate_fixtures.py` → `data/parquet/ccd_failures.parquet` created; script prints row count
2. `python src/publisher/main.py` → exits 0; prints artifact paths; both JSON files exist
3. Inspect `artifacts/summary.json` → confirm `failures_last_7d >= failures_last_24h` (sanity)
4. Inspect `artifacts/manifest.json` → confirm `status: "ok"` and `"summary.json"` in artifacts list
5. `cd portal && npm run dev` → browser at localhost:5173 renders KPI cards and site table
6. Confirm portal displays `generated_at` matching the artifact timestamp
7. Manually delete a required SQL block, re-run publisher → confirm clear error message, non-zero exit
