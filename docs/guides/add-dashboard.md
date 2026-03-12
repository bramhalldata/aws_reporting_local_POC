# How to Add a New Dashboard

This guide covers everything needed to add a new dashboard to the portal.
Adding a dashboard requires exactly **three** files — no platform files are modified.

> **Authoritative source files:** As the platform evolves, consult these files for the
> current list of available options:
> - Widget types: `portal/src/widgetRegistry.js`
> - Metric IDs and catalog fields: `portal/src/metricCatalog.js`

---

## The 3-Step Workflow

| Step | Action |
|------|--------|
| 1 | Create `portal/src/dashboards/<id>/definition.json` |
| 2 | Create `portal/src/dashboards/<id>/<ComponentName>.jsx` |
| 3 | Add one entry to `portal/src/dashboards/index.js` |

After step 3, the new dashboard tab appears in the NavBar and its route is registered —
no changes to `App.jsx`, `NavBar.jsx`, or any other platform file.

---

## Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Dashboard ID | `snake_case` | `site_performance` |
| Folder | `portal/src/dashboards/<id>/` | `portal/src/dashboards/site_performance/` |
| View component filename | `<PascalCase>.jsx` | `SitePerformance.jsx` |
| Widget IDs | `snake_case`, unique within dashboard | `failures_24h` |
| Section IDs | `snake_case`, unique within dashboard | `kpis`, `breakdowns` |
| Artifact filenames | `snake_case.json` | `summary.json`, `top_sites.json` |

---

## Step 1 — Create `definition.json`

Create `portal/src/dashboards/<id>/definition.json` using the template below.
Replace all `<placeholder>` values.

```json
{
  "id": "<snake_case_id>",
  "title": "Human Readable Title",
  "description": "One-line description of the dashboard.",
  "schema_version": "1.0.0",
  "layout": {
    "sections": [
      {
        "id": "kpis",
        "label": "Overview",
        "description": "Optional one-sentence section subtitle.",
        "widget_ids": ["metric_a", "metric_b"],
        "layout": { "type": "grid" }
      },
      {
        "id": "details",
        "label": "Details",
        "widget_ids": ["detail_table"],
        "layout": { "type": "stack" }
      }
    ]
  },
  "widgets": [
    {
      "id": "metric_a",
      "type": "kpi_card",
      "metric": "<metric_catalog_id>",
      "data_source": { "artifact": "summary.json", "field": "<field_name>" },
      "layout": { "col": 0, "row": 0, "w": 6, "h": 2 }
    },
    {
      "id": "metric_b",
      "type": "kpi_card",
      "metric": "<metric_catalog_id>",
      "data_source": { "artifact": "summary.json", "field": "<field_name>" },
      "layout": { "col": 6, "row": 0, "w": 6, "h": 2 }
    },
    {
      "id": "detail_table",
      "type": "data_table",
      "title": "Detail Table Title",
      "data_source": { "artifact": "details.json", "field": "items" },
      "layout": { "col": 0, "row": 0, "w": 12, "h": 4 }
    }
  ],
  "filters": [
    { "id": "client",     "type": "url_param", "param": "client" },
    { "id": "env",        "type": "url_param", "param": "env" },
    { "id": "date_range", "type": "url_param", "param": "date_range", "default": "7d" }
  ],
  "defaults": {
    "section": "kpis"
  }
}
```

### Filter fields

Each entry in the `filters` array declares one URL-driven filter available to widgets.

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique filter identifier; used as the key in `filterState` passed to propsAdapters |
| `type` | Yes | Source type — `"url_param"` reads from URL path or query params |
| `param` | Yes | URL parameter name to read (path param `:client` or query `?date_range=7d`) |
| `default` | No | Value to use when the URL parameter is absent |

`filterState` is available as the third argument to any `propsAdapter` in
`portal/src/widgetRegistry.js`. Path params (`:client`, `:env`) take precedence
over query params of the same name.

### Section fields

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique identifier within the dashboard; used for layout persistence |
| `label` | No | Rendered as an h2 section heading. Omit to suppress the heading. |
| `description` | No | Optional one-sentence subtitle rendered below the heading. |
| `widget_ids` | Yes | Ordered list of widget IDs belonging to this section |
| `layout.type` | Yes | Controls widget arrangement — see table below |

### Section layout types

| `layout.type` | Behavior |
|---------------|----------|
| `"grid"` | Draggable, resizable grid; widgets use `col`, `row`, `w`, `h` for initial placement |
| `"stack"` | Vertical full-width stack; widgets rendered top-to-bottom in `widget_ids` order |

