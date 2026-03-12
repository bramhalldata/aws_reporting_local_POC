# Plan: Add-New-Dashboard Workflow (Feature 10)

## 1. Feature Overview

The platform now has a clean architecture: `DashboardRenderer` renders any dashboard
from a `definition.json`, `dashboardRegistry` registers it in one place, and
`useDashboardArtifacts` handles all data loading generically.  Adding a dashboard,
however, still requires knowing which files to create, what the definition schema looks
like, and where the registry entry goes.  There is no documented workflow and no
starter template.

This feature produces a developer guide (`docs/guides/add-dashboard.md`) that
consolidates everything a developer needs to add a new dashboard in one read.

---

## 2. Current Gap

No documentation describes the end-to-end workflow for adding a dashboard.  A developer
must reverse-engineer the pattern from `DlqOperations` or `PipelineHealth` and guess at
which other files to touch.  This creates friction and risks divergence from the
platform conventions.

The platform conventions are now stable enough to document:

- `DashboardRenderer` is the standard rendering path (established by Features 7–9)
- `dashboardRegistry` is the single registration point (established by Feature 9)
- `useDashboardArtifacts` handles all data loading (requires no changes per dashboard)

---

## 3. Minimal File Set per New Dashboard

Adding a dashboard requires exactly **three** things:

| # | File | Purpose |
|---|------|---------|
| 1 | `portal/src/dashboards/<id>/definition.json` | Dashboard config: title, sections, widgets, data sources, filters |
| 2 | `portal/src/dashboards/<id>/<ComponentName>.jsx` | 5-line view component delegating to `DashboardRenderer` |
| 3 | One entry in `portal/src/dashboards/index.js` | One import + one object literal in `dashboardRegistry` |

**No other platform files are modified.**  `App.jsx`, `NavBar.jsx`,
`DashboardRenderer.jsx`, and all hooks pick up the new dashboard automatically.

---

## 4. Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Dashboard ID | `snake_case` | `site_performance` |
| Folder | `portal/src/dashboards/<id>/` | `portal/src/dashboards/site_performance/` |
| View component filename | `<PascalCase>.jsx` | `SitePerformance.jsx` |
| Widget IDs | `snake_case`, unique within dashboard | `failures_24h` |
| Section IDs | `snake_case`, unique within dashboard | `kpis`, `breakdowns` |
| Artifact filenames | `snake_case.json` | `summary.json`, `top_sites.json` |

---

## 5. View Component Template

Every dashboard view component is identical except the function name:

```jsx
// portal/src/dashboards/<id>/<ComponentName>.jsx
import DashboardRenderer from "../../components/DashboardRenderer.jsx";
import definition from "./definition.json";

export default function <ComponentName>() {
  return <DashboardRenderer definition={definition} />;
}
```

Reference implementation: `portal/src/dashboards/pipeline_health/PipelineHealth.jsx`

---

## 6. Definition JSON Template

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
    { "id": "client", "type": "url_param", "param": "client" },
    { "id": "env",    "type": "url_param", "param": "env" }
  ],
  "defaults": {
    "section": "kpis"
  }
}
```

### Section layout types

| `layout.type` | Behavior |
|---------------|----------|
| `"grid"` | Draggable, resizable grid (react-grid-layout); widgets use `col/row/w/h` |
| `"stack"` | Vertical full-width stack; widgets ignore `col/row/w/h` |

### Available widget types

| `type` | Component | Expected data shape |
|--------|-----------|---------------------|
| `kpi_card` | KpiCard | scalar number or string |
| `line_chart` | TrendChart | `[{ date, failures }]` |
| `data_table` | TopSitesTable | `[{ site, failures }]` |
| `exceptions_table` | ExceptionsTable | `[{ failure_type, count }]` |

Source: `portal/src/widgetRegistry.js`

### Widget `metric` field

If the widget has a `"metric"` field, the value must be a key in
`portal/src/metricCatalog.js`.  The catalog entry provides the label, tone, formatter,
and footnote for the KPI card.

---

## 7. Registry Entry

In `portal/src/dashboards/index.js`:

```js
import NewDashboard from "./<id>/<ComponentName>.jsx";

export const dashboardRegistry = [
  // ... existing entries ...
  { id: "<id>", label: "Human Readable Label", component: NewDashboard },
];
```

Array order determines NavBar tab order.

---

## 8. Files to Create

### `docs/guides/add-dashboard.md` (primary deliverable)

Step-by-step developer guide containing all of the above: workflow summary, naming
conventions, copy-paste templates for both the view component and `definition.json`,
widget types reference, metric catalog note, registry instructions, and validation
checklist.

---

## 9. Files NOT Modified

All platform files are unchanged:

- `DashboardRenderer.jsx`, `DashboardGrid.jsx`, `WidgetRenderer.jsx`
- `widgetRegistry.js`, `metricCatalog.js`
- `App.jsx`, `NavBar.jsx`, `AppShell.jsx`, `ClientEnvSelector.jsx`
- `useDashboardArtifacts.js`, `useDashboardLayout.js`

`portal/src/dashboards/index.js` gains one import and one array entry per new dashboard;
no existing lines change.

---

## 10. Risks / Tradeoffs

| Risk | Mitigation |
|------|-----------|
| Developer omits `metric` from metricCatalog | Guide explicitly calls out: if widget uses `"metric"`, ID must exist in metricCatalog.js |
| Publisher artifacts absent during development | Guide notes: `ScopeEmptyState` renders when `manifest.json` is missing — expected for new dashboards before publisher runs |
| Unknown widget type in definition | `WidgetRenderer` renders a warning block at runtime — visible without crashing |
| `definition.json` schema drift over time | Guide notes `schema_version` field; existing definition files are the canonical reference |
| Guide becomes stale as platform evolves | Guide should be reviewed whenever `widgetRegistry.js` or `metricCatalog.js` gains new entries |

---

## 11. Verification

1. Follow the guide to create a new dashboard (`site_performance`) with one KPI card
   and one table widget
2. Confirm the new tab appears in NavBar without touching `App.jsx` or `NavBar.jsx`
3. Navigate to the new route — `ScopeEmptyState` renders (expected: no artifacts yet)
4. Remove the new dashboard — tab disappears, no other changes needed
5. `npm test` in `portal/` — all tests pass throughout
