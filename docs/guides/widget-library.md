# Widget Library

Internal reference for all available widget types, metric definitions, and widget presets.

**Authoritative source files:**
- Widget types: `portal/src/widgetRegistry.js`
- Metric definitions: `portal/src/metricCatalog.js`
- Widget presets: `portal/src/dashboards/widgetPresets.js`

---

## Overview

Widgets are driven by `definition.json`.  The rendering pipeline is:

```
definition.json widgets array
  → resolveWidgets()      preset fields merged into widget definitions
  → WidgetRenderer        looks up widgetRegistry[widget.type]
  → propsAdapter()        transforms (widget, artifact data, filterState) → component props
  → React component       renders the output
```

Each widget type has a registered entry in `widgetRegistry.js` consisting of a React component
and a `propsAdapter` function.  Unknown widget type strings render an `UnknownWidget` warning
block instead of crashing — safe to experiment.

---

## Widget Type Reference

### `kpi_card`

**Purpose:** Display a single scalar metric with a label, formatted value, tone (color signal),
footnote, and optional comparison delta. Use for headline numbers on overview sections.

**When to choose:** One key number that needs a label and visual tone — failures count, document
count, active sites, latest timestamp.  Not for time series or row-level data.

**definition.json fields:**

| Field | Required | Description |
|-------|----------|-------------|
| `type` | Yes | `"kpi_card"` |
| `metric` | No* | Metric catalog ID — supplies `label`, `tone`, `footnote`, `formatter`. *Omit only if all overridden via `kpi_config`. |
| `data_source.artifact` | Yes | JSON artifact filename (e.g. `"summary.json"`) |
| `data_source.field` | Yes | Field within artifact (e.g. `"failures_last_24h"`) |
| `layout` | Yes (grid) | Initial grid position: `{ col, row, w, h }` |
| `kpi_config` | No | Per-widget overrides — see table below |

**`kpi_config` fields** (all optional):

| Field | Type | Description |
|-------|------|-------------|
| `tone` | string | Overrides catalog tone: `"neutral"`, `"positive"`, `"warning"`, `"critical"` |
| `footnote` | string | Overrides catalog footnote text |
| `delta` | string | Comparison line rendered below the value (e.g. `"↓ 8% vs last week"`) |
| `sparklineData` | array | Reserved — not yet rendered |

**Artifact data shape:** scalar — `number \| string \| null`
(null or undefined renders `"—"`)

**Example — minimal (with metric catalog):**

```json
{
  "id": "failures_24h",
  "type": "kpi_card",
  "metric": "failures_last_24h",
  "data_source": { "artifact": "summary.json", "field": "failures_last_24h" },
  "layout": { "col": 0, "row": 0, "w": 6, "h": 2 }
}
```

**Example — with kpi_config overrides:**

```json
{
  "id": "failures_24h",
  "type": "kpi_card",
  "metric": "failures_last_24h",
  "data_source": { "artifact": "summary.json", "field": "failures_last_24h" },
  "layout": { "col": 0, "row": 0, "w": 6, "h": 2 },
  "kpi_config": {
    "tone": "warning",
    "delta": "↑ 12% vs last week"
  }
}
```

**Example — via preset (shorthand):**

```json
{ "id": "failures_24h", "preset": "failures_24h_kpi" }
```

Or with a layout override (local fields win):

```json
{ "id": "failures_24h", "preset": "failures_24h_kpi",
  "layout": { "col": 0, "row": 0, "w": 4, "h": 2 } }
```

