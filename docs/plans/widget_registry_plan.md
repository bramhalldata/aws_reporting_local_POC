# Widget Registry — Implementation Plan

**Feature:** Widget Registry
**Roadmap Phase:** 3 of 10
**Branch:** feature/dashboard-plugin-architecture
**Date:** 2026-03-11

---

## 1. Feature Overview

Phase 2 (Dashboard Renderer) delivered `portal/src/widgetRegistry.js` — a keyed object mapping widget type strings to `{ component, propsAdapter }` entries. The `DashboardRenderer` resolves widget types through it with no hard-coded branching.

Phase 3 does not re-implement the registry. It formalizes it:

1. **Extracts `WidgetRenderer`** from its current position as a private function inside `DashboardRenderer.jsx` into a standalone, exported component at `portal/src/components/WidgetRenderer.jsx`
2. **Formalizes `widgetRegistry.js`** with a JSDoc entry contract, type catalog, and explicit extension instructions
3. **Documents the type naming convention** and the planned (not yet implemented) types so the catalog is complete

The result: the registry is a first-class, independently usable contract. A contributor can add a new widget type by reading `widgetRegistry.js` alone, without reading the renderer source.

---

## 2. Current State / Coupling Risk

### What Phase 2 delivered

`portal/src/widgetRegistry.js` (current):
```javascript
export const widgetRegistry = {
  kpi_card:        { component: KpiCard,         propsAdapter: ... },
  line_chart:      { component: TrendChart,       propsAdapter: ... },
  data_table:      { component: TopSitesTable,    propsAdapter: ... },
  exceptions_table:{ component: ExceptionsTable,  propsAdapter: ... },
};
```

`DashboardRenderer.jsx` contains a private `WidgetRenderer` function that:
- looks up the widget type in the registry
- extracts artifact data via `data_source.artifact` + `data_source.field`
- calls `propsAdapter(widget, data)`
- renders the component or an `UnknownWidget` fallback

### Remaining coupling risk

`WidgetRenderer` is private to `DashboardRenderer.jsx`. It cannot be:
- tested in isolation
- reused in a widget preview panel (Phase 8)
- imported by any future component outside the renderer

If a second consumer of the registry needs to render widgets (e.g., a history diff view), it would have to duplicate the resolution logic. Extracting `WidgetRenderer` eliminates this risk.

The registry itself has no documented contract — no formal description of what a valid entry looks like. A contributor adding a new type today has no schema to follow beyond reading existing entries.

---

## 3. Registry Design

### Entry contract (JSDoc typedef)

```javascript
/**
 * @typedef {Object} WidgetRegistryEntry
 * @property {React.ComponentType} component
 *   The React component to render.
 * @property {function(widget: WidgetDefinition, data: *): Object} propsAdapter
 *   Maps the widget definition and extracted artifact data to component props.
 *   widget — the widget definition object from definition.json
 *   data   — the artifact value after data_source.field extraction
 *              (scalar for kpi_card, array for tables/charts, object for full payload)
 */
```

### Type naming convention

Type identifiers use `snake_case`. The name describes the **visual presentation**, not the underlying component name:

| Type identifier | Component | Data shape |
|----------------|-----------|------------|
| `kpi_card` | `KpiCard` | scalar (number or string) |
| `line_chart` | `TrendChart` | array of `{ date, failures }` |
| `data_table` | `TopSitesTable` | array of `{ site, failures }` |
| `exceptions_table` | `ExceptionsTable` | array of `{ failure_type, count }` |

Planned types (not yet implemented — no components exist):

| Type identifier | Intended component | Notes |
|----------------|-------------------|-------|
| `bar_chart` | future `BarChart` | horizontal or vertical bar chart |
| `text_block` | future `TextBlock` | markdown or plain text panel |
| `alert_panel` | future `AlertPanel` | status/severity indicator panel |

Planned types are documented in the registry file as comments. They are NOT registered as entries — no stubs, no placeholder components.

### Registry structure (unchanged)

The registry remains a plain exported object. No `registerWidget()` function is introduced — dynamic plugin registration belongs to Phase 9 (Plugin Loading). For now, all types are statically declared at build time.

```javascript
export const widgetRegistry = {
  kpi_card:         { component: KpiCard,         propsAdapter: ... },
  line_chart:       { component: TrendChart,       propsAdapter: ... },
  data_table:       { component: TopSitesTable,    propsAdapter: ... },
  exceptions_table: { component: ExceptionsTable,  propsAdapter: ... },
  // bar_chart, text_block, alert_panel — planned; add entries when components exist
};
```

---

## 4. Widget Resolution Flow

Resolution is performed by `WidgetRenderer`, extracted to its own file:

