# Plan: Dashboard Registry (Feature 9)

## 1. Feature Overview

Replace the two-export pattern in `portal/src/dashboards/index.js` with a single
`dashboardRegistry` array.  Each entry is a complete descriptor containing everything
needed to register a dashboard: its id, label, and component.  Consumers (`App.jsx`,
`NavBar.jsx`) derive what they need from this one source.

---

## 2. Current Dashboard Discovery Limitation

`portal/src/dashboards/index.js` currently exports two structures:

```js
// Component map — drives routing
export const dashboards = {
  dlq_operations: DlqOperations,
  pipeline_health: PipelineHealth,
};

// Navigation metadata — drives NavBar tab rendering
// IMPORTANT: keep ids in sync with dashboards keys above
export const dashboardMeta = [
  { id: "dlq_operations",  label: "DLQ Operations"  },
  { id: "pipeline_health", label: "Pipeline Health" },
];
```

Adding a new dashboard requires editing **both** structures and keeping them in sync.
The file itself warns about this with a comment and a DEV-only `console.warn` in
`NavBar.jsx` that checks for drift.

This is an ad-hoc workaround for a structural problem: dashboard identity is split
across two data structures with no enforced relationship.

---

## 3. Proposed Registry Design

A single `dashboardRegistry` array where each entry is a complete descriptor:

```js
/**
 * @typedef {Object} DashboardRegistryEntry
 * @property {string}              id         Route segment and unique key.
 * @property {string}              label      NavBar tab label.
 * @property {React.ComponentType} component  View component to render at this route.
 */

export const dashboardRegistry = [
  { id: "dlq_operations",  label: "DLQ Operations",  component: DlqOperations  },
  { id: "pipeline_health", label: "Pipeline Health", component: PipelineHealth },
];
```

Array order is the tab order — explicit, not dependent on object key iteration.

Future fields can be added per-entry without changing consumers:

| Field | Purpose | Phase |
|-------|---------|-------|
| `icon` | NavBar icon rendering | Future |
| `description` | Tooltip or index page | Future |
| `category` | Tab grouping | Future |
| `definitionPath` | Path to definition.json for DashboardRenderer dashboards | Future |

---

## 4. Route / Metadata Handling

The `id` field serves as the route segment — same as today.  `App.jsx` generates one
`<Route path={entry.id} element={<entry.component />} />` per registry entry.

The default landing dashboard is `dashboardRegistry[0].id` — same semantics as the
current `dashboardMeta[0].id`.

---

## 5. Files to Create or Modify

### `portal/src/dashboards/index.js` (modify)

Replace both exports with one:

```js
import DlqOperations  from "./dlq_operations/DlqOperations.jsx";
import PipelineHealth from "./pipeline_health/PipelineHealth.jsx";

/**
 * @typedef {Object} DashboardRegistryEntry
 * @property {string}              id         Route segment and unique key.
 * @property {string}              label      NavBar tab label.
 * @property {React.ComponentType} component  View component to render at this route.
 */

export const dashboardRegistry = [
  { id: "dlq_operations",  label: "DLQ Operations",  component: DlqOperations  },
  { id: "pipeline_health", label: "Pipeline Health", component: PipelineHealth },
];
```

Remove the old `dashboards`, `dashboardMeta` exports and the "keep ids in sync"
comment.

---

### `portal/src/App.jsx` (modify)

```js
import { dashboardRegistry } from "./dashboards/index.js";

const defaultDashboard = dashboardRegistry[0].id;

// Route generation inside <Route path="/:client/:env">:
{dashboardRegistry.map(({ id, component: Component }) => (
  <Route key={id} path={id} element={<Component />} />
))}
```

---

### `portal/src/components/NavBar.jsx` (modify)

```js
import { dashboardRegistry } from "../dashboards/index.js";

// Remove the DEV-only sync check block entirely.

// Tab rendering:
{dashboardRegistry.map(({ id, label }) => (
  <NavLink key={id} to={`/${client}/${env}/${id}`} style={({ isActive }) => styles.tab(isActive)}>
    {label}
  </NavLink>
))}
```

---

### Files NOT Modified

- `DlqOperations.jsx`, `PipelineHealth.jsx` — view components unchanged
- `AppShell.jsx`, `RunHistory.jsx`, `RunDetail.jsx`, `RunCompare.jsx`
- `DashboardRenderer.jsx`, `DashboardGrid.jsx`, all hooks
- All `definition.json` files, publisher files

---

## 6. Risks / Tradeoffs

| Risk | Assessment | Mitigation |
|------|-----------|------------|
| Other consumers import `dashboards` or `dashboardMeta` | Low — only `App.jsx` and `NavBar.jsx` import these exports | Confirmed by source inspection |
| Array order differs from previous object key order | None — current key order matches intended array order | Array is more explicit and reliable than key order |
| Forgetting to import the component in index.js | Same as before — still one line per dashboard | JSDoc typedef documents expected shape |
| Future entry fields added inconsistently | Low risk at current scale | JSDoc typedef guides future additions |

---

## 7. Verification Checklist

- [ ] `npm test` in `portal/` — all 82 tests pass
- [ ] App loads at `http://localhost:5173/` — redirects to `dlq_operations`, no blank screen
- [ ] NavBar shows "DLQ Operations" and "Pipeline Health" tabs; both routes render correctly
- [ ] **Minimal friction smoke test**: add a third dummy entry to `dashboardRegistry` with
      a placeholder component; confirm the tab and route appear **without modifying
      `App.jsx` or `NavBar.jsx`**
- [ ] Remove the dummy entry — tab and route disappear cleanly; no other changes needed
