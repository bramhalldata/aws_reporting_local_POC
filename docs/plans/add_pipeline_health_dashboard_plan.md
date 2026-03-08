# Plan: pipeline_health Dashboard

## Goal

Add a second lightweight dashboard (`pipeline_health`) to validate that the multi-dashboard
plugin architecture scales beyond a single dashboard. The publisher core, CLI, routing
infrastructure, and the existing `dlq_operations` dashboard are unchanged.

No new Python or npm dependencies are required.

---

## Files to Create

| File | Purpose |
|------|---------|
| `dashboards/pipeline_health/dashboard.json` | Dashboard config: SQL block names + artifact list |
| `src/publisher/validators/pipeline_health_summary_schema.py` | jsonschema validator for `summary.json` |
| `src/publisher/validators/pipeline_health_failure_types_schema.py` | jsonschema validator for `failure_types.json` |
| `portal/src/dashboards/pipeline_health/PipelineHealth.jsx` | Dashboard view component |

## Files to Modify

| File | Change |
|------|--------|
| `sql/athena_views.sql` | Append 4 new named SQL blocks; update header comment |
| `src/publisher/main.py` | Add 2 validator imports; restructure `run()` so dispatch block only handles SQL + assembly + validation; shared flow (generated_at, run_id, paths, manifest, write, copy) is generic |
| `portal/src/components/ExceptionsTable.jsx` | Add optional `title` prop (default = current string; backward-compatible) |
| `portal/src/dashboards/index.js` | Add `pipeline_health` entry |

**Unchanged:** `cli.py`, `validators/__init__.py` (empty), `App.jsx`, `main.jsx`,
`vite.config.js`, `package.json`, `pyproject.toml`, all `dlq_operations` files,
all existing validator files.

---

## New SQL Blocks (`sql/athena_views.sql`)

Append after the existing 6 blocks. Uses the same `TIMESTAMPTZ` date arithmetic pattern.
Also update the `-- Required blocks:` header comment to list the 4 new block names.

```sql
-- [pipeline_docs_24h]
SELECT COUNT(DISTINCT document_id) AS total_documents
FROM ccd_failures
WHERE timestamp >= TIMESTAMPTZ '{report_ts}' - INTERVAL 24 HOURS
  AND timestamp <= TIMESTAMPTZ '{report_ts}';
-- [end]


-- [pipeline_active_sites_24h]
SELECT COUNT(DISTINCT site) AS active_sites
FROM ccd_failures
WHERE timestamp >= TIMESTAMPTZ '{report_ts}' - INTERVAL 24 HOURS
  AND timestamp <= TIMESTAMPTZ '{report_ts}';
-- [end]


-- [pipeline_latest_event]
SELECT MAX(timestamp) AS latest_event_timestamp
FROM ccd_failures;
-- [end]


-- [pipeline_failures_by_type_24h]
SELECT
    failure_type,
    COUNT(*) AS count
FROM ccd_failures
WHERE timestamp >= TIMESTAMPTZ '{report_ts}' - INTERVAL 24 HOURS
  AND timestamp <= TIMESTAMPTZ '{report_ts}'
GROUP BY failure_type
ORDER BY count DESC;
-- [end]
```

---

## New Artifacts

### `artifacts/current/pipeline_health/summary.json`

```json
{
  "schema_version": "1.0.0",
  "generated_at": "2026-03-08T12:46:33+00:00",
  "report_ts": "2026-03-08T12:46:33Z",
  "total_documents_last_24h": 42,
  "active_sites_last_24h": 5,
  "latest_event_timestamp": "2026-03-07T11:59:00+00:00"
}
```

`latest_event_timestamp` is the raw `MAX(timestamp)` value cast to string by the publisher.

### `artifacts/current/pipeline_health/failure_types.json`

```json
{
  "schema_version": "1.0.0",
  "generated_at": "2026-03-08T12:46:33+00:00",
  "report_ts": "2026-03-08T12:46:33Z",
  "window_days": 1,
  "failure_types": [
    {"failure_type": "TIMEOUT", "count": 10},
    {"failure_type": "AUTH_ERROR", "count": 6}
  ]
}
```

---

## Dashboard Config (`dashboards/pipeline_health/dashboard.json`)

```json
{
  "dashboard_id": "pipeline_health",
  "title": "Pipeline Health",
  "description": "Lightweight operational health indicators for the CCD failure pipeline.",
  "portal_route": "/pipeline_health",
  "sql_blocks": [
    "pipeline_docs_24h",
    "pipeline_active_sites_24h",
    "pipeline_latest_event",
    "pipeline_failures_by_type_24h"
  ],
  "artifacts": [
    "summary.json",
    "failure_types.json"
  ]
}
```

---

## Validator Changes

Two new files in `src/publisher/validators/`, following the existing pattern exactly.

### `pipeline_health_summary_schema.py`

