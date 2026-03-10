# Run Comparison — Implementation Plan

**Feature:** Run Comparison
**Output artifact:** `docs/plans/run_comparison_plan.md`
**Date:** 2026-03-09
**Status:** Draft — pending review

---

## Context

The platform provides a run history list (`/:client/:env/history`) and a run detail page
(`/:client/:env/history/:runId/:dashboardId`). Users can view any historical run's metadata
and click through to individual artifact files. However, there is no way to compare two runs
side-by-side to understand what changed between them.

Run Comparison adds a focused, type-driven comparison page that answers the most useful
questions: did key metrics go up or down, which sites changed, which failure categories
shifted? It is intentionally narrow in Phase 1 — a whitelist of artifact types, each with a
purpose-built comparator, rather than a generic JSON diff.

---

## 1. Feature Summary

Run Comparison allows a user to select two runs for the same dashboard within the same
client/environment scope and view a structured diff of their artifact data.

The page answers:
- Did failures go up or down between the base and target run?
- Which top sites changed — new entrants, removals, count changes?
- Which exception or failure types changed — new categories, count deltas?
- Which artifacts are present in one run but missing in the other?

The comparison is deep-linkable via query parameters, so a link to a specific comparison can
be shared or bookmarked.

---

## 2. Comparison Scope

### Phase 1 includes

- Comparing two runs of the **same dashboard** within the **same client/env**
- A whitelist of **four artifact types**: `summary`, `top_sites`, `exceptions`, `failure_types`
- Per-type structured comparators (numeric deltas, set membership changes)
- Graceful handling of missing artifact types in either run
- Deep-linkable route with `?dashboard`, `?base`, and `?target` query parameters
- Entry points from `RunHistory` (compare button) and `RunDetail` (compare link)

### Phase 1 explicitly excludes

See Section 12 (Non-Goals).

---

## 3. Core Design Trick — Type-Specific Comparators

The key design choice is comparing by **artifact type** using a **whitelist of explicit
comparator functions**, rather than building a generic recursive JSON diff engine.

### Why this works

Each artifact type has a known, stable schema defined in `src/publisher/validators/`.
A `summary.json` always contains numeric KPI fields. A `top_sites.json` always contains
a ranked array of `{site, failures}` objects. These schemas do not change without also
updating the validator.

A type-specific comparator can be written in ~20 lines that:
1. Receives `(baseArtifact, targetArtifact)` — both parsed JSON objects
2. Returns a structured diff object that the UI renders deterministically

### Why generic diff is the wrong approach

A recursive JSON diff engine would:
- Require handling arbitrary nesting depth
- Produce diffs that may be meaningless (e.g., comparing two `trend_30d` arrays
  day-by-day is noise, not signal)
- Require format-specific rendering anyway (a generic `{path, old, new}` diff still
  needs type-aware display logic)
- Grow in complexity as new artifact types are added

### The whitelist as a forcing function

If an artifact type is not in the whitelist, the comparison page shows it in a
"not compared" section with links to the raw artifact files. This is the right default:
explicit > implicit. New comparators are added deliberately, with a clear schema contract.

**Whitelist:**

| Artifact type | Comparator strategy |
|---------------|---------------------|
| `summary` | Numeric field deltas: `failures_last_24h`, `failures_last_7d`, `total_sites_affected` |
| `top_sites` | Set diff on `site` key; per-site count delta for intersecting sites |
| `exceptions` | Set diff on exception type key; per-type count delta |
| `failure_types` | Set diff on category key; per-category count delta |

`trend_30d` is **excluded from Phase 1** — comparing time series arrays row-by-row
produces noise rather than signal. A meaningful trend comparison requires a different
visualization strategy (e.g., overlaid charts) and is deferred.

---

## 4. Route Design

**Proposed route:** `/:client/:env/history/compare`

**Query parameters:**
- `?dashboard=<dashboardId>` — which dashboard to compare (e.g. `dlq_operations`)
- `?base=<runId>` — the earlier / baseline run ID (e.g. `20260309T120000Z`)
- `?target=<runId>` — the later / comparison run ID (e.g. `20260309T180000Z`)

**Full example:**
```
/default/local/history/compare?dashboard=dlq_operations&base=20260309T120000Z&target=20260309T180000Z
```

### Why query parameters (not path segments)

Path segments for two run IDs would require a fixed ordering convention and produce an
unwieldy URL: `/history/compare/20260309T120000Z/20260309T180000Z/dlq_operations`. Query
parameters are semantically clearer (`base=` vs `target=`), are order-independent, and
are the natural fit for a "filter/select" page rather than a resource-identity page.

### React Router v6 route ordering

React Router v6 uses rank-based matching. The literal segment `compare` outranks the
dynamic segment `:runId`, so `history/compare` will correctly match before
`history/:runId/:dashboardId`. No special ordering is needed in `App.jsx`.

