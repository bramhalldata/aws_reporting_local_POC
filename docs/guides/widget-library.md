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
| `data_source.artifact` | Yes | JSON artifact filename (e.g. `"trend_30d.json"`) |
| `data_source.field` | Yes | Array field within artifact (e.g. `"days"`) |
| `line_chart_config` | No | Chart configuration block — see table below |
| `layout` | Yes (grid) | Initial grid position: `{ col, row, w, h }` |

**`line_chart_config` fields** (all optional):

| Field | Type | Description |
|-------|------|-------------|
| `data_key` | string | Row field to plot on the Y-axis (e.g. `"failures"`, `"ccd_count"`). Defaults to `"failures"`. |
| `title` | string | Chart heading text. Defaults to `"Failure Trend — last 30 days"`. |
| `subtitle` | string | Secondary line rendered below the heading. |

> **Note:** The top-level `title` field on a `line_chart` widget is not read by the propsAdapter.
> Use `line_chart_config.title` to set the chart heading.

**Artifact data shape:**

```json
[{ "date": "YYYY-MM-DD", "failures": 42 }, ...]
```

The array field must contain objects with a `"date"` key and the field named by `data_key`.
Empty array renders "No trend data available."

**Example — default data_key (`"failures"`):**

```json
{
  "id": "failure_trend",
  "type": "line_chart",
  "data_source": { "artifact": "trend_30d.json", "field": "days" },
  "line_chart_config": {
    "title": "30-Day Failure Trend"
  },
  "layout": { "col": 0, "row": 0, "w": 12, "h": 4 }
}
```

**Example — custom data_key and subtitle:**

