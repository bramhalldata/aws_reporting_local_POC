# Plan: Layout Abstraction

## 1. Feature Overview

Replace the implicit, heuristic-driven layout system in `DashboardRenderer` with an explicit
layout contract stored in dashboard definition configuration.

Widget placement today is determined by:
1. The order of `widget_ids` in each section
2. An `isKpiRow` heuristic that inspects widget types at render time

This feature removes that heuristic and introduces a formal layout model so dashboards
describe their own rendering intent through config, not inferred behaviour.

---

## 2. Current Layout Limitation

`DashboardRenderer.jsx` (lines 125–131) contains:

```js
// Phase 2 heuristic: sections composed entirely of kpi_card widgets
// render as a flex row to match the existing dashboard visual layout.
// Replace with explicit layout hints in Phase 6 (Layout Abstraction).
const isKpiRow = section.widget_ids.every((id) => {
  const w = definition.widgets.find((x) => x.id === id);
  return w?.type === "kpi_card";
});
```

Problems with this heuristic:
- Layout intent is not stored in config — it is computed at render time from widget types
- A mixed section (kpi_card + chart) cannot be rendered as a flex row even if desired
- Incompatible with future drag-and-drop (Phase 7) which needs explicit coordinates
- Incompatible with responsive breakpoints (future) which need per-widget size hints
- The comment itself flags this as a known technical debt

The section schema today:
```json
{ "id": "kpis", "label": "Overview", "widget_ids": ["failures_24h", "failures_7d"] }
```

No layout metadata exists.

---

## 3. Proposed Layout Model

### 3.1 Section-level layout type

Each section gains a `layout` block:

```json
{
  "id": "kpis",
  "label": "Overview",
  "widget_ids": ["failures_24h", "failures_7d"],
  "layout": { "type": "flex_row" }
}
```

**`layout.type` values:**

| Value | Rendered as | Used for |
|-------|-------------|----------|
| `"flex_row"` | Horizontal flex wrap (existing `styles.kpiRow`) | KPI card rows |
| `"stack"` | Vertical block (existing `styles.section`) | Tables, charts, full-width widgets |

Omitting `layout` defaults to `"stack"` — backward compatible for any existing definitions
not yet updated.

### 3.2 Per-widget layout coordinates

Each widget gains an optional `layout` block with grid position metadata:

```json
{
  "id": "failures_24h",
  "type": "kpi_card",
  "metric": "failures_last_24h",
  "data_source": { "artifact": "summary.json", "field": "failures_last_24h" },
  "layout": { "col": 0, "row": 0, "w": 6, "h": 2 }
}
```

**Grid system: 12-column base** (standard; compatible with react-grid-layout Phase 7 defaults)

| Field | Type | Meaning |
|-------|------|---------|
| `col` | integer | 0-based column start (0–11) |
| `row` | integer | 0-based row start within the section |
| `w`   | integer | Width in columns (1–12) |
| `h`   | integer | Height in row units |

**Phase 6 scope:** `DashboardRenderer` does **not** use `col`/`row`/`w`/`h` for
positioning in this feature.  These fields are defined and populated in definition files
so they exist when Phase 7 (drag-and-drop grid) consumes them.  The only field
`DashboardRenderer` reads in this feature is `section.layout.type`.

### 3.3 Future fields (defined, not implemented)

```json
"layout": {
  "col": 0, "row": 0, "w": 6, "h": 2,
  "min_w": 2,
  "breakpoints": {
    "sm": { "col": 0, "row": 0, "w": 12, "h": 2 }
  }
}
```

`min_w` and `breakpoints` are documented here for future responsive support.  They are
**not** added to definition files in this feature.

---

## 4. Integration with Dashboard Schema

### DashboardDefinition section shape — before

```json
{
  "id": "string",
  "label": "string",
  "widget_ids": ["string"]
}
```

### DashboardDefinition section shape — after

```json
{
  "id": "string",
  "label": "string",
  "widget_ids": ["string"],
  "layout": { "type": "flex_row" | "stack" }
}
```

### Widget shape — before

```json
{
  "id": "string",
  "type": "string",
  "title": "string",
  "data_source": { "artifact": "string", "field": "string" }
}
```

### Widget shape — after (layout block is optional)

```json
{
  "id": "string",
  "type": "string",
  "title": "string",
  "data_source": { "artifact": "string", "field": "string" },
  "layout": { "col": 0, "row": 0, "w": 6, "h": 2 }
}
```

---

## 5. Future Compatibility Notes

| Future Feature | How this layout model supports it |
|----------------|-----------------------------------|
| Phase 7 — Drag-and-drop | `widget.layout.col/row/w/h` provides initial positions for react-grid-layout items |
| Phase 8 — Persisted layouts | Persisted state can override `widget.layout` without schema changes |
| Responsive breakpoints | `widget.layout.breakpoints` map added when needed; no structural change required |
| Per-client layout variants | Client config can supply a `layout_overrides` map; base definitions unchanged |

