# Review: Dashboard Renderer Plan

**Plan artifact:** docs/plans/dashboard_renderer_plan.md
**Review date:** 2026-03-11
**Reviewer:** External architecture review (staff-level)
**Source read:** DlqOperations.jsx (192 lines), PipelineHealth.jsx (106 lines), useArtifactPath.js

---

## 1. Review Summary

The plan is architecturally sound and well-scoped. The core decisions — generic renderer driven by definition config, `propsAdapter` per widget type, `useDashboardArtifacts` hook to centralize loading logic — are the right choices at this stage.

The migration target (`pipeline_health`) is appropriately conservative. The plan correctly defers DLQ Operations, routing changes, drag-and-drop, and layout grids.

There are **three implementation gaps** and **one latent bug** that must be addressed during implementation. None require plan revision, but all should be noted in code.

**Recommendation: APPROVED WITH REVISIONS** — implementation can proceed; address the four items below before marking the feature complete.

---

## 2. Strengths of the Plan

### Correct abstraction boundary
The renderer takes a `DashboardDefinition` object — it does not fetch its own definition file. This keeps the component pure and testable. The page wrapper handles the import; the renderer handles the rendering. Clean separation.

### propsAdapter is the right pattern for Phase 2
Changing existing component interfaces (KpiCard, TrendChart, etc.) would risk regressions across both dashboards. The per-type adapter function normalizes data-to-props mapping without touching a single component. This is the minimum change that achieves the goal.

### `useDashboardArtifacts` eliminates the most important duplication
Both existing dashboards have identical artifact-loading infrastructure: manifest fetch → content-type check → status check → `requireArtifact` validation → `Promise.all` fetch. Centralizing this is overdue and reduces ~40–50 lines of duplicated logic per dashboard.

### Migration target is well-chosen
`pipeline_health` has 2 data artifacts, 4 widgets, and 2 sections. It is the simplest possible validation path. If the renderer handles it correctly, the design is proven. DLQ Operations (5 artifacts, 6+ widgets, duplicate table widgets for 7d vs 30d) can be migrated in a follow-up with higher confidence.

### Backward compatibility preserved
`DlqOperations.jsx` and all routing, component, and publisher files remain unchanged. The migration is fully internal to `PipelineHealth.jsx`. No risk of regressions on the working dashboard.

---

## 3. Architectural Concerns

### Concern 1 — `requireArtifact` validation is missing from the hook design (MUST FIX)

Reading the actual `loadArtifacts` function in both dashboards (PipelineHealth.jsx:38–43, DlqOperations.jsx:78–87):

```javascript
const requireArtifact = (name) => {
  if (!manifest.artifacts.includes(name))
    throw new Error(`manifest.json does not list ${name}. Re-run the publisher.`);
};
requireArtifact("summary.json");
requireArtifact("failure_types.json");
```

This check validates that each required artifact is declared in `manifest.artifacts` before fetching it. If the publisher ran but omitted an artifact (partial run), this catches it immediately with a clear error message.

The plan's `useDashboardArtifacts` hook description omits this validation. The hook must validate each artifact in `artifactNames` against `manifest.artifacts` before fetching. Otherwise the renderer will silently get a 404 and produce a less clear error.

**Resolution:** Add `requireArtifact` validation inside `useDashboardArtifacts` before the `Promise.all` fetch, iterating over all `artifactNames` derived from `definition.widgets`.

---

### Concern 2 — Dashboard title header is not addressed (MUST FIX)

Both current dashboards render a `<header>` block with an `<h1>` title between `HealthBanner` and the KPI row:

```jsx
// PipelineHealth.jsx:89-91
<header style={styles.header}>
  <h1 style={styles.title}>Pipeline Health</h1>
</header>
```

The `DashboardDefinition` schema has a `title` field (`definition.title`). The renderer plan covers HealthBanner placement and section iteration, but does not mention rendering the dashboard title.

Without this, the migrated `pipeline_health` page will be visually broken — no `<h1>` heading. The title is present in `definition.title` and must be rendered.

**Resolution:** The renderer renders the dashboard title header after HealthBanner and before sections, using `definition.title`. Apply the same header styles used by the existing dashboards (`styles.header`, `styles.title`).

---

### Concern 3 — `useEffect` stale dependency array is a latent bug (SHOULD FIX)

Both current dashboards call:
```javascript
useEffect(() => { loadArtifacts(artifactPath).then(...) }, []);
```

The empty dependency array `[]` means data does not reload when the user navigates from one client/env to another within the same dashboard route. If the user changes `client` or `env` via the selector while viewing `pipeline_health`, the page does not re-fetch — it shows stale data from the previous scope.

The new `useDashboardArtifacts` hook is an opportunity to fix this. The hook should depend on `client`, `env`, and `dashboardId` from `useParams()`.

