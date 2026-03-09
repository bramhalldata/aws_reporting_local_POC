# Artifact File Serving Expansion — Implementation Plan (Revised)

**Feature:** Artifact File Serving Expansion
**Date:** 2026-03-09
**Status:** Draft — pending review

---

## Context

The Run Detail View (Phase 1) shows artifact filenames as static text with an explicit deferral note: "Clickable file links are not yet available. They will be added as part of the Artifact File Serving Expansion." This plan delivers that expansion and incorporates a minimal artifact contract improvement.

**Two concerns addressed together:**

1. **Serving gap** — `artifacts/runs/<runId>/<dashboardId>/<filename>` is not reachable through the browser because Vite's `publicDir` is currently `../artifacts/current`.

2. **Contract gap** — `run_history.json` represents artifacts as bare filename strings (`["summary.json", "trend_30d.json"]`). This requires the UI to construct artifact paths, infer artifact types, and has no provision for future metadata. Enriching the contract now costs one publisher function change and prevents UI path-computation logic from ossifying.

The prior plan (`run_detail_view_plan.md`) already specified the serving migration path. This plan executes it and folds in the artifact contract improvement.

---

## Part 1: Serving Architecture

### Option A: Expand `publicDir` to `../artifacts` ✅ RECOMMENDED

- Vite serves the entire `artifacts/` tree: `/current/...` and `/runs/...`
- `useArtifactPath` updated to prefix `/current/`
- Dashboard components adopt the hook
- `RunHistory.jsx` and `RunDetail.jsx` fetch `/current/run_history.json`
- `RunDetail.jsx` uses `artifact.path` from the structured contract (see Part 2)

**Why:** Production-correct — S3 + CloudFront serve the same `artifacts/` tree under one root. Both prefixes are in scope without infrastructure changes. Publisher already writes to both `artifacts/current/` and `artifacts/runs/`. This is the migration path the codebase was designed for.

### Option B: Vite proxy for `/runs/` ❌ REJECTED

- Keep `publicDir` unchanged; add `server.proxy` or `vite-plugin-static-copy`

**Why rejected:** `server.proxy` is Vite dev-only — it does not apply to `vite build` output. In production (S3 + CloudFront), `/runs/` links would 404. A dev-only workaround that breaks in production.

### Option C: Path abstraction without serving change ❌ REJECTED

- New hook producing configurable base URL; embed paths in `run_history.json`

**Why rejected:** Historical artifact files at `artifacts/runs/` remain unreachable through the browser regardless of how the URL is computed. No amount of URL abstraction serves files that are outside `publicDir`.

---

## Part 2: Artifact Contract

### Option X: Keep bare filename strings ❌ NOT RECOMMENDED

**Current shape:**
```json
"artifacts": ["summary.json", "trend_30d.json", "top_sites.json", "exceptions.json"]
```

**Problems:**
- **Path computation in the UI** — `RunDetail.jsx` must reconstruct `/runs/${runId}/${dashboardId}/${filename}` from context. This embeds a path formula assumption in the portal that must be maintained as the artifact layout evolves.
- **Type inference by filename convention** — any consumer needing to distinguish artifact role must parse the filename (`trend_30d.json` → trend). This is fragile and unspecified.
- **No provision for future metadata** — missing-artifact detection, AI run-to-run comparison, data product labeling, and content-type hints all require richer per-artifact metadata that cannot be added without breaking the current string-only contract.
- **Publisher knows the path at write time** — the publisher has `run_id`, `dashboard_id`, and `filename` available when building `_rebuild_run_history()`. Emitting the path there eliminates the need for any downstream consumer to recompute it.

### Option Y: Structured artifact objects in `run_history.json` ✅ RECOMMENDED

**Proposed minimum shape:**
```json
"artifacts": [
  { "name": "summary.json",   "type": "summary",   "path": "runs/20260308T212541Z/dlq_operations/summary.json" },
  { "name": "trend_30d.json", "type": "trend_30d", "path": "runs/20260308T212541Z/dlq_operations/trend_30d.json" },
  { "name": "top_sites.json", "type": "top_sites", "path": "runs/20260308T212541Z/dlq_operations/top_sites.json" },
  { "name": "exceptions.json","type": "exceptions","path": "runs/20260308T212541Z/dlq_operations/exceptions.json" }
]
```

