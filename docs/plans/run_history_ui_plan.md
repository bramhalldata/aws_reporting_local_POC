# Run History UI — Phase 1 Implementation Plan

**Feature:** Run History UI
**Phase:** Phase 1 — List View backed by publisher-generated index
**Status:** Draft — pending review
**Date:** 2026-03-08

---

## Context

The platform writes versioned artifacts to `artifacts/runs/<run_id>/<dashboard>/` on every
publisher run, but the portal has no way to browse or inspect prior runs. Users cannot see
what ran, when, whether it succeeded, or what outputs were produced. This feature exposes
that history through a new portal page backed by a publisher-generated index artifact
(`run_history.json`).

### Key architectural constraint

Vite's `publicDir` is currently `../artifacts/current`. Only files under `artifacts/current/`
are served to the portal. The `artifacts/runs/` directory is **not** served. This plan
avoids changing `publicDir` or updating existing dashboard artifact paths by having the
publisher write a pre-built `run_history.json` index into `artifacts/current/` after each
run.

---

## Goal

- Publisher generates `artifacts/current/run_history.json` after every run, listing all
  historical run entries sourced from `artifacts/runs/`
- Portal exposes a `/history` route with a `RunHistory.jsx` list view
- NavBar gains a right-aligned "History" link (platform-level, not a dashboard plugin)
- No changes to existing dashboard view components
- No changes to `vite.config.js` or artifact serving infrastructure

---

## Data Model

### `artifacts/current/run_history.json`

One entry per `(run_id, dashboard_id)` combination, sorted by `run_id` descending
(lexicographic sort is safe because run_id is a compact ISO timestamp: `20260308T204840Z`).

```json
{
  "schema_version": "1.0.0",
  "generated_at": "2026-03-08T20:48:40+00:00",
  "runs": [
    {
      "run_id": "20260308T204840Z",
      "dashboard_id": "dlq_operations",
      "report_ts": "2026-03-08T20:48:40Z",
      "generated_at": "2026-03-08T20:48:40+00:00",
      "status": "SUCCESS",
      "artifacts": ["summary.json", "trend_30d.json", "top_sites.json", "exceptions.json"],
      "schema_version": "1.1.0"
    },
    {
      "run_id": "20260308T204840Z",
      "dashboard_id": "pipeline_health",
      "report_ts": "2026-03-08T20:48:40Z",
      "generated_at": "2026-03-08T20:48:40+00:00",
      "status": "SUCCESS",
      "artifacts": ["summary.json", "failure_types.json"],
      "schema_version": "1.1.0"
    }
  ]
}
```

**Notes:**
- Each entry is one dashboard run, not one cross-dashboard batch run
- `status` is always `"SUCCESS"` in Phase 1 — the publisher exits with `sys.exit(1)` on
  failure before artifacts are written; failed runs are not recorded in the history
- `artifact_list` comes directly from the run's `manifest.json`

---

## Files to Create

| File | Purpose |
|------|---------|
| `portal/src/pages/RunHistory.jsx` | Run history list view component |
| `portal/src/pages/` | New directory for platform-level pages (not dashboard plugins) |
| `src/publisher/validators/run_history_schema.py` | JSON schema validator for `run_history.json` |

---

## Files to Modify

| File | Change |
|------|--------|
| `src/publisher/main.py` | Add `import glob`; add `run_history_schema` to validator imports; add `_rebuild_run_history()` helper; call it at end of `run()` |
| `portal/src/App.jsx` | Add `import RunHistory`; add `/history` route inside layout route |
| `portal/src/components/NavBar.jsx` | Add right-aligned History `NavLink`; add `platformLinks` style |

---

## Unchanged Components

- `portal/src/dashboards/dlq_operations/DlqOperations.jsx`
- `portal/src/dashboards/pipeline_health/PipelineHealth.jsx`
- `portal/src/AppShell.jsx`
- `portal/src/dashboards/index.js`
- `portal/src/theme/cashmereTheme.js` (reuses existing semantic color tokens)
- `portal/vite.config.js`
- All SQL, validators (existing), artifact schemas

