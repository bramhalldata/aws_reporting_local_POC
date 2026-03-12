# Plan: Cross-Dashboard Widget Reuse (Feature 11)

## 1. Feature Overview

As dashboards expand, identical widget bindings (type + metric + data_source) will
appear in multiple `definition.json` files.  A developer adding a second DLQ-related
dashboard today would copy-paste the `failures_24h` and `failures_7d` KPI widget
definitions verbatim.  If the artifact filename changes, every dashboard that uses those
widgets must be updated individually.

This feature introduces **widget presets** — named, shareable widget definition
templates stored in a single file.  A widget in any `definition.json` can reference a
preset by ID via a `"preset"` field.  Preset fields are the defaults; dashboard-local
fields override.  Dashboards with no presets are unchanged.

---

## 2. Current Duplication Risk

### Concrete duplication today

`dlq_operations/definition.json` defines these two KPI cards:

```json
{ "id": "failures_24h", "type": "kpi_card", "metric": "failures_last_24h",
  "data_source": { "artifact": "summary.json", "field": "failures_last_24h" },
  "layout": { "col": 0, "row": 0, "w": 6, "h": 2 } }

{ "id": "failures_7d", "type": "kpi_card", "metric": "failures_last_7d",
  "data_source": { "artifact": "summary.json", "field": "failures_last_7d" },
  "layout": { "col": 6, "row": 0, "w": 6, "h": 2 } }
```

Any new dashboard covering DLQ metrics would duplicate these definitions.  If
`summary.json` were renamed or the field changed, every dashboard referencing it would
need updating.

### What is already reused (and does not need changing)

| Layer | Reuse mechanism | Covers |
|-------|----------------|--------|
| `metricCatalog.js` | Central metric display semantics | label, tone, formatter, footnote, thresholds |
| `widgetRegistry.js` | Central component mapping | rendering logic per widget type |
| `DashboardRenderer` | Generic rendering | layout, artifact loading, section rendering |

The gap is the **widget binding** — the combination of `type + metric + data_source`
that tells the renderer what to show.  This currently lives only inside individual
`definition.json` files.

---

## 3. Proposed Reuse Model

### Mechanism: optional `"preset"` field on widget definitions

A widget in `definition.json` may declare a `"preset"` field naming a shared widget
template.  The template provides default values for `type`, `metric`, `data_source`,
and `layout`.  Dashboard-local fields override the template.

```json
// Minimal: inherit everything from the preset except the local id
{ "id": "failures_24h", "preset": "failures_24h_kpi" }

// With layout override: change position without re-specifying type/metric/data_source
{ "id": "failures_24h", "preset": "failures_24h_kpi",
  "layout": { "col": 0, "row": 0, "w": 4, "h": 2 } }
```

A widget without a `"preset"` field is fully inline — existing behavior unchanged.

### Resolution: shallow merge, local fields win

```
resolved widget = { ...preset fields, ...dashboard-local fields }
```

Merge is shallow: if `layout` is present locally, the full local `layout` object
replaces the preset's `layout` (not field-by-field).  This is simple and predictable.

The `id` field is always dashboard-local (never comes from the preset).

### Where resolution happens

A new utility `resolveWidgets(widgets, presets)` is called once inside
`DashboardRenderer`, integrated into the existing `useMemo` that collects artifact
names.  All downstream code (`WidgetRenderer`, `DashboardGrid`) receives resolved
widgets and is unchanged.

### What should be in a preset vs. inline

**Good preset candidates** (shared across ≥ 2 dashboards, stable binding):
- `failures_24h_kpi` — type + metric + standard layout for the 24-hour failure count
- `failures_7d_kpi` — same for the 7-day failure count

**Stay inline** (dashboard-specific or variable):
- Titles that differ between dashboards (e.g. "Top Sites — 7 days" vs "Top Sites — 30 days")
- Widgets unique to one dashboard
- Layout positions that vary by context

---

## 4. Presets vs. Local Overrides

| Field | Preset default | Dashboard can override? | Override behavior |
|-------|---------------|------------------------|-------------------|
| `type` | Yes | Yes (rare) | Local `type` replaces preset type |
| `metric` | Yes | Yes | Local `metric` replaces preset metric |
| `data_source` | Yes | Yes | Local `data_source` replaces entire preset data_source |
| `layout` | Yes | Yes | Local `layout` replaces entire preset layout object |
| `title` | Yes (optional) | Yes | Local `title` replaces preset title |
| `kpi_config` | Yes (optional) | Yes | Local `kpi_config` replaces preset kpi_config |
| `id` | Never set in preset | Required locally | Always from dashboard |

**Unknown preset ID behavior:** If `"preset": "nonexistent_id"` is used and the preset
is not found, `resolveWidgets` passes the widget through unresolved (no `type`, no
`metric`, no `data_source`).  `WidgetRenderer` renders a visible warning block — no
crash.

---

## 5. Files to Create or Modify

### Files to Create

#### `portal/src/dashboards/widgetPresets.js`

Named widget preset definitions.  Each key is a preset ID; the value is a partial
widget definition providing default fields.

```js
export const widgetPresets = {
  failures_24h_kpi: {
    type: "kpi_card",
    metric: "failures_last_24h",
    data_source: { artifact: "summary.json", field: "failures_last_24h" },
    layout: { col: 0, row: 0, w: 6, h: 2 },
  },
  failures_7d_kpi: {
    type: "kpi_card",
    metric: "failures_last_7d",
    data_source: { artifact: "summary.json", field: "failures_last_7d" },
    layout: { col: 6, row: 0, w: 6, h: 2 },
  },
};
```

