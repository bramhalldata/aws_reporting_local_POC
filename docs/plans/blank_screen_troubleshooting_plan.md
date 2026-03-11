# Plan: Blank White Screen Troubleshooting — Post-Feature Runtime Failure

**Date:** 2026-03-11
**Symptom:** App shows blank white screen at `http://localhost:5173/`
**Status:** Root cause identified via static code and package inspection

---

## 1. Symptom Summary

Loading `http://localhost:5173/` produces a completely blank white screen.  Build passes.
Tests pass (82/82).  The failure is a **runtime module load error** that occurs before
React mounts, so it produces no React error boundary output.

The browser console will show an error similar to:

```
TypeError: WidthProvider is not a function
    at DashboardGrid.jsx:6
```

or:

```
Uncaught TypeError: WidthProvider is not a function
    at Module eval (DashboardGrid.jsx)
```

The error happens at module evaluation time, before any component renders.

---

## 2. Most Likely Root Causes (Ranked)

### #1 — CONFIRMED: `WidthProvider` is not exported from `react-grid-layout` v2 main ESM entry

**Confidence: High (verified by package inspection)**

`DashboardGrid.jsx` line 6:
```js
import GridLayout, { WidthProvider } from "react-grid-layout";
```

In `react-grid-layout` v2, the package exports field maps the main entry to
`dist/index.mjs`.  Inspecting `dist/index.mjs`:

```
export { GridLayout as default, GridLayout, ResponsiveGridLayout, ... }
```

`WidthProvider` is **not exported** from `dist/index.mjs`.  It was moved to
`dist/legacy.mjs`, accessible only via the `"react-grid-layout/legacy"` subpath.

`WidthProvider` resolves as `undefined`.  The next line:

```js
const ResponsiveGridLayout = WidthProvider(GridLayout);  // line 6, module scope
```

...executes at module load time and throws `TypeError: WidthProvider is not a function`.

**Impact of this single failure:**

```
DashboardGrid.jsx          ← TypeError thrown here
  ↑ imported by
DashboardRenderer.jsx      ← fails to load
  ↑ imported by
PipelineHealth.jsx         ← fails to load
  ↑ imported by
dashboards/index.js        ← fails to load
  ↑ imported by
App.jsx                    ← fails to load
  ↑ imported by
main.jsx                   ← React never mounts → blank screen
```

All dashboards are eagerly imported in `dashboards/index.js`.  A single module-load
failure anywhere in the chain prevents React from mounting entirely.

---

### #2 — Possible secondary: Vite development server error overlay hidden

If the Vite error overlay is suppressed (e.g. by a browser extension or custom Vite
config), the blank screen has no error shown.  Check browser DevTools → Console tab
directly.

---

### #3 — Unlikely: localStorage malformed state

`useDashboardLayout` wraps all `localStorage` calls in try/catch.  Malformed saved
state would fall back to definition defaults.  This cannot cause a blank screen.

---

### #4 — Unlikely: DashboardRenderer hook ordering

`useDashboardLayout` and `useDashboardArtifacts` are called unconditionally.  No hook
rules violations exist in the current `DashboardRenderer.jsx` code.

---

### #5 — Unlikely: Definition JSON schema drift

Both `definition.json` files have valid structure.  Widget IDs match section
`widget_ids`.  Grid sections have `col/row/w/h` on all widgets.

---

## 3. Fastest Isolation Path

**Step 1: Check browser console (30 seconds)**

Open DevTools → Console.  A module-level `TypeError` will be visible immediately.
If the error names `WidthProvider` or references `DashboardGrid.jsx`, root cause #1
is confirmed and no further isolation is needed.

**Step 2 (if console is unclear): Temporarily bypass grid rendering (2 minutes)**

In `DashboardGrid.jsx`, comment out the `WidthProvider` import and the module-level
constant:

```js
// import GridLayout, { WidthProvider } from "react-grid-layout";
// const ResponsiveGridLayout = WidthProvider(GridLayout);
```

If the app loads (even without grid widgets), the module-load chain error is confirmed.

**Step 3 (if needed): Reduce to DlqOperations only (2 minutes)**

`DlqOperations.jsx` is hand-composed and does not use `DashboardGrid`.  In
`dashboards/index.js`, temporarily comment out `PipelineHealth`:

```js
// import PipelineHealth from "./pipeline_health/PipelineHealth.jsx";
```

If `dlq_operations` loads correctly, the failure is isolated to the `PipelineHealth`
→ `DashboardRenderer` → `DashboardGrid` chain.

**Step 4: Clear localStorage**

In DevTools → Application → Storage → Clear site data.  Reload.  If behaviour
changes, localStorage state was involved.  (Unlikely given try/catch protection.)

---

## 4. Component-by-Component Debug Checklist

### `DashboardGrid.jsx`
- [ ] Console error names `WidthProvider` or line 6
- [ ] Verify `import { WidthProvider } from "react-grid-layout"` resolves to `undefined` in v2 ESM entry
- [ ] Verify `react-grid-layout/legacy` exports `WidthProvider`

### `DashboardRenderer.jsx`
- [ ] Confirm it loads after `DashboardGrid.jsx` fix
- [ ] Verify `useDashboardLayout` import is named: `import { useDashboardLayout } from ...`
- [ ] Verify `useState` is removed from imports (no longer used directly)
- [ ] Verify `hasGridSections` derived correctly before render