**New route addition in `App.jsx`:**
```jsx
<Route path="history/compare" element={<RunCompare />} />
<Route path="history/:runId/:dashboardId" element={<RunDetail />} />
<Route path="history" element={<RunHistory />} />
```

### Deep-linking behavior

All three query parameters are required for the page to render a comparison. If any are
missing or a run is not found in `run_history.json`, the page shows a clear error state
with a link back to `/:client/:env/history`. The URL is bookmarkable and shareable.

---

## 5. Data Flow

```
1. RunCompare mounts
   ↓
2. Read URL: useParams() → {client, env}
            useSearchParams() → {dashboard, base, target}
   ↓
3. fetch(/{client}/{env}/current/run_history.json)
   Check content-type (guard against Vite SPA fallback)
   ↓
4. Find baseRun  = runs.find(r => r.run_id === base   && r.dashboard_id === dashboard)
   Find targetRun = runs.find(r => r.run_id === target && r.dashboard_id === dashboard)
   Error if either is not found
   ↓
5. For each artifact type in COMPARE_WHITELIST:
     Find artifact in baseRun.artifacts   where artifact.type === type  → baseArtifact
     Find artifact in targetRun.artifacts where artifact.type === type  → targetArtifact

     If both present: fetch(/{baseArtifact.path}) and fetch(/{targetArtifact.path})
     If one missing:  mark as "only in base" or "only in target"
     If neither:      skip (not relevant for either run)
   ↓
6. Run type-specific comparator(baseData, targetData) → diff object
   ↓
7. Render comparison UI
```

### Artifact fetching

Artifact paths are taken directly from `artifact.path` (publisher-owned). Fetches use:
```js
fetch(`/${artifact.path}`)
```
The same pattern used in `RunDetail.jsx` for artifact links.

### Loading states

The page has two loading phases:
1. Loading `run_history.json` to resolve metadata
2. Loading individual artifact files (can be done in parallel with `Promise.allSettled`)

`Promise.allSettled` is preferred over `Promise.all` so that a single failed artifact
fetch does not block the entire comparison — that artifact is shown as unavailable.

---

## 6. Comparable Artifact Types — Phase 1 Whitelist

### `summary` — Numeric KPI Deltas

Compares numeric fields present in both base and target objects. Fields are defined
as an explicit list in the comparator (not inferred by type).

**dlq_operations/summary.json fields:** `failures_last_24h`, `failures_last_7d`, `total_sites_affected`
**pipeline_health/summary.json fields:** `total_documents`, `total_failures`, `failure_rate`, `sites_affected`

Comparator output:
```js
[{ field: "failures_last_24h", base: 18, target: 22, delta: +4, pct: "+22%" }, ...]
```

UI: a delta table with color-coded rows (red for increases in failure counts, green for decreases).

### `top_sites` — Site-Level Changes

Items are `{site, failures}` objects, keyed on `site`.

Comparator output:
```js
{
  added:    [{ site: "site_delta", failures: 5 }],
  removed:  [{ site: "site_alpha", failures: 0 }],
  changed:  [{ site: "site_bravo", base: 29, target: 35, delta: +6 }],
  unchanged: [...]
}
```

UI: three sub-sections — new sites, removed sites, changed sites (sorted by `|delta|` descending).

### `exceptions` — Exception Type Changes

Items are objects with an exception type key and a count. Key field determined by schema
(e.g., `exception_type` or `error_type`). Comparator uses the same set-diff pattern as
`top_sites`.

Comparator output: same structure as `top_sites` (added, removed, changed, unchanged).

### `failure_types` — Failure Category Deltas

Items are `{type, count}` objects (or equivalent). Same set-diff pattern.

---

## 7. UI Structure

```
[← Run History]

┌─────────────────────────────────────────────────┐
│  Compare Runs — dlq_operations                  │
│  default / local                                │
├──────────────────┬──────────────────────────────┤
│  BASE            │  TARGET                      │
│  20260309T120000Z│  20260309T180000Z            │
│  2026-03-09 ...  │  2026-03-09 ...              │
│  SUCCESS         │  SUCCESS                     │
└──────────────────┴──────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  SUMMARY DELTA                                  │
│  failures_last_24h    18 → 22   +4  ▲ 22%      │
│  failures_last_7d    143 → 156  +13 ▲  9%      │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  TOP SITES                                      │
│  New sites (1):    site_delta (5 failures)      │
│  Removed (1):      site_alpha                   │
│  Changed (3):      site_bravo +6, ...           │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  EXCEPTIONS                                     │
│  (same structure)                               │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  ARTIFACTS NOT COMPARED                         │
│  trend_30d.json — view in base | view in target │
└─────────────────────────────────────────────────┘
```

### Visual conventions

- Delta positive (failure increase): `theme.errorText` with ▲ indicator
- Delta negative (failure decrease): `theme.successText` with ▼ indicator
- Delta zero: `theme.textSecondary`
- New site/exception: `theme.warningBg` row highlight
- Removed site/exception: `theme.divider` row highlight (muted)
- Card and header style: consistent with `RunDetail.jsx` (`styles.card`, `styles.cardTitle`)