```python
"""
pipeline_health_summary_schema.py

JSON Schema validator for pipeline_health/summary.json.
Schema changes must also be reflected in docs/json-contracts.md.
"""

import jsonschema

SCHEMA_VERSION = "1.0.0"

PIPELINE_HEALTH_SUMMARY_SCHEMA = {
    "type": "object",
    "required": ["schema_version", "generated_at", "report_ts",
                 "total_documents_last_24h", "active_sites_last_24h",
                 "latest_event_timestamp"],
    "additionalProperties": False,
    "properties": {
        "schema_version":           {"type": "string"},
        "generated_at":             {"type": "string"},
        "report_ts":                {"type": "string"},
        "total_documents_last_24h": {"type": "integer"},
        "active_sites_last_24h":    {"type": "integer"},
        "latest_event_timestamp":   {"type": "string"},
    },
}

def validate(artifact: dict) -> None:
    jsonschema.validate(instance=artifact, schema=PIPELINE_HEALTH_SUMMARY_SCHEMA)
```

### `pipeline_health_failure_types_schema.py`

```python
"""
pipeline_health_failure_types_schema.py

JSON Schema validator for pipeline_health/failure_types.json.
Schema changes must also be reflected in docs/json-contracts.md.
"""

import jsonschema

SCHEMA_VERSION = "1.0.0"

PIPELINE_HEALTH_FAILURE_TYPES_SCHEMA = {
    "type": "object",
    "required": ["schema_version", "generated_at", "report_ts", "window_days", "failure_types"],
    "additionalProperties": False,
    "properties": {
        "schema_version": {"type": "string"},
        "generated_at":   {"type": "string"},
        "report_ts":      {"type": "string"},
        "window_days":    {"type": "integer"},
        "failure_types": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["failure_type", "count"],
                "additionalProperties": False,
                "properties": {
                    "failure_type": {"type": "string"},
                    "count":        {"type": "integer"},
                },
            },
        },
    },
}

def validate(artifact: dict) -> None:
    jsonschema.validate(instance=artifact, schema=PIPELINE_HEALTH_FAILURE_TYPES_SCHEMA)
```

---

## Publisher Changes (`src/publisher/main.py`)

### 1. Two new validator imports

```python
from validators import (
    exceptions_schema,
    manifest_schema,
    pipeline_health_failure_types_schema,  # NEW
    pipeline_health_summary_schema,          # NEW
    summary_schema,
    top_sites_schema,
    trend_30d_schema,
)
```

### 2. Restructure `run()` — generic shared flow, dashboard-specific dispatch

`generated_at`, `run_id`, path setup, manifest, write loop, copy loop, and logging all
remain at the generic level outside the dispatch block. Each branch only executes SQL,
assembles artifact dicts, validates them, and populates `artifacts_to_write`.

```python
# Compute generated_at once at the generic level (shared across all artifact payloads)
generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()

# ── Dashboard-specific: SQL execution + artifact assembly + validation ──────────
if dashboard == "dlq_operations":
    # existing query execution + artifact assembly + validation (no changes)
    # Sets artifacts_to_write = {"summary.json": ..., "trend_30d.json": ..., ...}

elif dashboard == "pipeline_health":
    total_docs   = con.execute(blocks["pipeline_docs_24h"]).fetchone()[0]
    active_sites = con.execute(blocks["pipeline_active_sites_24h"]).fetchone()[0]
    latest_event = con.execute(blocks["pipeline_latest_event"]).fetchone()[0]
    ft_rows      = con.execute(blocks["pipeline_failures_by_type_24h"]).fetchall()
    failure_types_list = [{"failure_type": r[0], "count": r[1]} for r in ft_rows]

    ph_summary = {
        "schema_version": SCHEMA_VERSION, "generated_at": generated_at,
        "report_ts": report_ts, "total_documents_last_24h": int(total_docs),
        "active_sites_last_24h": int(active_sites), "latest_event_timestamp": str(latest_event),
    }
    try:
        pipeline_health_summary_schema.validate(ph_summary)
    except jsonschema.ValidationError as exc:
        print(f"ERROR: summary.json schema validation failed: {exc.message}", file=sys.stderr)
        sys.exit(1)

    ph_failure_types = {
        "schema_version": SCHEMA_VERSION, "generated_at": generated_at,
        "report_ts": report_ts, "window_days": 1, "failure_types": failure_types_list,
    }
    try:
        pipeline_health_failure_types_schema.validate(ph_failure_types)
    except jsonschema.ValidationError as exc:
        print(f"ERROR: failure_types.json schema validation failed: {exc.message}", file=sys.stderr)
        sys.exit(1)

    artifacts_to_write = {
        "summary.json":       ph_summary,
        "failure_types.json": ph_failure_types,
    }

else:
    print(f"ERROR: No artifact assembler for dashboard '{dashboard}'", file=sys.stderr)
    sys.exit(1)

con.close()

# ── Generic from here: paths, manifest, write, copy, report ────────────────────
run_id      = re.sub(r"[^a-zA-Z0-9]", "", report_ts)
run_dir     = os.path.join(ARTIFACTS_RUNS_DIR, run_id, dashboard)
current_dir = os.path.join(ARTIFACTS_CURRENT_DIR, dashboard)

manifest = {
    "schema_version": SCHEMA_VERSION, "run_id": run_id,
    "generated_at": generated_at, "report_ts": report_ts,
    "status": "SUCCESS", "artifacts": artifact_list,
}
try:
    manifest_schema.validate(manifest)
except jsonschema.ValidationError as exc:
    print(f"ERROR: manifest.json schema validation failed: {exc.message}", file=sys.stderr)
    sys.exit(1)

os.makedirs(run_dir, exist_ok=True)

def write_artifact(filename, payload):
    path = os.path.join(run_dir, filename)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, sort_keys=True)

for filename, payload in artifacts_to_write.items():
    write_artifact(filename, payload)
write_artifact("manifest.json", manifest)

os.makedirs(current_dir, exist_ok=True)
for filename in artifact_list + ["manifest.json"]:
    shutil.copy2(os.path.join(run_dir, filename), os.path.join(current_dir, filename))

print("Publisher complete.")
print(f"  dashboard  : {dashboard}")
print(f"  run_id     : {run_id}")
print(f"  run folder : {run_dir}")
print(f"  current    : {current_dir}")
```