---

## Publisher Changes (`src/publisher/main.py`)

### 1. Add `import glob` to stdlib imports

```python
import glob
import json
import os
import re
import shutil
import sys
from datetime import datetime, timezone
```

### 2. Add `run_history_schema` to validator imports

```python
from validators import (
    exceptions_schema,
    manifest_schema,
    pipeline_health_failure_types_schema,
    pipeline_health_summary_schema,
    run_history_schema,               # NEW
    summary_schema,
    top_sites_schema,
    trend_30d_schema,
)
```

### 3. Add `_rebuild_run_history()` helper function

Place after `validate_required_blocks()` and before `run()`:

```python
def _rebuild_run_history(generated_at: str) -> None:
    """Scan artifacts/runs/ and rebuild artifacts/current/run_history.json.

    Called at the end of every successful publisher run. Reads all manifest.json
    files under ARTIFACTS_RUNS_DIR, assembles a sorted list of run entries, validates
    against run_history_schema, and writes to ARTIFACTS_CURRENT_DIR/run_history.json.
    """
    runs = []
    pattern = os.path.join(ARTIFACTS_RUNS_DIR, "*", "*", "manifest.json")
    for manifest_path in sorted(glob.glob(pattern)):
        try:
            with open(manifest_path, encoding="utf-8") as f:
                m = json.load(f)
            # Extract dashboard_id from path: runs/<run_id>/<dashboard_id>/manifest.json
            parts = os.path.normpath(manifest_path).split(os.sep)
            dashboard_id = parts[-2]
            runs.append({
                "run_id":         m["run_id"],
                "dashboard_id":   dashboard_id,
                "report_ts":      m["report_ts"],
                "generated_at":   m["generated_at"],
                "status":         m["status"],
                "artifacts":      m["artifacts"],
                "schema_version": m["schema_version"],
            })
        except (KeyError, json.JSONDecodeError):
            pass  # Skip malformed or incomplete manifests

    # Sort: most recent run_id first; within same run_id, alphabetical dashboard order
    runs.sort(key=lambda r: (r["run_id"], r["dashboard_id"]), reverse=True)

    run_history = {
        "schema_version": "1.0.0",
        "generated_at":   generated_at,
        "runs":           runs,
    }

    try:
        run_history_schema.validate(run_history)
    except jsonschema.ValidationError as exc:
        print(f"ERROR: run_history.json schema validation failed: {exc.message}", file=sys.stderr)
        sys.exit(1)

    history_path = os.path.join(ARTIFACTS_CURRENT_DIR, "run_history.json")
    with open(history_path, "w", encoding="utf-8") as f:
        json.dump(run_history, f, indent=2, sort_keys=True)

    print(f"  history        : {history_path} ({len(runs)} entries)")
```

### 4. Call `_rebuild_run_history()` at the end of `run()`

At the end of the `run()` function, after step 9 (the report prints), add:

```python
    # 10. Rebuild run history index.
    _rebuild_run_history(generated_at)
```

---

## Validator (`src/publisher/validators/run_history_schema.py`)

```python
"""
run_history_schema.py

JSON Schema validator for run_history.json.
Schema changes must also be reflected in docs/json-contracts.md.
"""

import jsonschema

SCHEMA_VERSION = "1.0.0"

RUN_HISTORY_SCHEMA = {
    "type": "object",
    "required": ["schema_version", "generated_at", "runs"],
    "additionalProperties": False,
    "properties": {
        "schema_version": {"type": "string"},
        "generated_at":   {"type": "string"},
        "runs": {
            "type": "array",
            "items": {
                "type": "object",
                "required": [
                    "run_id", "dashboard_id", "report_ts", "generated_at",
                    "status", "artifacts", "schema_version",
                ],
                "additionalProperties": False,
                "properties": {
                    "run_id":         {"type": "string"},
                    "dashboard_id":   {"type": "string"},
                    "report_ts":      {"type": "string"},
                    "generated_at":   {"type": "string"},
                    "status":         {"type": "string", "enum": ["SUCCESS", "FAILURE"]},
                    "artifacts":      {"type": "array", "items": {"type": "string"}},
                    "schema_version": {"type": "string"},
                },
            },
        },
    },
}


def validate(artifact: dict) -> None:
    """Validate a run_history artifact dict. Raises ValidationError on failure."""
    jsonschema.validate(instance=artifact, schema=RUN_HISTORY_SCHEMA)
```