---

## 8. Missing Artifact Handling

### Case 1: Artifact type present in both runs → compare normally

### Case 2: Artifact type present in base only
Show: "Not present in target run" with a link to the base artifact file.

### Case 3: Artifact type present in target only
Show: "Not present in base run" with a link to the target artifact file.

### Case 4: Artifact type not in whitelist
Render in "Artifacts Not Compared" section with links to both raw files (if available).

### Case 5: Artifact fetch fails (network error / file missing)
`Promise.allSettled` catches individual failures. Show: "Could not load [artifact name]"
inline within the relevant comparison card, with links to raw files.

### Case 6: Run not found in run_history.json
Page shows error state: "Run [runId] not found for [dashboardId]". Includes back link to
`/:client/:env/history`.

### Case 7: dashboard query param does not match either run's dashboard_id
Treated as "run not found" — an error state. Dashboard is validated against both runs.

---

## 9. Multi-Client / Multi-Environment Scope

Client and env come exclusively from `useParams()` — the same pattern as every other page.

```jsx
const { client, env } = useParams();
const [searchParams] = useSearchParams();
const dashboard = searchParams.get("dashboard");
const base      = searchParams.get("base");
const target    = searchParams.get("target");
```

All fetches are scoped:
```js
fetch(`/${client}/${env}/current/run_history.json`)
fetch(`/${artifact.path}`)  // artifact.path already carries client/env prefix
```

The comparison page **never** loads data from a different client or env. The route itself
enforces scope — the URL `/:client/:env/history/compare` places the comparison within the
correct client/env subtree. Mixing runs from different scopes is impossible by design:
both `base` and `target` must be found in the same `run_history.json`.

---

## 10. Files to Create / Modify

### Create

| File | Purpose |
|------|---------|
| `portal/src/pages/RunCompare.jsx` | Comparison page component |
| `portal/src/utils/runDiff.js` | Type-specific comparator functions and whitelist |

### Modify

| File | Change |
|------|--------|
| `portal/src/App.jsx` | Add `history/compare` route before `history/:runId/:dashboardId` |
| `portal/src/pages/RunHistory.jsx` | Add "Compare" entry point — checkbox selection or "Compare with…" affordance on each row |
| `portal/src/pages/RunDetail.jsx` | Add "Compare with another run" link — navigates to compare page with current run as `base`, prompts for target |

### Unchanged

- All dashboard components (`DlqOperations`, `PipelineHealth`)
- `useArtifactPath.js` — not used by comparison (comparison fetches by `artifact.path` directly)
- `AppShell.jsx`, `NavBar.jsx`
- All publisher files
- All schema validators

---

## 11. Verification Plan

### Functional tests (manual)

| Scenario | Expected result |
|----------|----------------|
| Navigate to `/default/local/history/compare?dashboard=dlq_operations&base=<id1>&target=<id2>` | Comparison page renders with both run metadata blocks |
| Both runs have all four comparable artifact types | All four comparison sections render |
| One run is missing `top_sites.json` | Top sites section shows "not present in [run]" message |
| `base` run ID does not exist | Error state with back link to history |
| `target` run ID exists but for different dashboard | Error state |
| Missing `dashboard` query param | Error state |
| `base === target` | Page renders (comparing a run to itself — all deltas are zero) |
| Navigate to compare from RunHistory | Correct `base` and `target` pre-populated in URL |
| Navigate to compare from RunDetail | Current run pre-populated as `base` |
| Use browser back button from compare page | Returns to history list |
| Bookmark compare URL and reopen | Page loads correctly (deep-link works) |

### Build test

```bash
cd portal
npm run build
# Must exit 0 with no TypeScript/lint errors
```

### Schema contract test

After running the publisher, verify artifact paths in `run_history.json` resolve correctly:
```bash
cat artifacts/default/local/current/run_history.json
# Confirm artifact.path values for both dashboards exist on disk
```

---

## 12. Non-Goals

The following are explicitly excluded from Phase 1:

| Excluded | Reason |
|----------|--------|
| Generic recursive JSON diff engine | Produces meaningless diffs for unknown schemas; over-engineering |
| Comparing runs across different dashboards | Incompatible artifact schemas make comparison undefined |
| Comparing runs across different client/env scopes | Each scope has its own isolated `run_history.json`; cross-scope comparison has no clear data contract |
| `trend_30d` artifact comparison | Time series array comparison requires chart overlay, not tabular diff; deferred |
| AI-generated explanations or insights | Out of scope for Phase 1; would be an `insights.json` artifact, not portal logic |
| Selecting comparison targets from a dropdown within the compare page | Phase 1 assumes URL pre-population from RunHistory/RunDetail entry points |
| Comparing more than two runs simultaneously | Adds significant UI complexity for marginal Phase 1 value |
| Publisher changes | Comparison is purely portal-side; no new artifacts needed |
