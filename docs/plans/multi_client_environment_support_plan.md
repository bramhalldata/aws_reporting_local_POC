# Multi-Client & Multi-Environment Support — Implementation Plan

**Feature:** Multi-Client & Multi-Environment Support
**Output artifact:** `docs/plans/multi_client_environment_support_plan.md`
**Date:** 2026-03-09
**Status:** Draft — pending review

---

## Context

The platform currently supports one implicit client and one implicit environment. Artifacts live at `artifacts/current/` and `artifacts/runs/`. The portal has no client or environment concept in its routing.

This plan introduces `client_id` and `env_id` as first-class dimensions across:
- artifact storage layout
- `run_history.json` schema
- portal routing
- artifact URL resolution
- publisher path computation

The goal is to allow multiple clients (e.g., `contexture`, `sacvalley`, `banner`) and multiple environments per client (`prod`, `staging`, `local`) to operate with isolated artifact trees, isolated run histories, and independently deep-linkable portal URLs.

---

## 1. Architecture Overview

Client and environment propagate as a single prefix `{client_id}/{env_id}` through every layer:

```
publisher run --client contexture --env prod --dashboard dlq_operations
        │
        ▼
Publisher (main.py)
  Computes scoped roots:
    artifacts_runs_dir    = artifacts/contexture/prod/runs/
    artifacts_current_dir = artifacts/contexture/prod/current/
  Writes:
    artifacts/contexture/prod/runs/<run_id>/dlq_operations/
    artifacts/contexture/prod/current/dlq_operations/
    artifacts/contexture/prod/current/run_history.json
        │
        ▼
Artifact tree (local / S3)
  Vite publicDir: ../artifacts  (unchanged — serves entire artifacts/ tree)
  /contexture/prod/current/dlq_operations/summary.json
  /contexture/prod/runs/<runId>/dlq_operations/summary.json
        │
        ▼
Portal routing: /:client/:env/*
  useParams() provides { client, env } to every component in the subtree
        │
        ▼
useArtifactPath(dashboardId)
  const { client, env } = useParams();
  → /{client}/{env}/current/{dashboardId}/{filename}
        │
        ▼
RunDetail: artifact.path = "contexture/prod/runs/<runId>/dlq_operations/summary.json"
  href={`/${artifact.path}`}  → /contexture/prod/runs/...  (zero code change)
```

**Key principle:** `client` and `env` are URL-prefix state, not application state. They propagate automatically via `useParams()` — no React context, no prop drilling, no global store.

---

## 2. Artifact Storage Layout

### Target structure

```
artifacts/
  {client_id}/
    {env_id}/
      current/
        {dashboard_id}/
          manifest.json
          summary.json ...
        run_history.json
      runs/
        {run_id}/
          {dashboard_id}/
            manifest.json
            summary.json ...
```

### Concrete example

```
artifacts/
  contexture/
    prod/
      current/
        dlq_operations/  pipeline_health/
        run_history.json
      runs/20260309T140000Z/dlq_operations/
    staging/
      current/ ...
  acme_health/
    prod/
      current/ ...
  default/
    prod/         ← backwards-compat fallback
      current/ ...
    local/        ← local dev default
      current/ ...
```

`publicDir: ../artifacts` (unchanged) — Vite and S3/CloudFront serve the full tree from root. No infrastructure change required.

---

## 3. run_history.json Contract: v1.1.0 → v1.2.0

### What changes

- Envelope gains required fields `client_id` and `env_id`
- `artifact.path` values gain the `{client_id}/{env_id}/` prefix
- `schema_version` bumps to `"1.2.0"`

### v1.2.0 envelope

```json
{
  "schema_version": "1.2.0",
  "client_id": "contexture",
  "env_id": "prod",
  "generated_at": "2026-03-09T14:00:00+00:00",
  "runs": [...]
}
```

### v1.2.0 artifact object (path scoped)

```json
{ "name": "summary.json", "type": "summary",
  "path": "contexture/prod/runs/20260309T140000Z/dlq_operations/summary.json" }
```

`RunDetail.jsx` renders `href={`/${artifact.path}`}` — **no code change required**.

### Schema history

| Version | Change |
|---------|--------|
| `1.0.0` | Initial: `artifacts` bare filename strings |
| `1.1.0` | `artifacts` → structured objects `{name, type, path}` |
| `1.2.0` | Envelope gains `client_id`, `env_id`; `artifact.path` gains `{client}/{env}/` prefix |

---

## 4. Publisher Changes (`src/publisher/main.py`)

### Remove module-level constants; add base constant

