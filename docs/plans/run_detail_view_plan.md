# Run Detail View — Implementation Plan

**Feature:** Run Detail View
**Phase:** Phase 1 — Metadata display backed by run_history.json
**Status:** Draft — pending review
**Date:** 2026-03-09

---

## Context

The Run History page lists all prior publisher runs but provides no way to inspect an
individual run. Users cannot see the schema version used, confirm which artifacts were
produced, or check for warnings. This plan adds a `/history/:runId/:dashboardId` detail
page that surfaces per-run metadata sourced entirely from the existing `run_history.json`
artifact.

### Scope decision: artifact-serving migration is separated

**This phase does not deliver clickable artifact JSON file links.** Providing such links
requires serving the `artifacts/runs/` directory, which currently sits outside Vite's
`publicDir` (`../artifacts/current`). Expanding `publicDir` also requires updating all
dashboard component artifact paths and the `useArtifactPath` hook — a non-trivial blast
radius with regression risk across existing dashboards.

This migration is separated into a follow-on feature: **Artifact File Serving Expansion**
(see §Long-Term Artifact-Linking Model). Run Detail View is scoped to metadata display only;
artifact filenames are shown as text with an explicit note that file links arrive with the
expansion.

---

## Key Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Canonical data source | `run_history.json` — for both list AND detail views | Single source of truth for all run metadata in this phase; no additional artifacts required |
| No clickable artifact file links | **Explicitly deferred** to Artifact File Serving Expansion | `artifacts/runs/` is not served by Vite today; this phase does not deliver file links |
| Artifact display | Filenames shown as `<code>` text with explicit deferral note | Makes the limitation visible and traceable; avoids false affordance |
| Warnings/errors display | Explicit placeholder with contract-gap note | Manifest schema has no warnings field; see §Warnings Contract Gap |
| Navigation from list | "View →" link column in RunHistory table | Does not require whole-row click; accessible |
| Detail page data loading | `useParams()` + fetch `/run_history.json`, filter client-side | Handles direct-URL navigation; consistent with RunHistory.jsx pattern |
| Route URL stability | `/history/:runId/:dashboardId` is a stable contract | Route must not change when artifact-serving is expanded; only RunDetail internals change |
| No `publicDir` change | Deferred to Artifact File Serving Expansion | Reduces blast radius; existing dashboard serving unchanged |

---

## Warnings / Errors Contract Gap

**Current state:** `manifest.json` schema (`src/publisher/validators/manifest_schema.py`)
defines only: `schema_version, run_id, generated_at, report_ts, status, artifacts`.
**There is no `warnings` or `errors` field.**

Additionally, a latent schema inconsistency: `manifest_schema.py` declares `status` as
`["SUCCESS", "ERROR"]`, but `run_history_schema.py` uses `["SUCCESS", "FAILURE"]`. The
publisher never writes `"ERROR"` (it calls `sys.exit(1)` before writing), so no runtime
failure occurs today — but this must be resolved before FAILURE recording is introduced.

**Detail page behavior:** Warnings section shows a static placeholder:
> "No warnings recorded. (The publisher does not currently record per-run warnings.)"

**Phase 2 contract path (out of scope here):**
1. Standardize `status` enum to `["SUCCESS", "FAILURE"]` in both `manifest_schema.py` and
   `run_history_schema.py`; bump manifest `SCHEMA_VERSION` to `"1.2.0"`
2. Add optional `"warnings": { "type": "array", "items": { "type": "string" } }` to
   `manifest_schema.py`
3. Update `_rebuild_run_history()` to propagate `warnings` from each manifest entry into
   the run_history entry
4. Update `RunDetail.jsx` to render warnings list when present

---

## Long-Term Artifact-Linking Model

```
Phase 1          publicDir = ../artifacts/current
(current)        Serves: /run_history.json
                          /<dashboardId>/summary.json   (current run only)

This plan        publicDir unchanged
(Run Detail)     Canonical source: run_history.json for both list and detail
                 Artifact filenames: text only — NO clickable file links

Follow-on:       Artifact File Serving Expansion
Expansion        publicDir = ../artifacts
                 useArtifactPath → /current/<dashboardId>/<filename>
                 Migrate DlqOperations + PipelineHealth to use hook
                 RunHistory.jsx: fetch /current/run_history.json
                 RunDetail.jsx: artifact links → /runs/<runId>/<dashboardId>/<filename>
                 Route URL unchanged: /history/:runId/:dashboardId (stable contract)

Later            Multi-client: useArtifactPath gains clientId/env injection
                 No component changes required after Expansion migration
```

---

## Files to Create

| File | Purpose |
|------|---------|
| `portal/src/pages/RunDetail.jsx` | Run detail page — metadata + artifact name list |

---

## Files to Modify

| File | Change |
|------|--------|
| `portal/src/pages/RunHistory.jsx` | Add "View →" link column; import `Link` from react-router-dom |
| `portal/src/App.jsx` | Add `/history/:runId/:dashboardId` route; import `RunDetail` |

---

## Unchanged Files

- `portal/vite.config.js` — no publicDir change
- `portal/src/hooks/useArtifactPath.js` — no change
- `portal/src/dashboards/dlq_operations/DlqOperations.jsx` — no change
- `portal/src/dashboards/pipeline_health/PipelineHealth.jsx` — no change
- `portal/src/components/NavBar.jsx`
- `portal/src/AppShell.jsx`
- `portal/src/dashboards/index.js`
- `portal/src/theme/cashmereTheme.js`
- `src/publisher/` — no publisher changes

