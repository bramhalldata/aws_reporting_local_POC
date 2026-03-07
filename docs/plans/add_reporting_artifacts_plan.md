# Plan: Add trend_30d, top_sites, exceptions Artifacts

## Context

The initial dlq_operations POC is complete with `summary.json` and `manifest.json`.
This task extends the pipeline with three additional reporting artifacts required by
the architecture: `trend_30d.json`, `top_sites.json`, `exceptions.json`.

All metric logic must remain in `sql/athena_views.sql`. Publisher, validators, and
portal are extended to support the new artifacts.

The fixture data (`data/parquet/ccd_failures.parquet`) already contains all fields
needed by the new queries — no changes to `data/generate_fixtures.py` are required.

---

## Key Design Decisions

### 1. Complete 30-day date series in trend_30d.json

The trend query must return exactly 30 rows — one per day — including days with zero
failures. A sparse result (only dates with data) would be incorrect.

Implementation: SQL generates the full date series using `GENERATE_SERIES` and LEFT JOINs
against actual daily counts. `COALESCE(failures, 0)` fills zero-failure days. This keeps
all data logic in SQL (correct per architecture) rather than filling zeros in Python.

```sql
WITH date_series AS (
    SELECT CAST(gs AS DATE) AS date
    FROM GENERATE_SERIES(
        CAST(TIMESTAMPTZ '{report_ts}' - INTERVAL 29 DAYS AS DATE),
        CAST(TIMESTAMPTZ '{report_ts}' AS DATE),
        INTERVAL 1 DAY
    ) gs
),
daily_counts AS (
    SELECT CAST(timestamp AS DATE) AS date, COUNT(*) AS failures
    FROM ccd_failures
    WHERE timestamp >= TIMESTAMPTZ '{report_ts}' - INTERVAL 30 DAYS
      AND timestamp <= TIMESTAMPTZ '{report_ts}'
    GROUP BY CAST(timestamp AS DATE)
)
SELECT ds.date, COALESCE(dc.failures, 0) AS failures
FROM date_series ds
LEFT JOIN daily_counts dc ON ds.date = dc.date
ORDER BY ds.date ASC;
```

### 2. All artifacts share the same generated_at and report_ts

Both `report_ts` and `generated_at` are computed exactly once in `main.py` at run start.
Every artifact payload — `summary.json`, `trend_30d.json`, `top_sites.json`,
`exceptions.json`, and `manifest.json` — receives the same two values. No artifact
may compute its own timestamp.

```python
# Computed once, passed to every artifact
report_ts = ...      # fixed before any query executes
generated_at = ...   # fixed before any artifact is built
```

### 3. UI labels must distinguish 7-day vs 30-day windows

Portal labels must be unambiguous:
- "Top Sites by Failures — last 7 days" (from summary.json, already rendered)
- "Top Sites by Failures — last 30 days" (from top_sites.json, new)
- "Failure Trend — last 30 days" (from trend_30d.json)
- "Exceptions by Type — last 7 days" (from exceptions.json)

---

## New Artifact Schemas

### trend_30d.json
```json
{
  "schema_version": "1.0.0",
  "generated_at": "2026-03-07T12:00:00+00:00",
  "report_ts": "2026-03-07T12:00:00Z",
  "days": [
    {"date": "2026-02-06", "failures": 0},
    {"date": "2026-02-07", "failures": 8}
  ]
}
```
Always exactly 30 entries, ordered by date ASC.

### top_sites.json
```json
{
  "schema_version": "1.0.0",
  "generated_at": "2026-03-07T12:00:00+00:00",
  "report_ts": "2026-03-07T12:00:00Z",
  "window_days": 30,
  "sites": [
    {"site": "site_alpha", "failures": 45}
  ]
}
```

### exceptions.json
```json
{
  "schema_version": "1.0.0",
  "generated_at": "2026-03-07T12:00:00+00:00",
  "report_ts": "2026-03-07T12:00:00Z",
  "window_days": 7,
  "exceptions": [
    {"failure_type": "TIMEOUT", "count": 45}
  ]
}
```

---

## Implementation Steps

### Step 0: Persist this plan
Write plan to `docs/plans/add_reporting_artifacts_plan.md` before any code changes.

### Step 1: `sql/athena_views.sql`
Add three new named blocks: `trend_30d` (with full date series via GENERATE_SERIES +
LEFT JOIN), `top_sites_30d`, `exceptions_7d`. Update the header comment's
`Required blocks` list.

### Step 2: Three new validators
- `src/publisher/validators/trend_30d_schema.py`
- `src/publisher/validators/top_sites_schema.py`
- `src/publisher/validators/exceptions_schema.py`

### Step 3: `src/publisher/main.py`
- Add new imports for three validators
- Extend `REQUIRED_BLOCKS` with `"trend_30d"`, `"top_sites_30d"`, `"exceptions_7d"`
- After DuckDB connection, add three query executions
- Capture `generated_at` once before building any artifact; confirm `report_ts` is
  already captured once — verify both are threaded through all five artifact payloads
- Build, validate, and write `trend_30d.json`, `top_sites.json`, `exceptions.json`
- Update manifest `artifacts` list: `["summary.json", "trend_30d.json", "top_sites.json", "exceptions.json"]`
- Extend the print summary at the end

### Step 4: `portal/src/App.jsx`
- `loadArtifacts()`: check manifest and fetch three new JSON files
- Extend `TopSitesTable` to accept a `title` prop (replaces hardcoded label) — backward
  compatible since the existing call site can pass the title explicitly
- Add `TrendTable` component: two-column (`Date` | `Failures`), labeled
  "Failure Trend — last 30 days"
- Add `ExceptionsTable` component: two-column (`Failure Type` | `Count`), labeled
  "Exceptions by Type — last 7 days"
- Render order below existing sections:
  1. Trend (30 days)
  2. Top Sites (30 days) — via `TopSitesTable` with new title prop
  3. Exceptions (7 days)

---

## Files NOT Changed

| File | Reason |
|------|--------|
| `data/generate_fixtures.py` | Existing fields cover all new queries |
| `src/publisher/validators/summary_schema.py` | summary.json schema unchanged |
| `src/publisher/validators/manifest_schema.py` | Already accepts any string array |
| `portal/vite.config.js`, `portal/index.html`, `portal/src/main.jsx` | No changes needed |
| `requirements.txt` | No new Python dependencies |

---

## Verification

1. `python src/publisher/main.py` → exits 0; prints 4 artifact paths
2. `artifacts/manifest.json` — lists all four artifacts; `generated_at` matches all other artifacts
3. `artifacts/trend_30d.json` — `days` array has exactly 30 entries; zero-failure days present; `generated_at` and `report_ts` match manifest
4. `artifacts/top_sites.json` — `window_days: 30`; `sites` non-empty; timestamps match
5. `artifacts/exceptions.json` — `window_days: 7`; all known failure types present; timestamps match
6. `cd portal && npm run dev` — all sections render; labels clearly show "7 days" vs "30 days"
7. Remove one new SQL block, re-run publisher → clear missing-block error naming the block