#### `portal/src/dashboards/resolveWidgets.js`

Pure utility function.  No React imports.  Testable in isolation.

```js
/**
 * resolveWidgets — merges preset fields into widget definitions.
 *
 * For each widget with a "preset" field:
 *   - look up the preset by ID
 *   - merge: { ...presetFields, ...localFields } (local wins)
 *   - strip the "preset" key from the result
 *
 * Widgets without a "preset" field pass through unchanged.
 * Unknown preset IDs pass through unchanged (WidgetRenderer will warn).
 *
 * @param {Object[]} widgets  Raw widget array from definition.json
 * @param {Object}   presets  widgetPresets map { [id]: partialWidgetDef }
 * @returns {Object[]}        Resolved widget array
 */
export function resolveWidgets(widgets, presets) {
  return widgets.map((widget) => {
    if (!widget.preset) return widget;
    const base = presets[widget.preset] ?? {};
    const { preset: _, ...overrides } = widget;
    return { ...base, ...overrides };
  });
}
```

---

### Files to Modify

#### `portal/src/components/DashboardRenderer.jsx`

Add `import { widgetPresets } from "../dashboards/widgetPresets.js"` and
`import { resolveWidgets } from "../dashboards/resolveWidgets.js"`.

Extend the existing `useMemo` (or add a second one immediately after) to resolve
widgets before use:

```js
const resolvedWidgets = useMemo(
  () => resolveWidgets(definition.widgets, widgetPresets),
  [definition.widgets]
);
```

Replace all references to `definition.widgets` in the render body with `resolvedWidgets`.
There are two such references:
1. The `artifactNames` useMemo (line 94): `definition.widgets.map(...)`
2. The section rendering (lines 151, 167): `definition.widgets.find(...)`

**Change count:** 3 reference replacements + 2 import lines.  No structural changes.

---

#### `portal/src/dashboards/dlq_operations/definition.json`

Update `failures_24h` and `failures_7d` widgets to use presets.  This demonstrates
the feature and validates that existing dashboards work with the new mechanism.

Before:
```json
{
  "id": "failures_24h",
  "type": "kpi_card",
  "metric": "failures_last_24h",
  "data_source": { "artifact": "summary.json", "field": "failures_last_24h" },
  "layout": { "col": 0, "row": 0, "w": 6, "h": 2 }
}
```

After:
```json
{
  "id": "failures_24h",
  "preset": "failures_24h_kpi"
}
```

Same transformation for `failures_7d`.  All other widgets in this file remain inline.

---

### Files NOT Modified

- `portal/src/components/WidgetRenderer.jsx` — receives resolved widgets; unchanged
- `portal/src/components/DashboardGrid.jsx` — receives resolved widgets; unchanged
- `portal/src/widgetRegistry.js` — unchanged
- `portal/src/metricCatalog.js` — unchanged
- `portal/src/dashboards/pipeline_health/definition.json` — no preset candidates today
- `portal/src/dashboards/index.js`, `App.jsx`, `NavBar.jsx` — unchanged
- All hooks (`useDashboardArtifacts`, `useDashboardLayout`) — unchanged

---

## 6. Risks / Tradeoffs

| Risk | Assessment | Mitigation |
|------|-----------|------------|
| Preset change affects all dashboards using it | Intentional — presets represent stable shared bindings | Only put truly stable, shared bindings in presets; dashboard-specific configs stay inline |
| Shallow merge surprises (e.g. partial layout) | Low — whole `layout` object replaces, not field-by-field; this is simpler and predictable | Document merge semantics in `resolveWidgets.js` header and `add-dashboard.md` |
| Unknown preset ID silently degrades | Low impact — WidgetRenderer shows warning; no crash | `resolveWidgets` passes through unresolved; warning is visible at dev time |
| Premature abstraction — preset used for one-off widgets | Real risk as codebase grows | Convention: only add a preset when a widget binding is used in ≥2 dashboards |
| `definition.json` becomes harder to read (opaque `preset` key) | Low — inline dashboards remain fully readable; preset reference is one line | Preset file is the single source of truth; inline definitions remain valid |

---

## 7. Verification Checklist

- [ ] `npm test` in `portal/` — all existing tests pass without modification
- [ ] DLQ Operations dashboard renders correctly using preset-based widgets
  - `failures_24h` KPI card: label "Failures — last 24 h", correct value, correct tone
  - `failures_7d` KPI card: label "Failures — last 7 days", correct value, correct tone
- [ ] Pipeline Health dashboard renders correctly (no presets — exercises unchanged code path)
- [ ] Smoke test — preset with layout override: add `"layout": { "col": 0, "row": 0, "w": 4, "h": 2 }` to a preset widget entry; confirm it renders at the overridden size, not the preset default
- [ ] Smoke test — unknown preset: add a widget with `"preset": "does_not_exist"` to a test definition; confirm WidgetRenderer warning block renders, no crash
- [ ] Smoke test — no-preset widget still works: a widget with no `"preset"` key renders identically to before
- [ ] Cross-dashboard reuse validation: copy the DLQ preset references into a second test dashboard definition; confirm both dashboards render the same KPI cards from their respective artifacts