See [Widget Presets Reference](#widget-presets-reference) for available preset IDs.

---

### `line_chart`

**Purpose:** Display daily failure counts over 30 days as a line chart. Use for trend
visualisation on dashboards where change over time matters.

**When to choose:** Time-series data with a `date` dimension. If you have a scalar, use
`kpi_card` instead.

**definition.json fields:**

| Field | Required | Description |
|-------|----------|-------------|
| `type` | Yes | `"line_chart"` |
| `title` | No | Chart header text (default: `"Failure Trend — last 30 days"`) |
| `data_source.artifact` | Yes | JSON artifact filename (e.g. `"trend_30d.json"`) |
| `data_source.field` | Yes | Array field within artifact (e.g. `"days"`) |
| `layout` | Yes (grid) | Initial grid position: `{ col, row, w, h }` |

**Artifact data shape:**

```json
[{ "date": "YYYY-MM-DD", "failures": 42 }, ...]
```

Empty array renders "No trend data available."

**Example:**

```json
{
  "id": "failure_trend",
  "type": "line_chart",
  "title": "30-Day Failure Trend",
  "data_source": { "artifact": "trend_30d.json", "field": "days" },
  "layout": { "col": 0, "row": 0, "w": 12, "h": 4 }
}
```

---

### `data_table`

**Purpose:** Display a ranked list of sites with failure counts. Use when the audience
needs to identify which specific sites are contributing most to failures.

**When to choose:** Row-level data with a `site` dimension and a numeric count. For
failure-type breakdowns (not site breakdowns), use `exceptions_table` instead.

**definition.json fields:**

| Field | Required | Description |
|-------|----------|-------------|
| `type` | Yes | `"data_table"` |
| `title` | No | Table header text (default: empty) |
| `data_source.artifact` | Yes | JSON artifact filename (e.g. `"top_sites.json"`) |
| `data_source.field` | Yes | Array field within artifact (e.g. `"sites"`) |
| `layout` | Yes (grid) | Initial grid position: `{ col, row, w, h }` |

**Artifact data shape:**

```json
[{ "site": "acme-corp", "failures": 123 }, ...]
```

**Example:**

```json
{
  "id": "top_sites_table",
  "type": "data_table",
  "title": "Top Sites by Failures — last 7 days",
  "data_source": { "artifact": "top_sites.json", "field": "sites" },
  "layout": { "col": 0, "row": 0, "w": 12, "h": 4 }
}
```

---

### `exceptions_table`

**Purpose:** Display failure types ranked by occurrence count. Use when the audience
needs to understand what kinds of failures are happening, not where.

**When to choose:** Row-level data with a `failure_type` dimension and a count. For
site-level breakdowns, use `data_table` instead.

**definition.json fields:**

| Field | Required | Description |
|-------|----------|-------------|
| `type` | Yes | `"exceptions_table"` |
| `title` | No | Table header (default: `"Exceptions by Type — last 7 days"`) |
| `data_source.artifact` | Yes | JSON artifact filename (e.g. `"exceptions.json"`) |
| `data_source.field` | Yes | Array field within artifact (e.g. `"exceptions"`) |
| `layout` | Yes (grid) | Initial grid position: `{ col, row, w, h }` |

**Artifact data shape:**

```json
[{ "failure_type": "TIMEOUT", "count": 89 }, ...]
```

**Example — minimal (uses default title):**

```json
{
  "id": "exception_breakdown",
  "type": "exceptions_table",
  "data_source": { "artifact": "exceptions.json", "field": "exceptions" },
  "layout": { "col": 0, "row": 0, "w": 12, "h": 4 }
}
```

**Example — with custom title:**

```json
{
  "id": "exception_breakdown",
  "type": "exceptions_table",
  "title": "Pipeline Failures by Type — last 24 hours",
  "data_source": { "artifact": "exceptions.json", "field": "exceptions" },
  "layout": { "col": 0, "row": 0, "w": 12, "h": 4 }
}
```

---

## Metric Catalog Reference

The metric catalog (`portal/src/metricCatalog.js`) provides display semantics for KPI card
widgets — label, value formatter, tone (border color), and footnote.  Widgets reference a
metric by its catalog ID via the `"metric"` field.

### Catalog entry shape

```js
{
  label:             string,           // eyebrow display name
  formatter:         "number" | "string" | "currency" | "percent" | "datetime",
  tone:              "neutral" | "positive" | "warning" | "critical",
  footnote:          string | null,    // explanatory line below value
  data_source_field: string | null,    // advisory only — not used by renderer
  trend:             object | null,    // reserved
  thresholds:        Array<{ op, value, tone }>
}
```

### Current metric IDs

| Metric ID | Label | Formatter | Tone | Footnote |
|-----------|-------|-----------|------|---------|
| `failures_last_24h` | Failures — last 24 h | number | neutral | 24-hour rolling window |
| `failures_last_7d` | Failures — last 7 days | number | neutral | 7-day rolling window |
| `total_documents_last_24h` | Documents — last 24 h | number | neutral | 24-hour rolling window |
| `active_sites_last_24h` | Active Sites — last 24 h | number | neutral | Sites with ≥1 event |
| `latest_event_timestamp` | Latest Event | datetime | neutral | Most recent pipeline event |

### Adding a new metric

Add an entry to `portal/src/metricCatalog.js` following the shape above.  Use `snake_case`
for the metric ID, matching the artifact `data_source_field` where possible.

> **Architecture constraint:** Metric definitions (label, tone, formatter) must live in
> `metricCatalog.js`.  Do not replicate metric logic in component code or `propsAdapter`
> functions. See `docs/architecture.md`.

---

## Widget Presets Reference

A widget preset is a named template for a common widget binding (type + metric + data_source +
default layout).  Dashboards reference a preset by ID via the `"preset"` field in
`definition.json`.

### Merge semantics

```
resolved widget = { ...preset fields, ...dashboard-local fields }
```

Local fields completely override preset fields (shallow merge). The `id` field is always
local — never set in a preset.

### Current preset IDs

| Preset ID | type | metric | data_source | Default layout |
|-----------|------|--------|-------------|----------------|
| `failures_24h_kpi` | `kpi_card` | `failures_last_24h` | `summary.json / failures_last_24h` | `col:0 row:0 w:6 h:2` |
| `failures_7d_kpi` | `kpi_card` | `failures_last_7d` | `summary.json / failures_last_7d` | `col:6 row:0 w:6 h:2` |

### When to use a preset

Use a preset when the same widget binding (type + metric + data_source) appears in two or more
dashboards.  Dashboard-specific widgets should stay inline in `definition.json`.

### Reference with local override

```json
{ "id": "failures_24h", "preset": "failures_24h_kpi",
  "layout": { "col": 0, "row": 0, "w": 4, "h": 2 } }
```

If the preset ID does not exist, `WidgetRenderer` renders an `UnknownWidget` warning block.
Check the ID against `portal/src/dashboards/widgetPresets.js`.

---

## Adding a New Widget Type

1. **Create the component** in `portal/src/components/<ComponentName>.jsx`.
   The component receives props produced by the `propsAdapter` — it has no knowledge of
   artifacts or the registry.

2. **Add a registry entry** in `portal/src/widgetRegistry.js`:

   ```js
   my_widget: {
     component:   MyWidget,
     propsAdapter: (widget, data, filterState) => ({
       title:  widget.title,
       rows:   data,
       filter: filterState?.date_range ?? null,
     }),
   },
   ```

   **`propsAdapter` signature:** `(widget, data, filterState) => Object`
   - `widget` — full widget definition object from `definition.json`
   - `data` — artifact value after `data_source.field` extraction (scalar, array, or full object)
   - `filterState` — `{ [filterId]: string | null }` from `useFilterState`; may be undefined in
     older contexts. Existing adapters that ignore this argument are unaffected.

3. **Add metric catalog entries** (optional — only for `kpi_card`-style widgets that reference
   the catalog).  See [Metric Catalog Reference](#metric-catalog-reference).

**If a widget type string has a typo or is not registered**, `WidgetRenderer` renders an
`UnknownWidget` yellow warning block — the app does not crash and surrounding widgets render
normally.  This makes iteration safe.

---

## Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Widget type string | `snake_case` | `kpi_card`, `line_chart` |
| Widget ID in definition.json | `snake_case`, unique within dashboard | `failures_24h` |
| Preset ID | `<metric_id>_kpi` for KPI presets | `failures_24h_kpi` |
| Metric ID | `snake_case`, matches `data_source_field` where possible | `failures_last_24h` |
| Component filename | `PascalCase.jsx` | `MyWidget.jsx` |

---

## Guardrails

> **Architecture constraint:** See `docs/architecture.md` for the authoritative rules.
> The points below summarise the rules as they apply to widget development.

- **Metrics live in `metricCatalog.js` — not in component logic or `propsAdapter` functions.**
  Label, tone, formatter, and footnote are catalog concerns.  `propsAdapter` transforms data;
  it does not define display semantics.

- **`propsAdapter` functions perform data transformation only.**  No API calls, no computed
  aggregates, no metric re-derivation.

- **Widget components must not query artifacts directly.**  `WidgetRenderer` handles all
  artifact loading and field extraction; components receive only their final props.

- **Unknown widget type strings render `UnknownWidget`** (yellow warning block) — not a crash.
  Same for unknown preset IDs.  Both are visible and diagnosable without restarting the app.

- **Do not fork widget logic per client.**  Differences between clients should be expressed
  through configuration (`definition.json`, `metricCatalog.js`) — not through conditional
  component code.
