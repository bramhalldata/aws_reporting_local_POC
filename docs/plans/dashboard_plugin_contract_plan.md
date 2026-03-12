# Feature Plan: Dashboard Plugin Contract

**Feature:** Dashboard Plugin Contract
**Stage:** Plan
**Date:** 2026-03-12

---

## 1. Feature Overview

The platform has three configuration-driven registries — dashboards, widgets, and metrics — plus
a widget preset system.  Today all registries are plain JS objects and arrays.  Adding a new
dashboard means editing core files: `dashboards/index.js`, `widgetRegistry.js`, and
`metricCatalog.js`.

This feature defines a **plugin contract**: a lightweight, documented interface that lets a
self-contained module contribute dashboards, widgets, metric definitions, and widget presets
without touching any core registry file.  No marketplace, no sandboxing, no remote loading —
just a clean registration boundary.

---

## 2. Why Pluginability Matters

| Without a plugin contract | With a plugin contract |
|--------------------------|------------------------|
| Adding a dashboard requires editing 1–3 core files | A plugin module is self-contained |
| No documented shape for widget contributions | Explicit `DashboardPlugin` type contract |
| Accidental key collisions are silent | `registerPlugin` warns on ID/key conflicts |
| Extension point is implicit (direct object mutation) | Extension point is explicit and documented |

The platform already supports multiple clients via configuration.  A plugin contract extends
this to support modular capability add-ons without forking core code.

---

## 3. Proposed Plugin Contract

### 3.1 Plugin object shape

A plugin is a plain JavaScript object.  All fields are optional.

```js
/**
 * @typedef {Object} DashboardPlugin
 *
 * @property {Array<{id: string, label: string, component: React.ComponentType}>} [dashboards]
 *   Dashboard registry entries.  Each id must be unique across all registered dashboards.
 *   Adding an entry automatically creates a route and a NavBar tab.
 *
 * @property {Record<string, WidgetRegistryEntry>} [widgets]
 *   Widget type definitions keyed by widget type string (e.g. "kpi_card").
 *   Each entry: { component: React.ComponentType, propsAdapter: (widget, data, filterState) => Object }
 *
 * @property {Record<string, MetricDefinition>} [metrics]
 *   Metric catalog entries keyed by metric id.
 *   Each entry: { label, formatter, tone, footnote, data_source_field, trend, thresholds }
 *
 * @property {Record<string, WidgetPreset>} [presets]
 *   Widget preset templates keyed by preset id.
 *   Each entry: { type, metric, data_source, layout }
 */
```

### 3.2 Plugin example

```js
// portal/src/plugins/my_reports/index.js
import MyReportsDashboard from "./MyReportsDashboard.jsx";
import { MyKpiCard }      from "./MyKpiCard.jsx";

export const myReportsPlugin = {
  dashboards: [
    { id: "my_reports", label: "My Reports", component: MyReportsDashboard },
  ],
  widgets: {
    my_kpi_card: {
      component: MyKpiCard,
      propsAdapter: (widget, data, filterState) => ({
        title: widget.label ?? "KPI",
        value: data,
        filter: filterState?.date_range ?? "7d",
      }),
    },
  },
  metrics: {
    my_custom_metric: {
      label:             "Custom Metric",
      formatter:         "number",
      tone:              "neutral",
      footnote:          null,
      data_source_field: "custom_metric",
      trend:             null,
      thresholds:        [],
    },
  },
  presets: {
    my_kpi_preset: {
      type:        "my_kpi_card",
      metric:      "my_custom_metric",
      data_source: { artifact: "summary.json", field: "custom_metric" },
      layout:      { col: 0, row: 0, w: 6, h: 2 },
    },
  },
};
```

### 3.3 `registerPlugin(plugin)` function

```js
// portal/src/plugins/registerPlugin.js
import { dashboardRegistry } from "../dashboards/index.js";
import { widgetRegistry }    from "../widgetRegistry.js";
import { metricCatalog }     from "../metricCatalog.js";
import { widgetPresets }     from "../dashboards/widgetPresets.js";

export function registerPlugin(plugin) {
  if (plugin.dashboards) {
    for (const entry of plugin.dashboards) {
      if (dashboardRegistry.find((d) => d.id === entry.id)) {
        console.warn(`[registerPlugin] Dashboard id "${entry.id}" already registered. Skipping.`);
        continue;
      }
      dashboardRegistry.push(entry);
    }
  }
  if (plugin.widgets) {
    for (const key of Object.keys(plugin.widgets)) {
      if (Object.prototype.hasOwnProperty.call(widgetRegistry, key)) {
        console.warn(`[registerPlugin] Widget type "${key}" already registered. Overwriting.`);
      }
    }
    Object.assign(widgetRegistry, plugin.widgets);
  }
  if (plugin.metrics) {
    for (const key of Object.keys(plugin.metrics)) {
      if (Object.prototype.hasOwnProperty.call(metricCatalog, key)) {
        console.warn(`[registerPlugin] Metric "${key}" already registered. Overwriting.`);
      }
    }
    Object.assign(metricCatalog, plugin.metrics);
  }
  if (plugin.presets) {
    for (const key of Object.keys(plugin.presets)) {
      if (Object.prototype.hasOwnProperty.call(widgetPresets, key)) {
        console.warn(`[registerPlugin] Preset "${key}" already registered. Overwriting.`);
      }
    }
    Object.assign(widgetPresets, plugin.presets);
  }
}
```