---

## Portal Changes

### 1. `portal/src/App.jsx` — add `/history` route

```jsx
import { Routes, Route, Navigate } from "react-router-dom";
import { dashboards, dashboardMeta } from "./dashboards/index.js";
import AppShell from "./AppShell.jsx";
import RunHistory from "./pages/RunHistory.jsx";    // NEW

const defaultPath = `/${dashboardMeta[0].id}`;

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        {Object.entries(dashboards).map(([id, Component]) => (
          <Route key={id} path={`/${id}`} element={<Component />} />
        ))}
        <Route path="/history" element={<RunHistory />} />    {/* NEW */}
        <Route path="*" element={<Navigate to={defaultPath} replace />} />
      </Route>
    </Routes>
  );
}
```

---

### 2. `portal/src/components/NavBar.jsx` — add History link

Add `platformLinks` style and a right-aligned History `NavLink`. The `marginLeft: "auto"`
on `platformLinks` pushes it to the right of the flex container, visually separating
platform-level links from dashboard tab links.

Add to `styles`:

```javascript
  platformLinks: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "stretch",
    height: "100%",
  },
```

Add after the `<div style={styles.tabList}>` closing tag in JSX:

```jsx
      <div style={styles.platformLinks}>
        <NavLink
          to="/history"
          style={({ isActive }) => styles.tab(isActive)}
        >
          History
        </NavLink>
      </div>
```

Full updated NavBar return block:

```jsx
  return (
    <nav style={styles.nav}>
      <span style={styles.brand}>Reporting Platform</span>
      <div style={styles.tabList}>
        {dashboardMeta.map(({ id, label }) => (
          <NavLink
            key={id}
            to={`/${id}`}
            style={({ isActive }) => styles.tab(isActive)}
          >
            {label}
          </NavLink>
        ))}
      </div>
      <div style={styles.platformLinks}>
        <NavLink
          to="/history"
          style={({ isActive }) => styles.tab(isActive)}
        >
          History
        </NavLink>
      </div>
    </nav>
  );
```

---

### 3. `portal/src/pages/RunHistory.jsx` — new list view

Reads `/run_history.json` from the portal static file server. Renders a sortable table of
all run entries. Reuses Cashmere theme semantic colors for status pills. Follows the same
`useEffect` / `useState` / error+loading guard pattern as `DlqOperations.jsx`.