---

## RunHistory.jsx Changes

Minimal: one new `<th>`, one new `<td>` per row, one new style token, one new import.

```jsx
import { Link } from "react-router-dom";   // add to existing imports

// New style token (add to styles object):
viewLink: {
  fontSize: "0.8rem",
  color: theme.navActiveText,
  textDecoration: "none",
  fontWeight: 500,
},

// In <thead>:
<th style={styles.th}>Detail</th>

// In <tbody> row:
<td style={styles.td}>
  <Link
    to={`/history/${run.run_id}/${run.dashboard_id}`}
    style={styles.viewLink}
  >
    View →
  </Link>
</td>
```

No other changes to RunHistory.jsx. The fetch URL (`/run_history.json`) is unchanged.

---

## RunDetail.jsx — New Page

### Route

**URL:** `/history/:runId/:dashboardId`

**Stability contract:** This URL is intended to remain stable across future artifact-serving
changes. When the Artifact File Serving Expansion is implemented, `RunDetail.jsx` internals
will be updated to add clickable artifact file links — but the route path itself must not
change, as users may bookmark or share these URLs.

### Data source

`run_history.json` is the canonical source for both the Run History list view and the Run
Detail view in this phase. No additional artifact fetches are made by the detail page.

### Data loading — including malformed data handling

```js
async function loadRun(runId, dashboardId) {
  const res = await fetch("/run_history.json");
  const contentType = res.headers.get("content-type") || "";
  // Vite SPA fallback returns index.html with status 200 for missing static files.
  if (!res.ok || !contentType.includes("application/json")) {
    throw new Error(
      "run_history.json not found. Run the publisher first: python src/publisher/main.py"
    );
  }
  const data = await res.json();
  // Guard against malformed structure before calling .find()
  if (!Array.isArray(data.runs)) {
    throw new Error(
      "run_history.json is malformed: 'runs' field is missing or not an array."
    );
  }
  const entry = data.runs.find(
    (r) => r.run_id === runId && r.dashboard_id === dashboardId
  );
  if (!entry) throw new Error(`Run not found: ${runId} / ${dashboardId}`);
  return entry;
}
```

### Page sections

| Section | Content |
|---------|---------|
| Back link | `← Run History` (`Link to="/history"`) |
| Header | run_id in monospace; dashboard_id badge; status pill |
| Metadata card | Report time, Generated at, Schema version — key/value rows |
| Artifacts card | Filenames as `<code>` text; note: "Clickable file links are not yet available. They will be added as part of the Artifact File Serving Expansion." |
| Warnings card | "No warnings recorded. (The publisher does not currently record per-run warnings.)" |

### Error states

All error states show an error box and a back link to `/history`:

| Condition | Error message |
|-----------|---------------|
| Fetch fails (network error) | propagated from fetch rejection |
| Response is not JSON | "run_history.json not found. Run the publisher first…" |
| `data.runs` missing or not an array | "run_history.json is malformed: 'runs' field is missing or not an array." |
| Entry not found | "Run not found: `<runId>` / `<dashboardId>`" |

### Styling

Cashmere semantic tokens throughout; no new theme tokens required.

---

## App.jsx Routing

```jsx
import RunDetail from "./pages/RunDetail.jsx";

// Inside layout route — specific route before general:
<Route path="/history/:runId/:dashboardId" element={<RunDetail />} />
<Route path="/history" element={<RunHistory />} />
```

React Router v6 uses best-match, but placing the more-specific route first is idiomatic and
prevents any future ambiguity.

---

## Verification Steps

1. `/history` renders with new "View →" column; all rows navigate to the detail page
2. `/history/<runId>/<dashboardId>` renders: back link, header with status pill, metadata
   card, artifact name list with deferral note, warnings placeholder
3. Direct URL to `/history/<runId>/<dashboardId>` works without prior list visit
4. `/history/BADRUN/fakeDash` → "Run not found" error with back link
5. `/dlq_operations` and `/pipeline_health` load without regression (unchanged)
6. `npm run build` exits 0

---

## Negative Tests

1. Delete `artifacts/current/run_history.json`, navigate to `/history/<runId>/<dashboardId>`
   → error box: "run_history.json not found. Run the publisher first…"
2. Corrupt `run_history.json` by replacing `"runs": [...]` with `"runs": null`, navigate to
   detail → error box: "run_history.json is malformed: 'runs' field is missing or not an
   array."

---

## Out-of-Scope Items

Tracked for follow-on features; not implemented here:

- **Artifact File Serving Expansion**: publicDir change, useArtifactPath hook update, dashboard
  component migration, clickable artifact file links in RunDetail
- **Warnings manifest field**: Standardize status enum; add optional `warnings[]` to
  manifest schema; propagate through run_history index
- **run_history.json retention policy**: Unbounded growth; production readiness concern

---

## Implementation Output Template

```
Files created:
- portal/src/pages/RunDetail.jsx

Files modified:
- portal/src/pages/RunHistory.jsx  (add "View →" link column)
- portal/src/App.jsx               (add /history/:runId/:dashboardId route)

Verification:
- /history renders with View links
- /history/:runId/:dashboardId renders metadata + artifact name list
- Direct URL navigation works
- "Run not found" error state confirmed
- Malformed data error state confirmed
- npm run build exits 0
```