---

## Portal Changes

### `portal/src/components/ExceptionsTable.jsx`

Add optional `title` prop with the current hardcoded string as default.
All existing `dlq_operations` callers are unaffected.

```jsx
export default function ExceptionsTable({ exceptions, title = "Exceptions by Type — last 7 days" }) {
  return (
    <div style={styles.tableCard}>
      <div style={styles.tableTitle}>{title}</div>
      {/* rest of component unchanged */}
    </div>
  );
}
```

### `portal/src/dashboards/pipeline_health/PipelineHealth.jsx` (NEW)

Follows the same `loadArtifacts` / `useEffect` / `useState` structure as `DlqOperations.jsx`.
Reuses `HealthBanner`, `KpiCard` (×3), and `ExceptionsTable` with a custom title.
Does not use `TrendChart` or `TopSitesTable`.

```jsx
import { useEffect, useState } from "react";
import { theme } from "../../theme/cashmereTheme";
import HealthBanner from "../../components/HealthBanner.jsx";
import KpiCard from "../../components/KpiCard.jsx";
import ExceptionsTable from "../../components/ExceptionsTable.jsx";

const styles = { /* page, header, title, kpiRow, section, errorBox, loading — same as DlqOperations */ };

const DASHBOARD = "pipeline_health";

async function loadArtifacts() {
  // fetch manifest, validate status, requireArtifact("summary.json") + requireArtifact("failure_types.json"),
  // parallel fetch both, return { manifest, summary, failureTypes }
}

export default function PipelineHealth() {
  // useEffect → loadArtifacts; error/loading guards; render:
  // HealthBanner + header + 3 KpiCards + ExceptionsTable(title="Failure Types — last 24 h", exceptions=failureTypes.failure_types)
}
```

---

## Route Registration (`portal/src/dashboards/index.js`)

```js
import DlqOperations from "./dlq_operations/DlqOperations.jsx";
import PipelineHealth from "./pipeline_health/PipelineHealth.jsx";  // NEW

export const dashboards = {
  dlq_operations: DlqOperations,
  pipeline_health: PipelineHealth,  // NEW
};
```

`App.jsx` requires no changes.

---

## Verification Steps

1. `publisher run --env local --dashboard pipeline_health`
   - `artifacts/runs/<run_id>/pipeline_health/` contains 3 files
   - `artifacts/current/pipeline_health/` contains the same 3 files
   - `manifest.json` has `"status": "SUCCESS"` and `"artifacts": ["summary.json", "failure_types.json"]`
   - `summary.json` has all 3 KPI fields
   - `failure_types.json` has a non-empty `failure_types` array

2. `publisher run --env local --dashboard dlq_operations` — exits 0; same 5 artifacts as before

3. `cd portal && npm run build` — exits 0

4. Portal: `/pipeline_health` renders HealthBanner, 3 KPI cards, Failure Types table

5. Portal: `/dlq_operations` still renders correctly; ExceptionsTable title unchanged

---

## Negative Tests

5. Remove one block name from `dashboard.json` `sql_blocks` → "Missing required SQL blocks" error

6. `publisher run --env local --dashboard nonexistent` → "Dashboard config not found" error

7. Open `/pipeline_health` before running publisher → error box: "manifest.json not found (HTTP 404)"

8. Remove `"failure_types.json"` from `artifacts`, run publisher, open `/pipeline_health`
   → error box: "manifest.json does not list failure_types.json"