```jsx
import { useEffect, useState } from "react";
import { theme } from "../theme/cashmereTheme";

const styles = {
  page: {
    maxWidth: 900,
    margin: "0 auto",
    padding: "2rem 1.5rem",
    background: theme.background,
    minHeight: "100vh",
  },
  header: {
    marginBottom: "2rem",
    borderBottom: `2px solid ${theme.border}`,
    paddingBottom: "1rem",
  },
  title: {
    fontSize: "1.75rem",
    fontWeight: 700,
    color: theme.textPrimary,
  },
  meta: {
    fontSize: "0.8rem",
    color: theme.textMuted,
    marginTop: "0.35rem",
  },
  tableCard: {
    background: theme.surface,
    border: `1px solid ${theme.border}`,
    borderRadius: 8,
    overflow: "hidden",
    boxShadow: "0 1px 3px rgba(0,0,0,.06)",
  },
  table: { width: "100%", borderCollapse: "collapse" },
  th: {
    textAlign: "left",
    padding: "0.65rem 1.25rem",
    fontSize: "0.75rem",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.07em",
    color: theme.textSecondary,
    background: theme.background,
    borderBottom: `1px solid ${theme.border}`,
  },
  td: {
    padding: "0.65rem 1.25rem",
    fontSize: "0.875rem",
    borderBottom: `1px solid ${theme.divider}`,
    verticalAlign: "middle",
  },
  runId: {
    fontFamily: "monospace",
    fontSize: "0.8rem",
    color: theme.textSecondary,
  },
  dashboardBadge: {
    display: "inline-block",
    fontSize: "0.75rem",
    padding: "0.2rem 0.6rem",
    borderRadius: 4,
    background: theme.divider,
    color: theme.textPrimary,
    fontWeight: 500,
  },
  statusPill: (status) => ({
    display: "inline-block",
    fontSize: "0.75rem",
    fontWeight: 600,
    padding: "0.2rem 0.6rem",
    borderRadius: 999,
    background: status === "SUCCESS" ? theme.successBg : theme.errorBg,
    color:      status === "SUCCESS" ? theme.successText : theme.errorText,
    border:     `1px solid ${status === "SUCCESS" ? theme.successBorder : theme.errorBorder}`,
  }),
  artifacts: {
    fontSize: "0.8rem",
    color: theme.textMuted,
  },
  errorBox: {
    background: theme.errorBg,
    border: `1px solid ${theme.errorBorder}`,
    borderRadius: 8,
    padding: "1.25rem 1.5rem",
    color: theme.errorText,
    fontWeight: 500,
  },
  loading: { color: theme.textSecondary, fontSize: "0.95rem" },
  empty: {
    padding: "2rem 1.25rem",
    color: theme.textMuted,
    fontSize: "0.875rem",
    textAlign: "center",
  },
};

async function loadHistory() {
  const res = await fetch("/run_history.json");
  if (!res.ok) {
    throw new Error(
      `run_history.json not found (HTTP ${res.status}). ` +
      `Run the publisher first: publisher run --env local --dashboard <name>`
    );
  }
  return res.json();
}

function formatTs(isoString) {
  return isoString.replace("T", " ").replace("+00:00", " UTC").replace("Z", " UTC");
}

export default function RunHistory() {
  const [history, setHistory] = useState(null);
  const [error, setError]     = useState(null);

  useEffect(() => {
    loadHistory().then(setHistory).catch((err) => setError(err.message));
  }, []);

  if (error)
    return <div style={styles.page}><div style={styles.errorBox}>Error: {error}</div></div>;
  if (!history)
    return <div style={styles.page}><p style={styles.loading}>Loading run history...</p></div>;

  const { runs, generated_at } = history;

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.title}>Run History</h1>
        <p style={styles.meta}>
          {runs.length} run{runs.length !== 1 ? "s" : ""} recorded
          {" · "}Index generated {formatTs(generated_at)}
        </p>
      </header>

      <div style={styles.tableCard}>
        {runs.length === 0 ? (
          <div style={styles.empty}>
            No runs recorded yet. Run the publisher to see history here.
          </div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Run ID</th>
                <th style={styles.th}>Dashboard</th>
                <th style={styles.th}>Report Time</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Artifacts</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={`${run.run_id}-${run.dashboard_id}`}>
                  <td style={{ ...styles.td, ...styles.runId }}>{run.run_id}</td>
                  <td style={styles.td}>
                    <span style={styles.dashboardBadge}>{run.dashboard_id}</span>
                  </td>
                  <td style={styles.td}>{formatTs(run.report_ts)}</td>
                  <td style={styles.td}>
                    <span style={styles.statusPill(run.status)}>{run.status}</span>
                  </td>
                  <td style={{ ...styles.td, ...styles.artifacts }}>
                    {run.artifacts.join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
```