### `useDashboardLayout.js`
- [ ] Confirm named export: `export function useDashboardLayout(definition)`
- [ ] Confirm `useState` and `useEffect` imports are present
- [ ] Confirm try/catch on all localStorage operations

### `PipelineHealth.jsx`
- [ ] Confirm it renders `<DashboardRenderer definition={definition} />` correctly after fix
- [ ] Navigate to `pipeline_health` route; confirm grid renders

### `DlqOperations.jsx`
- [ ] Confirm it is hand-composed (does not use DashboardRenderer)
- [ ] Navigate to `dlq_operations` route; confirm it renders independently

---

## 5. Definition / Data Validation Checklist

### `dlq_operations/definition.json`
- [ ] `kpis` section: `"layout": { "type": "grid" }` — present
- [ ] Both KPI widgets have `layout.col`, `layout.row`, `layout.w`, `layout.h` — present
- [ ] Both KPI widgets have `"metric"` field matching `metricCatalog` entries
- [ ] Stack sections (`top_sites_7d`, `trends`, `top_sites_30d`, `exceptions`) unchanged

### `pipeline_health/definition.json`
- [ ] `kpis` section: `"layout": { "type": "grid" }` — present
- [ ] Three KPI widgets have `layout.col`, `layout.row`, `layout.w`, `layout.h` — present
- [ ] `failure_types_table` section: `"layout": { "type": "stack" }` — present

**Note:** `DlqOperations.jsx` is hand-composed and does NOT read `definition.json`.  The
`dlq_operations` definition JSON is only used if/when that dashboard is converted to
`DashboardRenderer`.  Definition JSON validation is only runtime-relevant for
`PipelineHealth` at present.

---

## 6. Safe Diagnostic Edits

All diagnostic edits below are reversible and leave no permanent changes.

### Diagnostic A: Comment out DashboardGrid import to confirm failure source

In `portal/src/components/DashboardRenderer.jsx`, comment out the DashboardGrid import:

```js
// import DashboardGrid from "./DashboardGrid.jsx";
```

If the app loads at all (likely with broken grid sections), the module-load chain
is confirmed as the source.

**Revert:** Restore the import before applying the fix.

---

### Diagnostic B: Verify WidthProvider is undefined at runtime

Add a temporary console log before line 6 of `DashboardGrid.jsx`:

```js
import GridLayout, { WidthProvider } from "react-grid-layout";
console.log("WidthProvider:", WidthProvider); // expect: undefined in v2
```

If this logs `undefined`, root cause #1 is confirmed.

**Revert:** Remove the log line before committing.

---

### Diagnostic C: Check legacy subpath exports WidthProvider

```js
import { WidthProvider } from "react-grid-layout/legacy";
console.log("WidthProvider (legacy):", WidthProvider); // expect: function
```

**Revert:** Remove before committing.

---

## 7. Expected Signals for Each Failure Point

| Failure | Console signal | Visual signal |
|---------|---------------|---------------|
| `WidthProvider` undefined (root cause #1) | `TypeError: WidthProvider is not a function` at `DashboardGrid.jsx:6` | Blank white screen |
| Import path wrong for `useDashboardLayout` | `Error: Failed to resolve import "../hooks/useDashboardLayout.js"` | Blank white screen |
| localStorage `JSON.parse` error (no try/catch) | `SyntaxError: JSON.parse` | Blank white screen or React error boundary |
| React hook order violation | `React has detected a change in the order of Hooks` | Console warning + possible re-render loop |
| Artifact fetch fails | HTTP 404 in Network tab | `ScopeEmptyState` or error box — NOT blank screen |
| Definition JSON missing field | `TypeError: Cannot read properties of undefined` in WidgetRenderer | React error boundary or unknown widget placeholder — NOT blank screen |

---

## 8. Recommended Fix After Root Cause Is Confirmed

### Fix for Root Cause #1: Change `DashboardGrid.jsx` import to legacy subpath

**File:** `portal/src/components/DashboardGrid.jsx`

**Before:**
```js
import GridLayout, { WidthProvider } from "react-grid-layout";
```

**After:**
```js
import GridLayout, { WidthProvider } from "react-grid-layout/legacy";
```

This uses the `./legacy` subpath export from `react-grid-layout` v2, which contains
the full legacy API including `WidthProvider`.  All other code in `DashboardGrid.jsx`
is unchanged.

**Verification after fix:**
1. App loads at `http://localhost:5173/` — no blank screen
2. Redirect to `/default/local/dlq_operations` — `DlqOperations` renders (hand-composed)
3. Navigate to `pipeline_health` — `PipelineHealth` renders with grid layout
4. Drag a KPI card — position updates
5. Reload — position persists
6. Click "Reset layout" — position resets to definition defaults
7. `npm test` — 82/82 tests pass

---

## 9. Architecture Note: DlqOperations Divergence

`DlqOperations.jsx` is currently a **hand-composed** dashboard — it fetches its own
artifacts and renders components directly.  Its `definition.json` was updated during
Features 5–7 (metric references, grid layout) but the view component does not read
the definition file.

This divergence is not a runtime bug (the hand-composed view works independently),
but it means `dlq_operations` does not benefit from the platform features added in
Features 5–8.  Converting it to `DashboardRenderer` is deferred — it is out of scope
for this troubleshooting fix.