**Field semantics:**

| Field | Type | Source | Description |
|-------|------|--------|-------------|
| `name` | string | manifest `artifacts[]` | Original filename (e.g., `"summary.json"`) |
| `type` | string | derived: `name.replace(".json", "")` | Artifact role identifier (e.g., `"summary"`, `"trend_30d"`) |
| `path` | string | computed: `runs/{run_id}/{dashboard_id}/{name}` | Relative path from `artifacts/` root (prepend `/` for URL) |

**Why this shape:**
- **Run Detail links** — `RunDetail.jsx` uses `artifact.path` directly: `href={\`/${artifact.path}\`}`. No path formula in the UI.
- **Future AI analysis** — `type` gives a stable identifier for cross-run artifact comparison without filename parsing.
- **Missing-artifact detection** — a consumer can check the expected `type` set against what is present without filename interpretation.
- **Data product metadata** — `path` is the foundation for adding `content_type`, `size_bytes`, `checksum` in a future phase without breaking existing consumers.
- **Future UI rendering** — components can branch on `type` to render appropriate labels, icons, or previews without parsing filenames.

**Keeping it minimal:** Only `name`, `type`, and `path` required. No `content_type`, `checksum`, `size_bytes`, or `label` — those are optional extensions for a later phase.

### Schema version implications

The `run_history.json` envelope `schema_version` bumps: `"1.0.0"` → `"1.1.0"`.

The per-run entry `schema_version` (sourced from the manifest) is unchanged at `"1.1.0"`.

**`run_history_schema.py`** updates `SCHEMA_VERSION` to `"1.1.0"` and changes the `artifacts` items schema from:
```python
"artifacts": {"type": "array", "items": {"type": "string"}}
```
to:
```python
"artifacts": {
    "type": "array",
    "items": {
        "type": "object",
        "required": ["name", "type", "path"],
        "additionalProperties": False,
        "properties": {
            "name": {"type": "string"},
            "type": {"type": "string"},
            "path": {"type": "string"},
        },
    },
}
```

---

## Publisher Implications

**`_rebuild_run_history()` in `src/publisher/main.py`**

The manifest itself (`manifest.json`) is **not changed** — its `artifacts` field remains a bare string list. Enrichment happens only in `_rebuild_run_history()`, which has `run_id` (from `m["run_id"]`) and `dashboard_id` (extracted from the file path).

Change in `_rebuild_run_history()`:

```python
# Before:
"artifacts": m["artifacts"],

# After:
"artifacts": [
    {
        "name": filename,
        "type": filename.replace(".json", ""),
        "path": f"runs/{m['run_id']}/{dashboard_id}/{filename}",
    }
    for filename in m["artifacts"]
],
```

Bump the envelope `schema_version`:

```python
# Before:
run_history = {"schema_version": "1.0.0", ...}

# After:
run_history = {"schema_version": "1.1.0", ...}
```

**No changes to:**
- `dashboards/dlq_operations/dashboard.json`
- `dashboards/pipeline_health/dashboard.json`
- `src/publisher/validators/manifest_schema.py`

---

## Portal Implications

### `RunDetail.jsx`
```jsx
{run.artifacts.map((artifact) => (
  <li key={artifact.name} style={styles.artifactItem}>
    <a
      href={`/${artifact.path}`}
      style={styles.artifactLink}
      target="_blank"
      rel="noreferrer"
    >
      {artifact.name}
    </a>
  </li>
))}
```
Use `<a target="_blank">` (not React Router `<Link>`) — these open static JSON files, not SPA routes.
Remove `styles.deferralNote`; add `styles.artifactLink`.

### `RunHistory.jsx`
Update artifact column from `run.artifacts.join(", ")` to `run.artifacts.map((a) => a.name).join(", ")`.

---

## The `useArtifactPath` / `loadArtifacts` Pattern

```js
// Standalone function — receives resolver, no hook dependency
async function loadArtifacts(artifactPath) {
  const manifestRes = await fetch(artifactPath("manifest.json"));
  const fetchJson = async (filename) => fetch(artifactPath(filename));
}

export default function DlqOperations() {
  const artifactPath = useArtifactPath(DASHBOARD); // hook in component body

  useEffect(() => {
    loadArtifacts(artifactPath).then(setData).catch(...);
  }, []);
}
```

