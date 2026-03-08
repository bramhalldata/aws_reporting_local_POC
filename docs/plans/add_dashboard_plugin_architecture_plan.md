# Plan: Multi-Dashboard Plugin Architecture

## Context

The publisher and portal currently support a single hardcoded dashboard (`dlq_operations`).
The `--dashboard` CLI argument is parsed and passed through but is **never used** inside
`run()` — all 6 SQL blocks execute unconditionally and all 5 artifacts are always written.

This plan evolves the platform into a plugin-style architecture where each dashboard is
declared in a config file. The publisher reads the config to select which SQL blocks to
execute and which artifacts to produce. The portal gains routing so multiple dashboards
can be rendered. `dlq_operations` migrates to the new model with no change to the CLI.

---

## Architecture Compliance

| Requirement | How it is met |
|-------------|---------------|
| Metrics stay in SQL | Single `sql/athena_views.sql`; dashboard config selects which blocks to run |
| Publisher deterministic | Dashboard config is read-only input; output is deterministic given config + data |
| Portal presentation-only | `App.jsx` becomes a router shell; per-dashboard views remain artifact-driven |
| Artifacts remain the contract | No schema changes; artifact paths gain a `<dashboard>/` subdirectory |
| `dlq_operations` works unchanged | Same CLI command; same artifacts; config mirrors current hardcoded behavior |
| Local POC still works | Same `publisher run --env local --dashboard dlq_operations` |

---

## Design Question Answers

| Question | Decision | Rationale |
|----------|----------|-----------|
| Who declares artifacts — dashboard or publisher? | **Dashboard config** | Decouples dashboard definition from publisher code |
| YAML or JSON for config? | **JSON** | `json` is already imported in `main.py`; no new dependency; sufficient for POC |
| Should portal discover dashboards dynamically? | **No — static registry** | A static `dashboards/index.js` map is sufficient; dynamic discovery adds complexity without benefit now |
| Publisher publishes multiple dashboards per run? | **No — one dashboard per run** | Matches production model; multi-dashboard = multiple CLI invocations |
| How does the portal route dashboards? | **React Router v6, URL-based** | `/dlq_operations`, `/pipeline_health`, etc.; each route renders the dashboard-specific view |

---

## Proposed Directory Structure

```
dashboards/                              ← NEW: dashboard plugin configs
  dlq_operations/
    dashboard.json                       ← dashboard metadata, SQL blocks, artifact list

portal/src/
  components/                            ← NEW: shared presentation components
    HealthBanner.jsx                     ← extracted from App.jsx
    KpiCard.jsx                          ← extracted from App.jsx
    TrendChart.jsx                       ← extracted from App.jsx
    TopSitesTable.jsx                    ← extracted from App.jsx
    ExceptionsTable.jsx                  ← extracted from App.jsx
  dashboards/                            ← NEW: per-dashboard views (compose shared components)
    dlq_operations/
      DlqOperations.jsx                  ← data loading + layout; imports from components/
    index.js                             ← registry: dashboard_id → component
  theme/
    cashmereTheme.js                     ← unchanged
  App.jsx                                ← router shell (replaces current dashboard logic)
  main.jsx                               ← adds BrowserRouter

artifacts/
  runs/
    20260308T000302Z/
      dlq_operations/                    ← dashboard-scoped run output
        summary.json
        trend_30d.json
        top_sites.json
        exceptions.json
        manifest.json
  current/
    dlq_operations/                      ← portal reads /dlq_operations/manifest.json
      summary.json
      trend_30d.json
      top_sites.json
      exceptions.json
      manifest.json
```

---

## Files Changed

| File | Change |
|------|--------|
| `dashboards/dlq_operations/dashboard.json` (NEW) | Dashboard config (JSON): title, SQL blocks, artifacts, portal route |
| `src/publisher/main.py` | Load `dashboard.json` via `json` (already imported); remove hardcoded `REQUIRED_BLOCKS`; scope SQL execution and output paths to `<dashboard>/` subdirectory |
| `portal/src/components/HealthBanner.jsx` (NEW) | Extracted from `App.jsx` verbatim |
| `portal/src/components/KpiCard.jsx` (NEW) | Extracted from `App.jsx` verbatim |
| `portal/src/components/TrendChart.jsx` (NEW) | Extracted from `App.jsx` verbatim |
| `portal/src/components/TopSitesTable.jsx` (NEW) | Extracted from `App.jsx` verbatim |
| `portal/src/components/ExceptionsTable.jsx` (NEW) | Extracted from `App.jsx` verbatim |
| `portal/src/dashboards/dlq_operations/DlqOperations.jsx` (NEW) | Data loading + layout; imports all panels from `components/` |
| `portal/src/dashboards/index.js` (NEW) | `{ dlq_operations: DlqOperations }` registry |
| `portal/src/App.jsx` | Becomes router shell; all dashboard logic moved to `DlqOperations.jsx` |
| `portal/src/main.jsx` | Wrap in `<BrowserRouter>` |
| `portal/package.json` | Add `react-router-dom@^6` |
| `portal/vite.config.js` | No change — `publicDir: "../artifacts/current"` still correct |
| `pyproject.toml` | No change — `json` is stdlib |

