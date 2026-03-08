# Dashboard Navigation — Phase 1 Implementation Plan

**Feature:** Dashboard Navigation
**Phase:** Phase 1 — Foundational Navigation
**Status:** APPROVED WITH MINOR REVISIONS
**Review artifact:** `docs/reviews/dashboard_navigation_review.md`
**Date:** 2026-03-08

---

## Context

The reporting portal has no navigation chrome. Users cannot switch dashboards without editing
the URL manually. This plan implements Phase 1: a persistent top navigation bar driven by the
dashboard registry, using the React Router v6 layout route (`<Outlet>`) pattern.

This plan incorporates findings from the architecture review (round 2):
- Separate nav metadata from the component registry (non-breaking)
- `AppShell.jsx` + `<Outlet>` layout route (React Router v6 canonical pattern)
- Registry-driven fallback (`dashboardMeta[0].id`)
- `NavLink` built-in style function for active state (prefix matching)
- Cashmere nav color tokens added before implementation
- `useArtifactPath` hook introduced for Phase 2 readiness
- Explicit array ordering via `dashboardMeta`

---

## Goal

Add a persistent top navigation bar so users can switch between dashboards in one click.

Requirements:
- Registry-driven: adding a plugin to the registry automatically adds a tab
- Active-state aware: current dashboard tab is highlighted with blue text + bottom border
- Non-breaking: existing dashboard view components are unchanged
- Layout-extensible: Phase 2 identity bar slots above NavBar inside `AppShell` with no restructuring

---

## Files to Create

| File | Purpose |
|------|---------|
| `portal/src/AppShell.jsx` | Layout wrapper; renders NavBar + `<Outlet>`; Phase 2 adds identity bar here |
| `portal/src/components/NavBar.jsx` | Top navigation bar; reads `dashboardMeta`; uses `NavLink` for active state |
| `portal/src/hooks/useArtifactPath.js` | Artifact path resolver hook; Phase 1 returns static path; Phase 2 injects client/env |
| `docs/reviews/dashboard_navigation_review.md` | Review artifact (produced alongside this plan) |

---

## Files to Modify

| File | Change |
|------|--------|
| `portal/src/App.jsx` | Wrap routes in `<Route element={<AppShell />}>` layout route; registry-driven fallback |
| `portal/src/dashboards/index.js` | Add `dashboardMeta` named export (array); existing `dashboards` export unchanged |
| `portal/src/theme/cashmereTheme.js` | Add nav color tokens: `navBg`, `navBorder`, `navText`, `navActiveText`, `navActiveBorder` |

---

## Unchanged Components

- `portal/src/dashboards/dlq_operations/DlqOperations.jsx`
- `portal/src/dashboards/pipeline_health/PipelineHealth.jsx`
- `portal/src/components/HealthBanner.jsx`
- `portal/src/components/KpiCard.jsx`
- `portal/src/components/TopSitesTable.jsx`
- `portal/src/components/ExceptionsTable.jsx`
- `portal/src/components/TrendChart.jsx`
- `portal/src/main.jsx`
- All publisher code, SQL, validators, and artifact schemas

---

## Portal Changes

### 1. `portal/src/theme/cashmereTheme.js` — add nav tokens

Append a `// Navigation` section to the theme object:

```javascript
// Navigation
navBg:           "#FFFFFF",   // surface white — nav sits on white
navBorder:       "#E2E8F0",   // divider — bottom border under nav
navText:         "#475569",   // textSecondary — inactive tab label
navActiveText:   "#1D4ED8",   // primaryBlue — active tab label
navActiveBorder: "#1D4ED8",   // primaryBlue — active tab bottom indicator
```

---

### 2. `portal/src/dashboards/index.js` — add `dashboardMeta` export

Add `dashboardMeta` named export below the existing `dashboards` export.
The existing `dashboards` export and App.jsx routing are unchanged.

`dashboardMeta` is an **array** to guarantee explicit tab ordering with no implicit
JS object key ordering dependency. Keep `dashboardMeta` ids in sync with `dashboards` keys.