Same pattern in `PipelineHealth.jsx`. `RunHistory.jsx` and `RunDetail.jsx` do **not** use `useArtifactPath`.

---

## Files to Create

None.

---

## Files to Modify

| File | Change |
|------|--------|
| `portal/vite.config.js` | `publicDir: "../artifacts/current"` → `"../artifacts"` |
| `portal/src/hooks/useArtifactPath.js` | Path formula: `/${dashboardId}/${filename}` → `/current/${dashboardId}/${filename}` |
| `portal/src/dashboards/dlq_operations/DlqOperations.jsx` | Add `useArtifactPath` import + call; pass resolver as argument to `loadArtifacts(artifactPath)` |
| `portal/src/dashboards/pipeline_health/PipelineHealth.jsx` | Same pattern as DlqOperations |
| `portal/src/pages/RunHistory.jsx` | Fetch `/current/run_history.json`; update artifact cell to `a.name` |
| `portal/src/pages/RunDetail.jsx` | Use `artifact.path` for links; remove deferral note; iterate objects |
| `src/publisher/main.py` | Enrich artifacts in `_rebuild_run_history()`; bump envelope schema_version |
| `src/publisher/validators/run_history_schema.py` | Structured items schema; bump `SCHEMA_VERSION` to `"1.1.0"` |
| `docs/json-contracts.md` | Document new `artifacts[]` object shape and envelope schema_version `"1.1.0"` |

---

## Unchanged Components

- `portal/src/App.jsx` — routes unchanged; `/history/:runId/:dashboardId` preserved
- `portal/src/dashboards/index.js`
- `portal/src/AppShell.jsx`, `NavBar.jsx`, all shared UI components
- `portal/src/theme/cashmereTheme.js`
- `portal/package.json` — no new dependencies
- `dashboards/dlq_operations/dashboard.json`
- `dashboards/pipeline_health/dashboard.json`
- `src/publisher/validators/manifest_schema.py`

---

## Verification Steps

> **Prerequisite — publisher must be re-run before testing the portal.**
> After implementation, `run_history.json` still contains bare strings until the publisher runs.
> Running the portal before re-running the publisher will produce broken artifact display (`undefined`).

1. **Re-run the publisher:**
   ```
   python src/publisher/main.py
   ```
   Inspect `artifacts/current/run_history.json` — `artifacts` entries must be structured objects with `name`, `type`, `path`. Envelope `schema_version` must be `"1.1.0"`.

2. **Dev server starts:** `cd portal && npm run dev` — no errors.

3. **Existing dashboards load without regression:** Navigate to `/dlq_operations` and `/pipeline_health`. Network tab shows `/current/<dashboardId>/manifest.json` returning HTTP 200.

4. **Run History loads:** Navigate to `/history`. Table renders; network tab shows `/current/run_history.json` returning HTTP 200.

5. **Clickable artifact links:** Navigate to `/history/20260308T212541Z/dlq_operations`. Click `summary.json` → browser opens `/runs/20260308T212541Z/dlq_operations/summary.json` returning JSON (HTTP 200).

6. **Direct URL navigation:** Navigate directly to `/history/20260308T212541Z/dlq_operations` — loads correctly.

7. **Production build:** `cd portal && npm run build` — exits 0.

8. **No stale fetch paths:**
   ```
   grep -r 'fetch("/run_history' portal/src/
   grep -r "fetch(\`/${" portal/src/
   ```
   Both return zero matches.

---

## Negative Tests

1. **Old root path 404s:** Navigate to `/dlq_operations/manifest.json` — must return 404.

2. **Missing run artifacts (graceful degradation):** Delete a run directory from `artifacts/runs/`. RunDetail page still loads; clicking a link opens a browser-native 404 tab, not a React error.

3. **Missing `run_history.json` at new path:** Rename `artifacts/current/run_history.json`. Navigate to `/history` — error box: "run_history.json not found. Run the publisher first…"

4. **Schema validation rejects bare strings:** Manually revert one `artifacts` entry to a bare string. Re-run publisher — it should log a schema validation warning and skip writing the file.