### Available widget types

| `type` | Component | Expected data shape |
|--------|-----------|---------------------|
| `kpi_card` | KpiCard | scalar number or string |
| `line_chart` | TrendChart | `[{ date, failures }]` |
| `data_table` | TopSitesTable | `[{ site, failures }]` |
| `exceptions_table` | ExceptionsTable | `[{ failure_type, count }]` |

For the current list, see `portal/src/widgetRegistry.js`. If a widget type is not
registered, `WidgetRenderer` renders a visible warning block at runtime — the app will
not crash.

### The `metric` field on `kpi_card` widgets

If a widget has a `"metric"` field, the value must be a key in
`portal/src/metricCatalog.js`. The catalog entry supplies the KPI card's label, tone,
formatter, footnote, and delta configuration.

> **If the metric ID is missing from the catalog**, the KPI card renders with a blank
> label and blank value — there is no console error. Add the catalog entry before
> testing. See `portal/src/metricCatalog.js` for the entry shape and existing examples.

Widgets without a `"metric"` field (e.g. `data_table`, `line_chart`) use their `"title"`
field directly and do not require a catalog entry.

### Widget presets

If the widget binding (type + metric + data_source) is shared with another dashboard,
you can reference a preset instead of writing all fields inline:

```json
{ "id": "failures_24h", "preset": "failures_24h_kpi" }
```

The preset provides default values for `type`, `metric`, `data_source`, and `layout`.
Dashboard-local fields override the preset — **local fields win** (shallow merge):

```json
{ "id": "failures_24h", "preset": "failures_24h_kpi",
  "layout": { "col": 0, "row": 0, "w": 4, "h": 2 } }
```

Available presets: `portal/src/dashboards/widgetPresets.js`

> **When to use a preset:** Only when the same widget binding appears in two or more
> dashboards.  Dashboard-specific widgets should stay inline.  If the preset ID does not
> exist, `WidgetRenderer` renders a warning block — check the ID against
> `widgetPresets.js`.

---

## Step 2 — Create the View Component

Create `portal/src/dashboards/<id>/<ComponentName>.jsx`. Every dashboard view component
is identical except the function name — copy this template verbatim:

```jsx
import DashboardRenderer from "../../components/DashboardRenderer.jsx";
import definition from "./definition.json";

export default function <ComponentName>() {
  return <DashboardRenderer definition={definition} />;
}
```

Reference implementation: `portal/src/dashboards/pipeline_health/PipelineHealth.jsx`

---

## Step 3 — Add the Registry Entry

Open `portal/src/dashboards/index.js` and add one import and one array entry:

```js
// 1. Add the import with the other dashboard imports
import SitePerformance from "./site_performance/SitePerformance.jsx";

// 2. Add an entry to dashboardRegistry (array order = tab order)
export const dashboardRegistry = [
  { id: "dlq_operations",  label: "DLQ Operations",  component: DlqOperations  },
  { id: "pipeline_health", label: "Pipeline Health", component: PipelineHealth },
  { id: "site_performance", label: "Site Performance", component: SitePerformance },
];
```

That's it. `App.jsx` and `NavBar.jsx` pick up the new entry automatically.

---

## What Happens at Runtime Before Publisher Artifacts Exist

When you navigate to a new dashboard before the publisher has run for that scope,
`manifest.json` will be absent. The portal renders a `ScopeEmptyState` — this is
expected and correct. No action is needed in the portal code; run the publisher to
produce artifacts.

---

## Validation Checklist

Before opening a PR:

- [ ] `definition.json` — `id` matches the folder name and the registry entry
- [ ] `definition.json` — `schema_version` is `"1.0.0"`
- [ ] All `widget_ids` in `layout.sections` have a matching entry in `widgets`
- [ ] All `kpi_card` widgets with a `"metric"` field have a matching entry in `metricCatalog.js`
- [ ] All artifact filenames referenced in `data_source.artifact` are `snake_case.json`
- [ ] View component function name matches the filename (`SitePerformance` ↔ `SitePerformance.jsx`)
- [ ] Registry entry `id` matches the folder name and `definition.json` id
- [ ] `npm test` in `portal/` — all tests pass
- [ ] Smoke test: navigate to `/<client>/<env>/<id>` — tab appears, `ScopeEmptyState` renders (if no artifacts) or dashboard renders correctly (if artifacts present)
- [ ] Remove the dashboard entry — tab disappears, no other changes needed