**Unchanged:** `src/publisher/cli.py`, all validators, `sql/athena_views.sql`

---

## Dashboard Configuration Format

### `dashboards/dlq_operations/dashboard.json`

```json
{
  "dashboard_id": "dlq_operations",
  "title": "DLQ Operations",
  "description": "Monitors DLQ failure rates and site-level breakdowns.",
  "portal_route": "/dlq_operations",
  "sql_blocks": [
    "failures_last_24h",
    "failures_last_7d",
    "top_sites_by_failures",
    "trend_30d",
    "top_sites_30d",
    "exceptions_7d"
  ],
  "artifacts": [
    "summary.json",
    "trend_30d.json",
    "top_sites.json",
    "exceptions.json"
  ]
}
```

`sql_blocks` lists the block names from `sql/athena_views.sql` this dashboard requires.
The publisher validates all declared blocks exist before executing any queries.

`artifacts` drives the manifest `artifacts` list and the `current/` copy loop.

---

## Publisher Loading Logic (main.py changes)

### New path constant

```python
DASHBOARDS_DIR = os.path.join(REPO_ROOT, "dashboards")
```

### New helper: `load_dashboard_config()`

Uses `json` (already imported — no new dependency):

```python
def load_dashboard_config(dashboard_id: str) -> dict:
    config_path = os.path.join(DASHBOARDS_DIR, dashboard_id, "dashboard.json")
    if not os.path.exists(config_path):
        print(f"ERROR: Dashboard config not found: {config_path}", file=sys.stderr)
        sys.exit(1)
    with open(config_path, encoding="utf-8") as f:
        return json.load(f)
```

### Changes inside `run()`

```python
# Early in run():
config = load_dashboard_config(dashboard)
required_blocks = set(config["sql_blocks"])
artifact_list   = config["artifacts"]   # drives manifest and copy loop

# Output paths include the dashboard subdirectory:
run_dir     = os.path.join(ARTIFACTS_RUNS_DIR, run_id, dashboard)
current_dir = os.path.join(ARTIFACTS_CURRENT_DIR, dashboard)
```

The module-level `REQUIRED_BLOCKS` constant is removed. `validate_required_blocks()`
receives `required_blocks` from config instead.

SQL query execution and artifact assembly code are unchanged. The config controls which
blocks are required and which artifact filenames are copied to `current/`.

---

## Shared Portal Components

The existing `App.jsx` contains five presentation components that are dashboard-agnostic.
They are extracted into `portal/src/components/` so every future dashboard view can
import and compose them without duplicating code.

| Component | Current location | New location |
|-----------|-----------------|--------------|
| `HealthBanner` | `App.jsx` | `portal/src/components/HealthBanner.jsx` |
| `KpiCard` | `App.jsx` | `portal/src/components/KpiCard.jsx` |
| `TrendChart` | `App.jsx` | `portal/src/components/TrendChart.jsx` |
| `TopSitesTable` | `App.jsx` | `portal/src/components/TopSitesTable.jsx` |
| `ExceptionsTable` | `App.jsx` | `portal/src/components/ExceptionsTable.jsx` |

The helper functions `getBannerStyle()` and `getStatusPillStyle()` and the `styles` object
move with `HealthBanner.jsx` or can live in a shared `styles.js` — whichever is cleaner
during extraction.

`DlqOperations.jsx` composes these shared components:

```jsx
import HealthBanner from "../../components/HealthBanner.jsx";
import KpiCard from "../../components/KpiCard.jsx";
import TrendChart from "../../components/TrendChart.jsx";
import TopSitesTable from "../../components/TopSitesTable.jsx";
import ExceptionsTable from "../../components/ExceptionsTable.jsx";
```

The data-loading logic (`loadArtifacts()`) and the `useEffect`/`useState` wiring move into
`DlqOperations.jsx`, with fetch URLs updated to include the dashboard prefix:

```js
// Before:  fetch("/manifest.json")
// After:   fetch("/dlq_operations/manifest.json")

// Before:  fetch(`/${filename}`)
// After:   fetch(`/dlq_operations/${filename}`)
```

---

## Portal Routing Model

### `portal/src/main.jsx` — add BrowserRouter

```jsx
import { BrowserRouter } from "react-router-dom";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
```

### `portal/src/dashboards/index.js` — registry

```js
import DlqOperations from "./dlq_operations/DlqOperations.jsx";

export const dashboards = {
  dlq_operations: DlqOperations,
};
```

### `portal/src/App.jsx` — router shell