---

## 6. Files to Create or Modify

### Files to Create

None.

### Files to Modify

| File | Change |
|------|--------|
| `portal/src/components/DashboardRenderer.jsx` | Replace `isKpiRow` heuristic with `section.layout?.type` lookup |
| `portal/src/dashboards/dlq_operations/definition.json` | Add `layout` to all 5 sections; add `layout` coordinates to all 6 widgets |
| `portal/src/dashboards/pipeline_health/definition.json` | Add `layout` to both sections; add `layout` coordinates to all 4 widgets |

### DashboardRenderer.jsx — specific change

Remove (lines 125–131):
```js
const isKpiRow = section.widget_ids.every((id) => {
  const w = definition.widgets.find((x) => x.id === id);
  return w?.type === "kpi_card";
});
```

Replace with:
```js
const layoutType = section.layout?.type ?? "stack";
```

Update the render:
```jsx
<div key={section.id} style={layoutType === "flex_row" ? styles.kpiRow : styles.section}>
```

Remove the two `// Phase 2 heuristic` comments. Update the `styles.kpiRow` comment to
reference the layout contract.

### dlq_operations/definition.json — section layout additions

| Section ID | layout.type |
|------------|-------------|
| `kpis` | `"flex_row"` |
| `top_sites_7d` | `"stack"` |
| `trends` | `"stack"` |
| `top_sites_30d` | `"stack"` |
| `exceptions` | `"stack"` |

### dlq_operations/definition.json — widget layout coordinates

| Widget ID | col | row | w | h |
|-----------|-----|-----|---|---|
| `failures_24h` | 0 | 0 | 6 | 2 |
| `failures_7d` | 6 | 0 | 6 | 2 |
| `top_sites_7d_table` | 0 | 0 | 12 | 4 |
| `failure_trend_chart` | 0 | 0 | 12 | 4 |
| `top_sites_30d_table` | 0 | 0 | 12 | 4 |
| `exception_types_table` | 0 | 0 | 12 | 4 |

### pipeline_health/definition.json — section layout additions

| Section ID | layout.type |
|------------|-------------|
| `kpis` | `"flex_row"` |
| `breakdowns` | `"stack"` |

### pipeline_health/definition.json — widget layout coordinates

| Widget ID | col | row | w | h |
|-----------|-----|-----|---|---|
| `docs_processed_24h` | 0 | 0 | 4 | 2 |
| `active_sites_24h` | 4 | 0 | 4 | 2 |
| `latest_event` | 8 | 0 | 4 | 2 |
| `failure_types_table` | 0 | 0 | 12 | 4 |

### Unchanged Components

- `portal/src/components/KpiCard.jsx`
- `portal/src/components/WidgetRenderer.jsx`
- `portal/src/components/TrendChart.jsx`
- `portal/src/components/TopSitesTable.jsx`
- `portal/src/components/ExceptionsTable.jsx`
- `portal/src/widgetRegistry.js`
- `portal/src/metricCatalog.js`
- `docs/json-contracts.md` — layout is portal config; no artifact schema changes
- All publisher, SQL, and Parquet files

---

## 7. Risks / Tradeoffs

### Risk: section missing `layout` block
Any section not yet updated will fall back to `"stack"` via `?? "stack"`.  This is safe
and intentional — backward compatible.

### Risk: widget missing `layout` block
No code reads `widget.layout` in this feature.  Missing blocks cause no errors.

### Tradeoff: section-level type vs. per-widget type
The plan uses a section-level `layout.type` rather than per-widget layout type.  This is
simpler for the current grid model where all widgets in a section share the same layout
behaviour.  A future enhancement could add per-widget `display_mode` if heterogeneous
sections are needed.

### Tradeoff: 12-column grid
The 12-column convention is industry standard (Bootstrap, react-grid-layout defaults) and
allows both even thirds (4 cols) and halves (6 cols) in KPI rows.  Changing this later
would require updating all widget coordinates but no structural schema change.

---

## 8. Verification Checklist

- [ ] **Visual parity** — both dashboards render identically to before after the change
- [ ] **isKpiRow removed** — `DashboardRenderer.jsx` contains no `isKpiRow` variable and no widget-type inspection loop
- [ ] **Config-driven flex row** — KPI sections render as flex row because `layout.type === "flex_row"`, not because of widget types
- [ ] **Config-driven stack** — changing `"flex_row"` to `"stack"` on the kpis section causes KPI cards to render vertically
- [ ] **Graceful absent layout** — a section without a `layout` block renders as a stack without error
- [ ] **Widget layout fields present** — each widget in both definitions has `layout.col/row/w/h`
- [ ] **All 82 tests pass** — `npm test` in `portal/` exits cleanly
- [ ] **No console errors** — browser console is clean after both dashboards load