```python
# Remove:
ARTIFACTS_RUNS_DIR    = os.path.join(REPO_ROOT, "artifacts", "runs")
ARTIFACTS_CURRENT_DIR = os.path.join(REPO_ROOT, "artifacts", "current")

# Add:
ARTIFACTS_BASE_DIR = os.path.join(REPO_ROOT, "artifacts")
```

### Compute scoped paths inside `run()` (early, after parameter receipt)

```python
client_id = client or "default"
env_id    = env
artifacts_runs_dir    = os.path.join(ARTIFACTS_BASE_DIR, client_id, env_id, "runs")
artifacts_current_dir = os.path.join(ARTIFACTS_BASE_DIR, client_id, env_id, "current")
```

Replace all downstream references to removed constants with the local variables:
```python
run_dir     = os.path.join(artifacts_runs_dir, run_id, dashboard)
current_dir = os.path.join(artifacts_current_dir, dashboard)
```

### Update `_rebuild_run_history()` signature

```python
def _rebuild_run_history(generated_at: str, *, client_id: str, env_id: str) -> None:
```

**Scan pattern:** scoped to `artifacts/{client_id}/{env_id}/runs/`
```python
runs_dir = os.path.join(ARTIFACTS_BASE_DIR, client_id, env_id, "runs")
pattern  = os.path.join(runs_dir, "*", "*", "manifest.json")
```

**Artifact path enrichment:** gains client/env prefix
```python
"path": f"{client_id}/{env_id}/runs/{m['run_id']}/{dashboard_id}/{filename}"
```

**Envelope:** new fields and version
```python
run_history = {
    "schema_version": "1.2.0",
    "client_id":      client_id,
    "env_id":         env_id,
    "generated_at":   generated_at,
    "runs":           runs,
}
```

**Write path:** scoped current dir
```python
current_dir  = os.path.join(ARTIFACTS_BASE_DIR, client_id, env_id, "current")
os.makedirs(current_dir, exist_ok=True)
history_path = os.path.join(current_dir, "run_history.json")
```

### Update call site and `__main__` block

```python
# Call site:
_rebuild_run_history(generated_at, client_id=client_id, env_id=env_id)

# __main__:
run(report_ts, env="local", dashboard="dlq_operations", client="default")
```

---

## 5. Portal Changes

### 5a. `useArtifactPath.js` — highest-leverage change

```js
import { useParams } from "react-router-dom";

export function useArtifactPath(dashboardId) {
  const { client, env } = useParams();
  return (filename) => `/${client}/${env}/current/${dashboardId}/${filename}`;
}
```

`DlqOperations.jsx` and `PipelineHealth.jsx` need **zero changes**. The hook resolves paths correctly for any client/env automatically.

### 5b. `App.jsx` — routing restructure

```jsx
const DEFAULT_CLIENT   = "default";
const DEFAULT_ENV      = "prod";
const defaultDashboard = dashboardMeta[0].id;

export default function App() {
  return (
    <Routes>
      <Route path="/:client/:env" element={<AppShell />}>
        {Object.entries(dashboards).map(([id, Component]) => (
          <Route key={id} path={id} element={<Component />} />
        ))}
        <Route path="history/:runId/:dashboardId" element={<RunDetail />} />
        <Route path="history" element={<RunHistory />} />
        <Route path="*" element={<Navigate to={defaultDashboard} replace />} />
      </Route>

      {/* Legacy redirects — wrapper components needed to access useParams() */}
      <Route path="/history/:runId/:dashboardId" element={<LegacyRunDetailRedirect />} />
      <Route path="/history" element={<LegacyHistoryRedirect />} />
      <Route path="*" element={<Navigate to={`/${DEFAULT_CLIENT}/${DEFAULT_ENV}/${defaultDashboard}`} replace />} />
    </Routes>
  );
}

function LegacyHistoryRedirect() {
  const navigate = useNavigate();
  useEffect(() => { navigate(`/${DEFAULT_CLIENT}/${DEFAULT_ENV}/history`, { replace: true }); }, []);
  return null;
}

function LegacyRunDetailRedirect() {
  const { runId, dashboardId } = useParams();
  const navigate = useNavigate();
  useEffect(() => {
    navigate(`/${DEFAULT_CLIENT}/${DEFAULT_ENV}/history/${runId}/${dashboardId}`, { replace: true });
  }, []);
  return null;
}
```

Dashboard routes are **relative** (`path={id}`, no leading `/`) inside the `/:client/:env` parent. Registry is unchanged.

### 5c. `AppShell.jsx` — identity bar