### 3.4 Bootstrap module

```js
// portal/src/plugins/index.js
// Plugin bootstrap — import and register plugins here.
// All registrations run at module evaluation time, before App renders.
//
// Example:
//   import { myReportsPlugin } from "./my_reports/index.js";
//   import { registerPlugin }  from "./registerPlugin.js";
//   registerPlugin(myReportsPlugin);
//
// Convention: one registerPlugin() call per plugin module.

export {};
```

### 3.5 App.jsx integration (one line)

```js
// At the top of App.jsx, before any other imports that read registries:
import "./plugins/index.js";  // side-effect: registers all plugins before routes render
```

---

## 4. Registry Integration Model

### How each registry is extended

| Registry | Mechanism | Collision behaviour |
|----------|-----------|---------------------|
| `dashboardRegistry` (array) | `push(entry)` — skips duplicate ids | warn + skip |
| `widgetRegistry` (object) | `Object.assign` | warn + overwrite |
| `metricCatalog` (object) | `Object.assign` | warn + overwrite |
| `widgetPresets` (object) | `Object.assign` | warn + overwrite |

### Why mutation works here

All registries are module-level singletons.  ES module evaluation order is deterministic:
`plugins/index.js` is imported before `App.jsx` uses any registry for routing or rendering.
By the time React renders `<App>`, all plugin entries are present in all registries.

### Zero changes to core rendering pipeline

| File | Change required? |
|------|-----------------|
| `DashboardRenderer.jsx` | No — reads `widgetPresets` via `resolveWidgets` (already live object) |
| `WidgetRenderer.jsx` | No — reads `widgetRegistry` by type key (already live object) |
| `NavBar.jsx` | No — iterates `dashboardRegistry` (array; plugin entries present at render) |
| `App.jsx` routing | One import line only |

---

## 5. Files to Create or Modify

### Create

| File | Purpose |
|------|---------|
| `portal/src/plugins/registerPlugin.js` | Registration function with collision guards and JSDoc types |
| `portal/src/plugins/index.js` | Bootstrap module — defines extension point, initially empty |

### Modify

| File | Change |
|------|--------|
| `portal/src/App.jsx` | Add `import "./plugins/index.js";` at top |
| `docs/guides/add-dashboard.md` | Add "Contributing via a plugin" section |

### Not modified

- `portal/src/dashboards/index.js` — dashboardRegistry stays as-is; plugins push entries
- `portal/src/widgetRegistry.js` — stays as-is; plugins assign keys
- `portal/src/metricCatalog.js` — stays as-is; plugins assign keys
- `portal/src/dashboards/widgetPresets.js` — stays as-is; plugins assign keys
- All render components and hooks

---

## 6. Risks / Tradeoffs

| Risk | Mitigation |
|------|-----------|
| ID collision between two plugins or between a plugin and a core dashboard | `registerPlugin` warns + skips duplicate dashboard ids |
| Widget/metric/preset key collision | `registerPlugin` warns before overwriting — visible in dev console |
| Import order dependency (plugins must run before routes render) | Single import at top of `App.jsx`; comment documents requirement |
| Mutable registry objects can be modified anywhere | Document in `registerPlugin.js` that direct mutation outside `registerPlugin` is unsupported |
| Plugin contract shape not validated at runtime | Acceptable for v1; WidgetRenderer already renders `UnknownWidget` for unresolvable types |
| No automated test for registration | `registerPlugin` is a pure function of mutable objects — can be unit tested with mock registries |

---

## 7. Verification Checklist

- [ ] **Conceptual plugin** — write out the `myReportsPlugin` example (§3.2) and confirm every
  field maps to an existing registry shape without any new type definitions required
- [ ] **Core renderer unchanged** — confirm `DashboardRenderer`, `WidgetRenderer`, `NavBar`,
  and App routing do not require any logic changes; only `App.jsx` gets the import line
- [ ] **Modular dashboard add** — trace: plugin defines `dashboards` entry →
  `registerPlugin` pushes to `dashboardRegistry` → `NavBar` renders tab →
  `App.jsx` route renders component → `DashboardRenderer` renders definition
- [ ] **Modular widget add** — trace: plugin defines `widgets` entry with type key →
  `registerPlugin` assigns to `widgetRegistry` → `WidgetRenderer` resolves by type key
- [ ] **Collision guard** — confirm `console.warn` fires for duplicate dashboard id;
  confirm duplicate widget key also warns before overwrite
- [ ] **Bootstrap timing** — confirm `plugins/index.js` import precedes all registry reads
  in `App.jsx` module evaluation order
- [ ] **`add-dashboard.md` update** — confirm guide documents the plugin path as an
  alternative to direct registry editing