```javascript
import DlqOperations from "./dlq_operations/DlqOperations.jsx";
import PipelineHealth from "./pipeline_health/PipelineHealth.jsx";

// Component registry — drives routing. Maps dashboard_id → view component.
// To add a new dashboard: import its view component and add one entry here AND to dashboardMeta below.
export const dashboards = {
  dlq_operations: DlqOperations,
  pipeline_health: PipelineHealth,
};

// Navigation metadata — drives NavBar tab rendering.
// Array form ensures explicit tab ordering (no implicit object key order dependency).
// IMPORTANT: keep ids in sync with dashboards keys above. Both must be updated together.
export const dashboardMeta = [
  { id: "dlq_operations",  label: "DLQ Operations" },
  { id: "pipeline_health", label: "Pipeline Health" },
];
```

---

### 3. `portal/src/AppShell.jsx` — new layout component

Layout shell using React Router v6 `<Outlet>`. NavBar renders above every route.
Phase 2 adds an identity bar (client/env switcher) above `<NavBar />` inside this component.

```jsx
import { Outlet } from "react-router-dom";
import NavBar from "./components/NavBar.jsx";

export default function AppShell() {
  return (
    <div>
      <NavBar />
      <Outlet />
    </div>
  );
}
```

---

### 4. `portal/src/App.jsx` — layout route + registry-driven fallback

```jsx
import { Routes, Route, Navigate } from "react-router-dom";
import { dashboards, dashboardMeta } from "./dashboards/index.js";
import AppShell from "./AppShell.jsx";

const defaultPath = `/${dashboardMeta[0].id}`;

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        {Object.entries(dashboards).map(([id, Component]) => (
          <Route key={id} path={`/${id}`} element={<Component />} />
        ))}
        <Route path="*" element={<Navigate to={defaultPath} replace />} />
      </Route>
    </Routes>
  );
}
```

---

### 5. `portal/src/components/NavBar.jsx` — new nav component

NavBar is intentionally **full-width** (no `maxWidth` constraint) to provide clear visual
separation between global navigation chrome and the 900px-centered content area below.

`NavLink` without the `end` prop uses prefix matching by default in React Router v6.
This means Phase 3 sub-routes under `/<dashboardId>/...` will correctly highlight the
parent tab without any changes to this component.

Development-mode sync check warns if a `dashboardMeta` entry has no matching route.

```jsx
import { NavLink } from "react-router-dom";
import { theme } from "../theme/cashmereTheme";
import { dashboards, dashboardMeta } from "../dashboards/index.js";

// Dev-only: warn if dashboardMeta has entries not matched in dashboards registry
if (import.meta.env.DEV) {
  const routeIds = new Set(Object.keys(dashboards));
  dashboardMeta.forEach(({ id }) => {
    if (!routeIds.has(id)) {
      console.warn(`NavBar: dashboardMeta entry "${id}" has no matching route in dashboards registry.`);
    }
  });
}

const styles = {
  // NavBar is intentionally full-width; content area centers at maxWidth 900 below.
  nav: {
    background: theme.navBg,
    borderBottom: `1px solid ${theme.navBorder}`,
    display: "flex",
    alignItems: "center",
    padding: "0 1.5rem",
    height: "3rem",
  },
  brand: {
    fontSize: "0.875rem",
    fontWeight: 700,
    color: theme.textPrimary,
    letterSpacing: "0.04em",
    marginRight: "2rem",
    flexShrink: 0,
  },
  tabList: {
    display: "flex",
    alignItems: "stretch",
    height: "100%",
    // NOTE: tab overflow threshold is approximately 6–8 tabs at standard viewport widths.
    // When approaching that count, revisit with a dropdown or scrollable tab strategy.
  },
  tab: (isActive) => ({
    display: "flex",
    alignItems: "center",
    padding: "0 1rem",
    fontSize: "0.875rem",
    fontWeight: isActive ? 600 : 400,
    color: isActive ? theme.navActiveText : theme.navText,
    textDecoration: "none",
    borderBottom: isActive
      ? `2px solid ${theme.navActiveBorder}`
      : "2px solid transparent",
    whiteSpace: "nowrap",
  }),
};

export default function NavBar() {
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
    </nav>
  );
}
```