```jsx
import { Outlet, useParams } from "react-router-dom";
import NavBar from "./components/NavBar.jsx";
import { theme } from "./theme/cashmereTheme";

export default function AppShell() {
  const { client, env } = useParams();
  return (
    <div>
      <div style={{ background: theme.surface, borderBottom: `1px solid ${theme.border}`,
                    padding: "0.3rem 1.5rem", fontSize: "0.75rem", color: theme.textMuted }}>
        {client} / {env}
      </div>
      <NavBar />
      <Outlet />
    </div>
  );
}
```

### 5d. `NavBar.jsx`

```jsx
const { client, env } = useParams();

// Tabs:
<NavLink to={`/${client}/${env}/${id}`} ...>
// History link:
<NavLink to={`/${client}/${env}/history`} ...>
```

### 5e. `RunHistory.jsx`

```jsx
const { client, env } = useParams();

async function loadHistory(client, env) {
  const res = await fetch(`/${client}/${env}/current/run_history.json`);
  ...
}

useEffect(() => {
  loadHistory(client, env).then(setHistory).catch(...);
}, [client, env]);

// View link:
<Link to={`/${client}/${env}/history/${run.run_id}/${run.dashboard_id}`}>View →</Link>
```

### 5f. `RunDetail.jsx`

```jsx
const { client, env, runId, dashboardId } = useParams();

async function loadRun(client, env, runId, dashboardId) {
  const res = await fetch(`/${client}/${env}/current/run_history.json`);
  ...
}

useEffect(() => {
  loadRun(client, env, runId, dashboardId).then(setRun).catch(...);
}, [client, env, runId, dashboardId]);

const backLink = <Link to={`/${client}/${env}/history`}>← Run History</Link>;

// Artifact links — NO CHANGE:
<a href={`/${artifact.path}`} ...>{artifact.name}</a>
```

---

## 6. Portal Context Model

### Why URL-prefix wins

| Approach | Deep-linkable | Bookmarkable | State mgmt | S3/CF |
|----------|:---:|:---:|:---:|:---:|
| `/:client/:env` URL prefix | ✓ | ✓ | None | ✓ |
| Query params `?client=x` | ✓ | ✓ | None | Harder CF behaviors |
| React context / localStorage | ✗ | ✗ | Yes | ✓ |

`useParams()` available everywhere in the subtree — no prop drilling, no sync bugs, no context provider needed.

### Selector UI (future, non-blocking)

A `ClientEnvSelector` reads `useParams()` for current values and calls `navigate(`/${newClient}/${newEnv}/${currentDashboardId}`)` on change. The URL changes; `useParams()` propagates the new values to all components. The selector is a convenience layer over the URL — not a replacement for it.

---

## 7. Routing Changes Summary

| Before | After |
|--------|-------|
| `/dlq_operations` | `/:client/:env/dlq_operations` |
| `/pipeline_health` | `/:client/:env/pipeline_health` |
| `/history` | `/:client/:env/history` |
| `/history/:runId/:dashboardId` | `/:client/:env/history/:runId/:dashboardId` |

Dashboard routes are relative inside `/:client/:env` — adding a new dashboard still requires one line in `dashboards/index.js` only.

---

## 8. Routing Guardrails

1. All dashboard and history routes live under `/:client/:env/...` — no sibling absolute routes.
2. `useParams()` is the sole source of `client` and `env` — never hardcoded, never in localStorage.
3. `useArtifactPath()` is the only path builder for current-run artifact fetches.
4. `artifact.path` is never computed in the portal — path logic is the publisher's responsibility.
5. `/:client/:env` is the only route that renders `AppShell`.
6. `DEFAULT_CLIENT` and `DEFAULT_ENV` constants are defined only in `App.jsx`.
7. Selectors navigate by updating the URL — never by setting state that shadows it.

---

## 9. Backwards Compatibility

| Concern | Resolution |
|---------|-----------|
| Old bookmark `/dlq_operations` | Catch-all → `/default/prod/dlq_operations` |
| Old bookmark `/history` | `LegacyHistoryRedirect` → `/default/prod/history` |
| Old bookmark `/history/{runId}/{dashboardId}` | `LegacyRunDetailRedirect` preserves params |
| Old `artifacts/current/` files | Left on disk; publisher stops writing; portal never fetches |
| Old `artifacts/runs/{runId}/` | Left on disk; not scanned by scoped `_rebuild_run_history` |
| `run()` without `--client` | `client or "default"` — writes to `default/{env}/` |

---

## 10. Schema Version Changes (`run_history_schema.py`)

- `SCHEMA_VERSION = "1.2.0"`
- Add `"client_id"` and `"env_id"` to top-level `"required"` list
- Add both as `{"type": "string"}` in `"properties"`
- `"additionalProperties": False` already in place