---

## Future Considerations (out of Phase 1 scope)

### Phase 2: Detail view

To support a run detail page (`/history/:runId/:dashboardId`), the portal would need to
fetch individual run artifacts from `artifacts/runs/<runId>/<dashboardId>/`. This requires
either changing `vite.config.js` `publicDir` from `../artifacts/current` to `../artifacts`
(and updating all dashboard artifact paths to use `/current/<dashboard>/` prefix via the
`useArtifactPath` hook) — or serving runs via a separate static file server.

### Phase 2: Multi-client / multi-environment

In a multi-client deployment, `run_history.json` would be client-scoped:
- Phase 1: `/run_history.json` (current, local)
- Phase 2: `/:clientId/:env/run_history.json`

The `useArtifactPath` hook introduced in the navigation feature is the correct extension
point for injecting client/env scope at fetch time. The `RunHistory.jsx` component should
adopt this hook when Phase 2 client scoping is introduced.

### Phase 2: Status FAILURE

Currently the publisher exits with `sys.exit(1)` before writing any artifacts on failure,
so failed runs are never recorded. Phase 2 could add a "fail-safe write" that captures
partial run state and a FAILURE status entry in the history.

---

## Verification Steps

### 1. Publisher generates history index

```
publisher run --env local --dashboard dlq_operations
publisher run --env local --dashboard pipeline_health
```

Expected:
- Output includes `  history        : .../artifacts/current/run_history.json (N entries)`
- `artifacts/current/run_history.json` exists
- File contains `"runs"` array with entries for both dashboards
- Entries sorted by `run_id` descending

### 2. Portal history page loads

```
cd portal && npm run dev
```

Open `http://localhost:5173/history`:
- NavBar shows "History" link on the right, highlighted as active
- Page title: "Run History"
- Meta line: "N runs recorded · Index generated ..."
- Table rows: one per `(run_id, dashboard_id)` combination, most recent first
- Status pills are green (SUCCESS)
- Artifact lists match the artifacts column in each manifest

### 3. NavBar active state

- Navigate to `/dlq_operations` → "DLQ Operations" tab highlighted; "History" not highlighted
- Navigate to `/history` → "History" highlighted; no dashboard tab highlighted

### 4. Existing dashboards unaffected

- `/dlq_operations` loads correctly with HealthBanner, KPIs, trend, tables
- `/pipeline_health` loads correctly with HealthBanner, 3 KPIs, failure types table

### 5. Production build

```
cd portal && npm run build
```

Exits 0.

---

## Negative Tests

1. **No history file:** Delete `artifacts/current/run_history.json`, open `/history`
   → Error box: `run_history.json not found (HTTP 404). Run the publisher first...`

2. **Unknown route still redirects:** Navigate to `/nonexistent`
   → Redirects to `/dlq_operations` (default from `dashboardMeta[0].id`)

3. **History with no runs:** Delete `artifacts/runs/` entirely, run publisher once, open `/history`
   → Shows "No runs recorded yet..." if run_history.json is empty or has 0 entries

4. **Publisher run still produces dashboard artifacts:** After implementing, run publisher
   → Both `artifacts/current/dlq_operations/` and `artifacts/current/pipeline_health/` update normally;
   → `run_history.json` is regenerated with the new run entry prepended

---

## Implementation Output Template

When complete, report:

```
Files created:
- portal/src/pages/RunHistory.jsx
- src/publisher/validators/run_history_schema.py

Files modified:
- src/publisher/main.py  (import glob, run_history_schema; add _rebuild_run_history; call in run())
- portal/src/App.jsx     (add /history route)
- portal/src/components/NavBar.jsx  (add right-aligned History link)

Artifact produced:
- artifacts/current/run_history.json

Verification:
- publisher run exits 0 with history output line
- /history renders run list
- /dlq_operations and /pipeline_health render without regression
- npm run build exits 0
```