```json
{
  "id": "ccd_trend_chart",
  "type": "line_chart",
  "data_source": { "artifact": "trend_30d.json", "field": "days" },
  "line_chart_config": {
    "data_key": "ccd_count",
    "title": "CCDs Sent To UDM (Last 30 Days)",
    "subtitle": "Regional breakdown coming in a future release."
  }
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

### `generic_table`

**Purpose:** Display a tabular dataset with configurable columns, value formatting, and optional
totals row. Use for any row-level reporting data that isn't constrained to the fixed shapes
of `data_table` or `exceptions_table`.

**When to choose:** Multi-column reporting tables — regional summaries, facility breakdowns,
site activity detail — where column headers, display formats, and aggregate behaviour need
explicit configuration. For site-failure-count lists, `data_table` is simpler; for
exception-type breakdowns, `exceptions_table` is simpler.

**definition.json fields:**

| Field | Required | Description |
|-------|----------|-------------|
| `type` | Yes | `"generic_table"` |
| `title` | No | Table heading text |
| `data_source.artifact` | Yes | JSON artifact filename (e.g. `"region_summary.json"`) |
| `data_source.field` | Yes | Array field within artifact (e.g. `"regions"`) |
| `columns` | Yes | Array of column definitions — see column shape below |
| `totals` | No | `true` to render a totals row using each column's `aggregate` function. Requires at least one column with a non-`"none"` `aggregate`. |
| `empty_message` | No | Text shown when `rows` is empty (default: `"No data available."`) |

**Column shape:**

| Field | Required | Description |
|-------|----------|-------------|
| `field` | Yes | Row object key to render in this column |
| `header` | Yes | Column header label |
| `format` | No | Display format — see format values below |
| `aggregate` | No | Totals-row function — see aggregate values below |

**Column `format` values:**

| Value | Behaviour |
|-------|-----------|
| *(absent)* | Raw `String(value)` |
| `"number"` | `Number(value).toLocaleString()` — locale-formatted integer or decimal |
| `"date_string"` | First 10 characters of the string (yields `YYYY-MM-DD` from ISO dates) |
| `"timestamp"` | First 19 characters with `T` replaced by a space (`YYYY-MM-DD HH:MM:SS`) |

**Column `aggregate` values:**

| Value | Totals-row behaviour |
|-------|----------------------|
| *(absent)* | No total (cell is empty) |
| `"none"` | No total (cell is empty) |
| `"label"` | Renders the string `"Total"` — use on the first/label column |
| `"sum"` | Sum of all numeric values in the column |
| `"min"` | Minimum numeric value |
| `"max"` | Maximum numeric value |

> **Validation constraint:** A widget with `totals: true` must have at least one column
> with `aggregate` set to a value other than `"none"`. A `totals: true` widget with no
> aggregate columns will produce an all-`"—"` totals row and is caught by `validateDefinition`.

**Artifact data shape:** array of row objects.

```json
[
  { "region": "Northeast", "ccd_count": 1200, "first_seen": "2025-01-10", "last_seen": "2026-03-10" },
  { "region": "Southeast", "ccd_count":  800, "first_seen": "2025-02-05", "last_seen": "2026-03-05" }
]
```

Empty array renders `empty_message` (default: `"No data available."`).

**Example — regional summary with totals:**

```json
{
  "id": "region_summary_table",
  "type": "generic_table",
  "title": "Region Summary — All Time",
  "data_source": { "artifact": "region_summary.json", "field": "regions" },
  "totals": true,
  "columns": [
    { "field": "region",    "header": "Region",               "aggregate": "label" },
    { "field": "ccd_count", "header": "CCDs Sent", "format": "number", "aggregate": "sum" },
    { "field": "first_seen","header": "First CCD Sent",       "format": "date_string", "aggregate": "min" },
    { "field": "last_seen", "header": "Most Recent CCD Sent", "format": "date_string", "aggregate": "max" }
  ]
}
```

**Example — detail table without totals:**

```json
{
  "id": "lifetime_detail_table",
  "type": "generic_table",
  "title": "Facility Detail — All Time",
  "data_source": { "artifact": "lifetime_detail.json", "field": "rows" },
  "totals": false,
  "columns": [
    { "field": "region",    "header": "Region" },
    { "field": "site",      "header": "Facility" },
    { "field": "ccd_count", "header": "CCDs Sent",       "format": "number" },
    { "field": "first_seen","header": "First CCD",       "format": "timestamp" },
    { "field": "last_seen", "header": "Most Recent CCD", "format": "timestamp" }
  ]
}
```

**Example — empty state with custom message:**

```json
{
  "id": "recent_detail_table",
  "type": "generic_table",
  "empty_message": "No sites active in the last 30 days.",
  "data_source": { "artifact": "recent_detail_30d.json", "field": "rows" },
  "totals": false,
  "columns": [...]
}
```

---

## Section Layout Types

Sections in `layout.sections[]` specify a `layout.type` that controls how their widgets
are arranged.

| Layout type | Behaviour | Typical use |
|-------------|-----------|-------------|
| `"grid"` | CSS grid — widgets positioned by `layout.col`, `layout.row`, `layout.w`, `layout.h` | KPI card rows with precise sizing |
| `"stack"` | Single-column vertical stack — widget `layout` ignored | Full-width tables and charts |
| `"flex_row"` | Horizontal flex row — widgets sized equally and wrap on small viewports | KPI card overview rows where equal sizing is acceptable |

> **`flex_row` vs `grid`:** Use `flex_row` when KPI cards should share equal width automatically.
> Use `grid` when widgets need specific column spans or non-uniform sizes.

**Example — `flex_row` overview section:**

```json
{
  "id": "kpis",
  "label": "Overview",
  "widget_ids": ["total_kpi", "first_seen_kpi", "last_seen_kpi", "regions_kpi", "sites_kpi"],
  "layout": { "type": "flex_row" }
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
  formatter:         "number" | "string" | "currency" | "percent" | "datetime" | "date_string",
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
| `total_ccds_sent` | Total CCDs Sent | number | neutral | All time |
| `earliest_event_ts` | First CCD Sent | date_string | neutral | *(none)* |
| `latest_event_ts` | Most Recent CCD Sent | date_string | neutral | *(none)* |
| `regions_active_30d` | Regions Active | number | neutral | Last 30 days |
| `sites_active_30d` | Sites Active | number | neutral | Last 30 days |

**`date_string` formatter:** Slices the artifact value to its first 10 characters, yielding
`YYYY-MM-DD` from ISO date strings or ISO timestamps. The KPI card renders the value in a
slightly smaller font (`1.4rem`) to accommodate the wider string.

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