---

## 11. Files to Change

### Publisher

| File | Change |
|------|--------|
| `src/publisher/main.py` | Remove global path constants; compute scoped paths in `run()`; update `_rebuild_run_history()` |
| `src/publisher/validators/run_history_schema.py` | v1.2.0; add `client_id`, `env_id` |

### Portal (must land atomically in one commit — App.jsx routing is breaking)

| File | Change |
|------|--------|
| `portal/src/App.jsx` | `/:client/:env` parent; legacy redirect components |
| `portal/src/AppShell.jsx` | Identity bar via `useParams()` |
| `portal/src/hooks/useArtifactPath.js` | Add `useParams()` |
| `portal/src/components/NavBar.jsx` | Scoped `to=` props |
| `portal/src/pages/RunHistory.jsx` | Scoped fetch; scoped View links |
| `portal/src/pages/RunDetail.jsx` | Scoped fetch; scoped back link |

### Documentation

| File | Change |
|------|--------|
| `docs/json-contracts.md` | Update `run_history.json` section for v1.2.0 |
| `docs/plans/multi_client_environment_support_plan.md` | Save this plan |

### Unchanged

- `portal/vite.config.js` — `publicDir: ../artifacts` already correct
- `portal/src/dashboards/dlq_operations/DlqOperations.jsx` — uses hook; zero changes
- `portal/src/dashboards/pipeline_health/PipelineHealth.jsx` — same
- `portal/src/dashboards/index.js` — registry is client/env agnostic
- `dashboards/*/dashboard.json` — no client/env metadata needed
- `portal/package.json` — `react-router-dom` already present
- All validators except `run_history_schema.py`

---

## 12. Phased Implementation

### Phase 1 — Publisher migration (SAFEST FIRST STEP — zero portal impact)

The publisher writes to a new path; the existing `artifacts/current/` tree is untouched. The current portal continues to work from the old tree. Zero regression risk.

**Changes:** `src/publisher/main.py`, `src/publisher/validators/run_history_schema.py`

**Verification:**
```bash
python src/publisher/main.py
# Confirm: artifacts/default/local/current/dlq_operations/manifest.json exists
# Confirm: artifacts/default/local/current/run_history.json has:
#          schema_version: "1.2.0", client_id: "default", env_id: "local"
# Confirm: artifact.path values start with "default/local/runs/"
# Confirm: artifacts/current/ is untouched (no new writes)

python -c "
import json
from src.publisher.validators import run_history_schema
h = json.load(open('artifacts/default/local/current/run_history.json'))
run_history_schema.validate(h)
print('Schema validation: PASSED')
"
```

### Phase 2 — Portal migration (all portal files, one atomic commit)

The `App.jsx` routing change is breaking — old absolute routes no longer exist. All six portal files must land together.

**Changes:** `App.jsx`, `AppShell.jsx`, `useArtifactPath.js`, `NavBar.jsx`, `RunHistory.jsx`, `RunDetail.jsx`

**Verification:** See Section 13.

### Phase 3 — Documentation

**Changes:** `docs/json-contracts.md`, `docs/plans/multi_client_environment_support_plan.md`

---

## 13. Verification Plan

### Setup: two clients, two environments

```bash
# default/local (runs via __main__)
python src/publisher/main.py

# Additional clients via run() directly or future CLI:
# client="contexture", env="prod"
# client="contexture", env="staging"
# client="acme_health", env="prod"
```

### Artifact isolation

- Four independent `run_history.json` files, each with correct `client_id`/`env_id`
- `artifact.path` scoped to owning client/env in each file
- No cross-contamination between `runs[]` arrays

### Portal deep-link check

| URL | Expected outcome |
|-----|-----------------|
| `/` | Redirects to `/default/prod/dlq_operations` |
| `/dlq_operations` | Redirects to `/default/prod/dlq_operations` |
| `/history` | Redirects to `/default/prod/history` |
| `/contexture/prod/dlq_operations` | Loads contexture/prod; identity bar: `contexture / prod` |
| `/acme_health/prod/dlq_operations` | Loads acme_health/prod independently |
| `/contexture/prod/history` | Shows only contexture/prod runs |
| `/acme_health/prod/history` | Shows only acme_health/prod runs |
| `/contexture/prod/history/{runId}/dlq_operations` | RunDetail; artifact links → `/contexture/prod/runs/...` |

### Additional checks

- `npm run build` exits 0
- No stale `/current/run_history.json` or `fetch(\`/${DASHBOARD}/\`` in built JS: `grep -r "/current/run_history" portal/dist/`