```
definition.json widget entry
  → WidgetRenderer({ widget, artifacts })
      → widgetRegistry[widget.type]           lookup
      → artifacts[widget.data_source.artifact] get artifact payload
      → artifactData[widget.data_source.field] extract field (if field is non-null)
      → entry.propsAdapter(widget, data)       normalize to component props
      → <entry.component {...props} />          render
```

`WidgetRenderer` is a pure React component: given the same `widget` and `artifacts`, it always renders the same output. No side effects. No hooks.

`DashboardRenderer` imports and uses it:
```jsx
import WidgetRenderer from "./WidgetRenderer.jsx";
// ...
<WidgetRenderer key={widgetId} widget={widget} artifacts={artifacts} />
```

---

## 5. Unknown Widget Handling

`WidgetRenderer` handles three failure cases without throwing:

| Condition | Rendered output |
|-----------|----------------|
| `widget.type` not in registry | `UnknownWidget` with type name |
| `data_source.artifact` not in loaded artifacts | `UnknownWidget` with data source error |
| widget id referenced in section but absent from widgets array | handled in `DashboardRenderer` before `WidgetRenderer` is called |

`UnknownWidget` is a yellow warning block (theme.warningBg) that shows the type string. It allows dashboards to continue rendering other widgets when one type is unrecognized — critical for schema evolution and renderer version skew.

`UnknownWidget` lives in `WidgetRenderer.jsx` (it is only used there).

---

## 6. Files to Create or Modify

### Files to Create

| File | Purpose |
|------|---------|
| `portal/src/components/WidgetRenderer.jsx` | Extracted from `DashboardRenderer.jsx`; exported standalone component |

### Files to Modify

| File | Change |
|------|--------|
| `portal/src/widgetRegistry.js` | Add `WidgetRegistryEntry` JSDoc typedef, type naming section, planned types comment, extension instructions |
| `portal/src/components/DashboardRenderer.jsx` | Replace inline `WidgetRenderer` and `UnknownWidget` definitions with `import WidgetRenderer from "./WidgetRenderer.jsx"` |

### Files Unchanged

| File | Reason |
|------|--------|
| `portal/src/components/KpiCard.jsx` | No change |
| `portal/src/components/TrendChart.jsx` | No change |
| `portal/src/components/TopSitesTable.jsx` | No change |
| `portal/src/components/ExceptionsTable.jsx` | No change |
| `portal/src/hooks/useDashboardArtifacts.js` | No change |
| `portal/src/dashboards/**/definition.json` | No change |
| `portal/src/dashboards/pipeline_health/PipelineHealth.jsx` | No change |
| `portal/src/dashboards/dlq_operations/DlqOperations.jsx` | No change |
| All publisher code, SQL, artifact schemas | No change |

---

## 7. Risks / Tradeoffs

| Risk | Mitigation |
|------|-----------|
| Extracting `WidgetRenderer` changes the import graph — verify DashboardRenderer still works | Build + visual check after migration |
| `UnknownWidget` moving to a different file could introduce a circular import | `WidgetRenderer.jsx` imports only theme and widgetRegistry — no circular risk |
| Planned type comments in registry could mislead contributors into thinking they're registered | Use clearly worded `// PLANNED — not yet registered` comment syntax |
| JSDoc typedef adds no runtime enforcement | Acceptable for a JS-only codebase; TypeScript enforcement is a later decision |

---

## 8. Verification Checklist

### Functional
1. Navigate to `/:client/:env/pipeline_health` — confirm dashboard renders identically to Phase 2 output (HealthBanner, three KPI cards, failure types table)
2. Navigate to `/:client/:env/dlq_operations` — confirm unchanged (still using manual JSX)

### Registry contract
3. Open `portal/src/widgetRegistry.js` — confirm `WidgetRegistryEntry` typedef is present
4. Confirm `kpi_card`, `line_chart`, `data_table`, `exceptions_table` entries are present
5. Confirm `bar_chart`, `text_block`, `alert_panel` appear as comments only (no entries)
6. Add a widget with `"type": "bar_chart"` to `pipeline_health/definition.json` temporarily → confirm `UnknownWidget` renders instead of a crash; revert

### WidgetRenderer standalone
7. Open `portal/src/components/WidgetRenderer.jsx` — confirm it is exported as default
8. Confirm `DashboardRenderer.jsx` imports `WidgetRenderer` and no longer defines it inline
9. Confirm `UnknownWidget` is defined in `WidgetRenderer.jsx`, not in `DashboardRenderer.jsx`

### Build
10. Run `npm run build` in `portal/` — confirm no errors
11. Run `npm test` in `portal/` — confirm 75/75 tests still pass
