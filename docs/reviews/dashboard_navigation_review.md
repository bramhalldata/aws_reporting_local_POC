# Architecture Review: Dashboard Navigation — Phase 1

**Review artifact:** `docs/reviews/dashboard_navigation_review.md`
**Plan artifact reviewed:** `docs/plans/dashboard_navigation_plan.md`
**Reviewer:** Claude (staff reviewer mode)
**Date:** 2026-03-08
**Review round:** 2

---

## 1. Review Summary

This plan is the second iteration of the Dashboard Navigation Phase 1 plan, incorporating
all blocking concerns from round 1. The architecture is sound and ready for implementation.

| Round-1 Concern | Resolution |
|-----------------|------------|
| Registry schema breaking change | `dashboardMeta` added as separate export; `dashboards` unchanged |
| No `AppShell`/`<Outlet>` layout route | `AppShell.jsx` with `<Outlet>` specified |
| Hard-coded fallback | Fallback is now `dashboardMeta[0].id` |
| Exact active state match | `NavLink` style function handles prefix matching |
| No nav color tokens | Five nav tokens added to `cashmereTheme.js` |
| No `useArtifactPath` | Hook introduced in Phase 1 |
| Implicit tab ordering | `dashboardMeta` is an array |
| Phase 2 scope understated | Phase 2 migration explicitly documented |

**Recommendation: APPROVED WITH MINOR REVISIONS**

Minor revisions are implement-time (no plan rewrite required).

---

## 2. Strengths

- **Non-breaking registry enhancement.** `dashboardMeta` as a separate export preserves
  the existing `dashboards` consumer contract. Routing logic in `App.jsx` is unchanged.

- **Correct React Router v6 layout pattern.** `AppShell.jsx` + `<Outlet>` is the documented
  React Router v6 mechanism. Phase 2 identity bar additions require no restructuring.

- **`NavLink` style function.** Avoids `useLocation()` and manual path comparison. Default
  prefix matching correctly handles Phase 3 sub-routes under `/<dashboardId>/...`.

- **Explicit tab ordering.** Array form of `dashboardMeta` removes implicit JS key-order
  dependency. Tab ordering is a documented, controllable property.

- **`useArtifactPath` hook.** Establishes the path abstraction before Phase 2 requires it.
  New dashboard components will adopt it from the start.

- **Phase 2 preview.** Scoped and documented without contaminating Phase 1 implementation.

- **Zero changes to dashboard view components.** Removes regression risk from Phase 1.

---

## 3. Architectural Concerns

### 3.1 — `dashboardMeta` / `dashboards` drift (Low)

Two parallel exports in `index.js` can diverge. If a dashboard is added to `dashboards`
without adding it to `dashboardMeta`, the route works but no tab appears.

**Resolution (implement-time):** Add a dev-mode sync check in `NavBar.jsx`:

```javascript
if (import.meta.env.DEV) {
  const routeIds = new Set(Object.keys(dashboards));
  dashboardMeta.forEach(({ id }) => {
    if (!routeIds.has(id)) {
      console.warn(`NavBar: dashboardMeta entry "${id}" has no matching route in dashboards registry.`);
    }
  });
}
```

Vite tree-shakes `import.meta.env.DEV` blocks in production builds — zero production cost.

### 3.2 — `AppShell` `minHeight: "100vh"` redundant (Low / cosmetic)

Dashboard pages already set `minHeight: "100vh"`. The `AppShell` wrapper should use a bare
`<div>` with no height constraint.

**Resolution (implement-time):** Use `<div>` without `minHeight` in `AppShell.jsx`.

### 3.3 — NavBar width unspecified (Low)

The plan did not originally specify whether NavBar is full-width or 900px-constrained.

**Resolution:** Full-width is the correct choice (confirmed). NavBar comment in the plan
documents this intent explicitly.

---

## 4. Scalability Assessment

| Scale dimension | Assessment |
|----------------|------------|
| 2 → 10+ dashboards | `dashboardMeta` array scales linearly; overflow strategy needed at ~6 tabs |
| Multi-client (Phase 2) | `AppShell` + `useArtifactPath` provide clean extension points |
| Metadata-driven nav (Phase 3) | `dashboardMeta` can be replaced with a runtime-fetched list |
| Permission filtering (Phase 3) | Filtered array passed to `NavBar` via context or prop |

No structural changes anticipated before Phase 2.

---

## 5. Missing Design Decisions

| Decision | Status |
|----------|--------|
| NavBar width (full-width vs. 900px cap) | **Resolved:** full-width, documented in plan |
| Tab overflow threshold | **Partially resolved:** comment in `NavBar.jsx` at ~6 tabs |
| `dashboardMeta` sync enforcement | **Partially resolved:** dev-mode console warning |

---

## 6. Recommended Improvements (implement-time)

| # | Improvement | Where |
|---|-------------|-------|
| 1 | Dev-mode sync check for `dashboardMeta` ↔ `dashboards` drift | `NavBar.jsx` |
| 2 | Remove `minHeight: "100vh"` from `AppShell` | `AppShell.jsx` |
| 3 | Comment confirming full-width NavBar intent | `NavBar.jsx` |
| 4 | Comment noting ~6 tab overflow threshold | `NavBar.jsx` |
| 5 | Comment reminding maintainers to keep both exports in sync | `index.js` |

---

## 7. Implementation Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| `dashboardMeta` / `dashboards` drift in future PRs | Medium | Dev-mode sync check; code comment |
| NavBar visual width mismatch vs. 900px content | Low | Full-width confirmed; comment in NavBar |
| `useArtifactPath` unused in Phase 1 causes confusion | Low | JSDoc comment explaining Phase 1 stub |
| `AppShell` wrapper breaks dashboard page styles | Very low | Page styles are self-contained |
| `npm run build` failure | Very low | Standard local imports; Vite resolves correctly |

---

## 8. Approval Recommendation

```
APPROVED WITH MINOR REVISIONS
```

All blocking concerns from round 1 are resolved. The three remaining items are
implement-time improvements — no plan revision required.

### Pre-implementation checklist

- [x] `AppShell.jsx` + `<Outlet>` layout route specified
- [x] `dashboardMeta` separate export (non-breaking)
- [x] Registry-driven fallback (`dashboardMeta[0].id`)
- [x] `NavLink` style function for active state
- [x] Five nav color tokens in `cashmereTheme.js`
- [x] `useArtifactPath` hook introduced
- [x] Array ordering for `dashboardMeta`
- [x] Phase 2 migration documented
- [x] Zero changes to dashboard view components
- [x] NavBar width confirmed (full-width)
- [x] Dev-mode sync check specified
- [x] `docs/reviews/` directory created