---

### 6. `portal/src/hooks/useArtifactPath.js` — new path resolver hook

Introduced in Phase 1 to decouple artifact fetch paths from dashboard components.
Phase 2 updates this hook to inject `clientId`/`env` — dashboard components require
no changes at that point. New dashboard components added after Phase 1 should use this hook.

Existing components (`DlqOperations.jsx`, `PipelineHealth.jsx`) are NOT retrofitted in
Phase 1 — that is a Phase 2 migration step.

```javascript
/**
 * useArtifactPath — returns a path resolver for dashboard artifact fetches.
 *
 * Phase 1: returns the static path /<dashboardId>/<filename>
 * Phase 2: will accept clientId and env, returning /<clientId>/<env>/<dashboardId>/<filename>
 *
 * New dashboard components should use this hook instead of constructing paths directly.
 * Example: const path = useArtifactPath("dlq_operations"); path("manifest.json")
 */
export function useArtifactPath(dashboardId) {
  return (filename) => `/${dashboardId}/${filename}`;
}
```

---

## Verification Steps

### 1. Dev server — visual and functional

```
cd portal && npm run dev
```

Open `http://localhost:5173`:
- NavBar renders at top with "Reporting Platform" wordmark and two tabs
- Default route `/` redirects to `/dlq_operations`; "DLQ Operations" tab shows blue text + bottom border
- Clicking "Pipeline Health" navigates; active state moves to that tab
- Browser back/forward works; active tab updates correctly
- Both dashboards render HealthBanner, KPIs, tables, and charts without visual regression

### 2. Deep link
- Load `http://localhost:5173/pipeline_health` directly → Pipeline Health tab highlighted immediately

### 3. Production build
```
cd portal && npm run build
```
Exits 0.

### 4. Publisher regression
```
publisher run --env local --dashboard dlq_operations
publisher run --env local --dashboard pipeline_health
```
Both exit 0 with same artifacts as before.

---

## Negative Tests

1. Navigate to `http://localhost:5173/nonexistent` → redirects to `/dlq_operations`

2. Remove `pipeline_health` from `dashboardMeta` only:
   → Tab disappears; dev console shows no warning (because `dashboards` still has the key)
   → Direct URL `/pipeline_health` still routes correctly

3. Add `{ id: "missing_dashboard", label: "Missing" }` to `dashboardMeta` only:
   → Dev console: `NavBar: dashboardMeta entry "missing_dashboard" has no matching route...`
   → Tab appears; clicking it redirects to fallback

---

## Phase 2 Preview (out of scope — documented for continuity)

1. Add identity bar inside `AppShell.jsx` above `<NavBar />`
2. Introduce `/:clientId/:env` URL prefix in `App.jsx`
3. Update `useArtifactPath` to accept and inject `clientId`/`env`
4. Migrate `DlqOperations.jsx` and `PipelineHealth.jsx` to use `useArtifactPath`
5. Backward-compatible redirect: old flat URLs → new prefixed URLs

---

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Registry schema | Separate `dashboardMeta` array; `dashboards` unchanged | Non-breaking; separates routing concern from nav metadata |
| Layout pattern | `AppShell.jsx` + `<Outlet>` | React Router v6 canonical layout route |
| Active state | `NavLink` built-in style function | No `useLocation()` needed; prefix matching handles Phase 3 sub-routes |
| Tab ordering | Array `dashboardMeta` | Explicit ordering; no implicit JS key-order dependency |
| Fallback route | `dashboardMeta[0].id` | Registry-driven; self-corrects as plugins change |
| NavBar width | Full-width | Standard platform chrome pattern; clear visual boundary |
| `useArtifactPath` | Introduced, not retrofitted | Zero Phase 1 impact; Phase 2 migration is mechanical |
| Nav tokens | Added to `cashmereTheme.js` | No hardcoded hex values; Cashmere design contract |