**Resolution:** Inside `useDashboardArtifacts`, use `[client, env, dashboardId]` as the `useEffect` dependency array (not `[]`). Also derive `client` and `env` inside the hook via `useParams()` rather than requiring the renderer to pass them in.

---

### Concern 4 — Spurious `HealthBanner` import in `widgetRegistry.js` (MINOR)

The plan's `widgetRegistry.js` code sample imports `HealthBanner`:

```javascript
import HealthBanner from './components/HealthBanner.jsx';
```

But `HealthBanner` is explicitly not registered — it is handled implicitly by the renderer. The import is dead code in the registry file. It will confuse future contributors who assume registry imports correspond to registry entries.

**Resolution:** Remove the `HealthBanner` import from `widgetRegistry.js`. The renderer imports it directly.

---

## 4. Scalability Assessment

### DLQ Operations has two `data_table` widgets pointing to different artifact fields

Looking at `DlqOperations.jsx`:
- `TopSitesTable` is rendered twice: once for `summary.top_sites` (7d) and once for `topSites.sites` (30d, from `top_sites.json`)
- Both are `type: data_table` in the planned registry
- The `data_source.field` values differ (`"top_sites"` vs `"sites"`)

The `propsAdapter` for `data_table` passes `data` directly as `sites`. This works correctly because the field extraction happens before the adapter. **This validates the design handles the duplicate-widget case cleanly.**

### Widget type enum growth
As new dashboards are added, the registry will grow. The current flat object structure (`widgetRegistry = { type: { component, propsAdapter } }`) scales indefinitely. No concern here for the foreseeable roadmap.

### Multi-section rendering with mixed widget types
Phase 2's KPI-row heuristic (detect all-kpi_card sections → render as flex row) works for the two existing dashboards but will break for future sections that mix `kpi_card` with other types. This is noted in the plan as temporary. **The comment in code marking this heuristic must be added during implementation.**

---

## 5. Missing Design Decisions

### How does the renderer handle stale/cached artifact data across route transitions?
The plan doesn't address component re-mounting. When the user navigates between `pipeline_health` and `dlq_operations`, React unmounts and remounts the page component, which re-triggers the hook. This is correct behavior. But within the same dashboard across client/env changes (Concern 3), the stale data issue exists. The hook's dependency array design resolves this.

### What is the page-level container style?
Both existing dashboards use identical page styles:
```javascript
{ maxWidth: 900, margin: "0 auto", padding: "2rem 1.5rem", background: theme.background, minHeight: "100vh" }
```
The renderer must apply these same styles. The plan mentions `pageStyles` in pseudocode but doesn't define them. Implementation should copy these from the existing dashboards directly.

---

## 6. Recommended Improvements

1. **In `useDashboardArtifacts`:** Add `requireArtifact` validation loop before `Promise.all`. Derive `client`/`env` inside the hook from `useParams()`. Use `[client, env, dashboardId]` as effect dependencies.

2. **In `DashboardRenderer`:** Render `<header><h1>{definition.title}</h1></header>` after HealthBanner, before sections. Match existing `styles.header` / `styles.title` from the theme.

3. **In `widgetRegistry.js`:** Remove unused `HealthBanner` import.

4. **In `DashboardRenderer`:** Add a comment above the KPI-row heuristic: `// Phase 2 heuristic: all-kpi_card sections render as flex row. Replace with explicit layout hints in Phase 6.`

5. **Post-migration:** Migrate `DlqOperations` in a follow-up (not Phase 2). Use the two-`data_table` case as validation that field-based extraction works correctly across multiple same-type widgets.

---

## 7. Implementation Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| `requireArtifact` omitted from hook → partial-run errors become silent 404s | High if omitted | Add validation explicitly per concern 1 |
| Missing title header → visual regression on migration | High if omitted | Render `definition.title` in `<h1>` per concern 2 |
| Stale data on scope change | Medium (inherited bug) | Fix effect dependencies in new hook per concern 3 |
| Phase 2 KPI heuristic breaks for future mixed sections | Low in Phase 2 | Code comment + Phase 6 plan item |
| Build error from JSON import path | Low | Vite handles JSON imports natively; path must be relative from component file |

---

## 8. Approval Recommendation

**APPROVED WITH REVISIONS**

Implementation may proceed. The four items in Section 3 must be addressed before the migration is considered complete:

1. Add `requireArtifact` validation in `useDashboardArtifacts`
2. Render `definition.title` in a header block in `DashboardRenderer`
3. Fix `useEffect` dependency array in `useDashboardArtifacts` to `[client, env, dashboardId]`
4. Remove dead `HealthBanner` import from `widgetRegistry.js`

None require plan revision. All can be addressed inline during implementation.