```jsx
import { Routes, Route, Navigate } from "react-router-dom";
import { dashboards } from "./dashboards/index.js";

export default function App() {
  return (
    <Routes>
      {Object.entries(dashboards).map(([id, Component]) => (
        <Route key={id} path={`/${id}`} element={<Component />} />
      ))}
      <Route path="*" element={<Navigate to="/dlq_operations" replace />} />
    </Routes>
  );
}
```

### `portal/vite.config.js` — no change

`publicDir: "../artifacts/current"` still correct. The `dlq_operations/` subdirectory
is served at `/dlq_operations/`, so `/dlq_operations/manifest.json` resolves to
`artifacts/current/dlq_operations/manifest.json`.

---

## Artifact Directory Changes

### Before

```
artifacts/current/
  manifest.json
  summary.json
  trend_30d.json
  top_sites.json
  exceptions.json
```

### After

```
artifacts/current/
  dlq_operations/
    manifest.json
    summary.json
    trend_30d.json
    top_sites.json
    exceptions.json
```

Old flat `artifacts/current/*.json` files remain on disk but are no longer written to.

---

## Backward Compatibility Strategy

| Concern | Resolution |
|---------|-----------|
| CLI command unchanged | `publisher run --env local --dashboard dlq_operations` works identically |
| Portal default URL | `http://localhost:5173` → redirects to `/dlq_operations` via catch-all `Navigate` |
| Old `artifacts/current/*.json` | Left on disk; not deleted; not updated |
| Old run folders without `<dashboard>/` subdir | Left on disk; not touched |
| `python src/publisher/main.py` legacy path | Still works; hardcoded `dashboard="dlq_operations"` |

---

## Migration Path for dlq_operations

1. Create `dashboards/dlq_operations/dashboard.json`
2. Update `main.py`: add `load_dashboard_config()`; remove `REQUIRED_BLOCKS`; update output paths
3. Extract shared components from `App.jsx` into `portal/src/components/`
4. Create `portal/src/dashboards/dlq_operations/DlqOperations.jsx` (data loading + layout)
5. Create `portal/src/dashboards/index.js` registry
6. Rewrite `portal/src/App.jsx` as router shell
7. Update `portal/src/main.jsx` with `BrowserRouter`
8. Add `react-router-dom` to `portal/package.json` and run `npm install`

---

## How to Add a Future Dashboard

What changes depends on how much is new vs. reused.

### Case A: New dashboard using existing artifact types and existing components

Example: a second operational dashboard whose metrics fit the existing `summary.json`,
`top_sites.json`, and `trend_30d.json` schemas.

Required work:
1. Add SQL blocks to `sql/athena_views.sql`
2. Create `dashboards/<id>/dashboard.json`
3. Create `portal/src/dashboards/<id>/<View>.jsx` — compose existing shared components
4. Register in `portal/src/dashboards/index.js`

No changes to publisher core, CLI, validators, or routing infrastructure.

### Case B: New dashboard introducing new artifact types or new visualizations

Example: a pipeline health dashboard requiring a new `pipeline_runs.json` artifact with
its own schema, and a new Gantt-style chart component.

Required work (in addition to Case A steps):
- Define a new JSON schema in `src/publisher/validators/`
- Add artifact assembly code in `src/publisher/main.py` for the new artifact
- Add a new shared component in `portal/src/components/` for the new visualization

The platform core (CLI, config loading, routing, versioned artifact paths) does not change,
but writing new artifact types and new visualizations always requires code — that is
expected and correct for the layer that owns each concern.

---

## Verification Steps

### Positive tests

1. `publisher run --env local --dashboard dlq_operations`
   - `artifacts/runs/<run_id>/dlq_operations/` created with 5 files
   - `artifacts/current/dlq_operations/` created with 5 files
   - `artifacts/current/dlq_operations/manifest.json` contains `"run_id"` and `"status": "SUCCESS"`

2. `cd portal && npm install` — installs `react-router-dom`

3. `cd portal && npm run dev`
   - `http://localhost:5173` redirects to `/dlq_operations`
   - Dashboard renders with all panels (HealthBanner, KPI cards, chart, tables)

4. `cd portal && npm run build` — exits 0

### Negative tests

5. `publisher run --env local --dashboard nonexistent`
   - Exits with: `ERROR: Dashboard config not found: dashboards/nonexistent/dashboard.json`

6. Temporarily remove a SQL block name from `dashboard.json`, run publisher
   - Exits with "Missing required SQL blocks" error

7. Navigate to `/pipeline_health` in portal (unregistered dashboard)
   - React Router `Navigate` catch-all redirects to `/dlq_operations`

8. Inspect old `artifacts/current/manifest.json` (flat location)
   - Unchanged; `generated_at` pre-dates this change (old path is not being updated)

9. Validate no new Python dependency was introduced
   - `pip show pyyaml` not required; `publisher run` exits 0 after a clean `pip install -e .`
