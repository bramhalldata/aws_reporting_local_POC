# Step 2 Plan: Definition-Driven Migration for `sent_to_udm`

**Status:** Reviewed (two rounds) — ready for implementation approval.
**Date:** 2026-03-17
**Reviewer scores:** R1 8.5/10 → feedback applied → R2 9.0/10 → feedback applied → ready.

---

## Prefatory Finding: The Infrastructure Already Exists

Before designing anything new, the codebase must be understood as it actually is — not as the
modernization prompt described it. The gap between the prompt's model and the actual state
determines exactly what Step 2 must build.

**Actual current state:**

| What the prompt assumed | What actually exists |
|---|---|
| No renderer exists — each dashboard is a bespoke JSX file | `DashboardRenderer.jsx` is fully implemented |
| No widget registry | `widgetRegistry.js` exists with 4 registered types |
| No metric catalog | `metricCatalog.js` exists with 5 entries |
| No definition files | `dlq_operations/definition.json` and `pipeline_health/definition.json` both exist |
| `dlq_operations` is a bespoke JSX file | `DlqOperations.jsx` is a 6-line shell: `<DashboardRenderer definition={definition} />` |
| `pipeline_health` is a bespoke JSX file | `PipelineHealth.jsx` is a 6-line shell: `<DashboardRenderer definition={definition} />` |
| `sent_to_udm` is bespoke | **Correct** — `SentToUdm.jsx` is a 295-line bespoke component |

The platform is not in "pre-modernization" state. It is in **partial modernization state**. Two of
three dashboards are already definition-driven. Step 2 closes the gap for `sent_to_udm` and builds
one new widget infrastructure piece (`generic_table`) that makes the migration possible.

---

## Architecture Review

### How dashboards are currently registered

`portal/src/dashboards/index.js` exports `dashboardRegistry`:

```js
export const dashboardRegistry = [
  { id: "dlq_operations",  label: "DLQ Operations",  component: DlqOperations  },
  { id: "pipeline_health", label: "Pipeline Health", component: PipelineHealth },
  { id: "sent_to_udm",     label: "CCD Sent to UDM", component: SentToUdm     },
];
```

Each entry is `{ id, label, component }`. The component is a React component type — anything
renderable. For `dlq_operations` and `pipeline_health`, that component is a thin shell calling
`DashboardRenderer`. For `sent_to_udm`, it is the full bespoke component.

### How routes resolve dashboards

`App.jsx` iterates `dashboardRegistry` and produces a `<Route>` per entry:

```jsx
{dashboardRegistry.map(({ id, component: Component }) => (
  <Route key={id} path={id} element={<Component />} />
))}
```

Routes live under `/:client/:env`. `client` and `env` are read from URL params via `useParams()`
inside each component or hook — never hardcoded in any component.

`defaultDashboard = dashboardRegistry[0].id` — first registry entry = default landing.
`dlq_operations` must remain first. This is untouched in Step 2.

### Where the renderer is inserted — the hybrid boundary

The hybrid decision is made at the **component level**, not in `App.jsx`. All three dashboards
register identically. The difference is entirely inside the registered component:

```
DlqOperations.jsx   →  <DashboardRenderer definition={definition} />  (definition-driven)
PipelineHealth.jsx  →  <DashboardRenderer definition={definition} />  (definition-driven)
SentToUdm.jsx       →  bespoke JSX                                    (legacy)
```

Migrating `sent_to_udm` means replacing `SentToUdm.jsx`'s bespoke body with the same thin
`DashboardRenderer` shell. The registry entry does not change. Routing does not change.

---

## Definition Contract

The established definition schema (from `dlq_operations/definition.json`):

```json
{
  "id": "string",
  "title": "string",
  "description": "string",
  "schema_version": "1.0.0",
  "layout": {
    "sections": [
      {
        "id": "string",
        "label": "string",
        "description": "string (optional)",
        "widget_ids": ["string"],
        "layout": { "type": "grid | stack | flex_row" }
      }
    ]
  },
  "widgets": [
    {
      "id": "string",
      "type": "kpi_card | line_chart | data_table | exceptions_table",
      "preset": "string (optional)",
      "metric": "string (optional — kpi_card only, resolves from metricCatalog)",
      "title": "string (optional override)",
      "data_source": { "artifact": "filename.json", "field": "string (optional)" },
      "layout": { "col": 0, "row": 0, "w": 12, "h": 4 }
    }
  ],
  "filters": [
    { "id": "string", "type": "url_param", "param": "string" }
  ],
  "defaults": { "section": "string" }
}
```

Definitions live **co-located with their dashboards** in
`portal/src/dashboards/<id>/definition.json`. No central `dashboardDefinitions/` registry is
needed or introduced.

---

## Gaps Blocking `sent_to_udm` Migration

Three things prevent `sent_to_udm` from using `DashboardRenderer` today:

**Gap 1 — `TrendChart` hardcodes field names and title.**
`TrendChart` expects `{ date, failures }` row shape. It hardcodes `dataKey="failures"` and title
"Failure Trend — last 30 days". `sent_to_udm`'s `trend_30d.json` rows have `{ date, ccd_count }`.
This is why `SentToUdm.jsx` renders its own inline `AreaChart`.

**Gap 2 — `TopSitesTable` hardcodes column structure.**
`TopSitesTable` renders exactly two columns: Site (left) and Failures (right). It cannot render
`sent_to_udm`'s multi-column tables. A new column-configurable generic table widget is required.

**Gap 3 — No `date_string` formatter for `kpi_card`.**
`metricCatalog` has a `datetime` formatter that calls `new Date(value).toLocaleString(...)`.
DuckDB timestamp strings (`"2026-01-06 23:59:14-05:00"`) need `slice(0, 10)` for date-only KPI
display. A new `date_string` formatter is needed.

---

## Affected Files

### Modified
| File | Change |
|---|---|
| `portal/src/metricCatalog.js` | Add 5 new entries for `sent_to_udm` KPIs |
| `portal/src/widgetRegistry.js` | Add `date_string` formatter branch; update `line_chart` propsAdapter; register `generic_table` |
| `portal/src/components/TrendChart.jsx` | Add `dataKey`, `chartTitle`, `subtitle` props with defaults preserving current behavior |
| `portal/src/dashboards/sent_to_udm/SentToUdm.jsx` | Replace bespoke body with `<DashboardRenderer definition={definition} />` (final step) |

### New
| File | Purpose |
|---|---|
| `portal/src/components/GenericTable.jsx` | Column-configurable table widget component |
| `portal/src/dashboards/sent_to_udm/definition.json` | Dashboard definition for `sent_to_udm` |

### Unchanged (explicitly)
- `portal/src/dashboards/index.js` — registry unchanged
- `portal/src/App.jsx` — routing unchanged, defaults unchanged
- `portal/src/components/DashboardRenderer.jsx` — no changes required
- `portal/src/components/WidgetRenderer.jsx` — no changes required
- `portal/src/components/TopSitesTable.jsx` — not replaced; `data_table` type continues using it
- `DlqOperations.jsx`, `PipelineHealth.jsx` — untouched
- All publisher files, SQL, validators, artifacts

---

## New Components and Extensions

### 1. `GenericTable.jsx` — column-configurable table widget

**Props:**

| Prop | Type | Description |
|---|---|---|
| `title` | string | Optional section title |
| `rows` | array | Data rows from artifact |
| `columns` | array | Column definitions (see below) |
| `totals` | boolean | If true, appends a totals row |
| `emptyMessage` | string | Override for empty-rows message (default: "No data available.") |

**Column definition shape:**

```js
{
  field:     "string",              // artifact row field name
  header:    "string",              // column header label
  format:    "number|date_string|timestamp",
                                    // optional:
                                    //   number      → .toLocaleString()
                                    //   date_string → .slice(0, 10)            ("2026-01-06")
                                    //   timestamp   → .slice(0,19).replace("T"," ")  ("2026-01-06 23:59:14")
                                    //   absent      → raw string
  aggregate: "sum|min|max|label|none"  // explicit totals-row behavior (see below)
}
```

`"date_string"` and `"timestamp"` are distinct format values with different output lengths.
`"date_string"` produces a 10-character date (`"2026-01-06"`) — matching the KPI card formatter
of the same name so the same terminology means the same output across both systems.
`"timestamp"` produces a 19-character local datetime (`"2026-01-06 23:59:14"`) — appropriate
for table cells where the time component is informative.

**`aggregate` field — explicit totals row semantics:**

The `aggregate` field on each column drives the totals row computation. Header strings are NOT
used to determine aggregation behavior — this is a data contract concern, not a display concern.
Tying aggregate behavior to header strings would silently break if headers are relabelled.

| `aggregate` value | Totals row behavior |
|---|---|
| `"sum"` | Sum of all numeric values in the column |
| `"min"` | Lexicographic minimum (safe for `YYYY-MM-DD`-prefixed date strings) |
| `"max"` | Lexicographic maximum |
| `"label"` | Renders "Total" in this cell (used on the identifying column, typically the first) |
| `"none"` | Cell is empty in the totals row |
| absent | Cell is empty in the totals row |

**Card wrapper:** `GenericTable` carries its own card-style container (`background: theme.surface`,
`border: 1px solid theme.border`, `borderRadius: 8`, `boxShadow`). This follows the same pattern
as `TopSitesTable` and `TrendChart`, both of which own their own visual chrome. `DashboardRenderer`'s
section wrappers do not provide card styling — each widget component is responsible for its own
container.

**Empty state:** When `rows.length === 0`, renders `emptyMessage` text instead of an empty
`<tbody>`. Does not render a table shell when there is no data.

---

### 2. `TrendChart.jsx` — configurable props (backwards-compatible)

Change signature:

```jsx
// Before
export default function TrendChart({ days }) {

// After
export default function TrendChart({
  days,
  dataKey    = "failures",
  chartTitle = "Failure Trend — last 30 days",
  subtitle,
}) {
```

- All hardcoded `"failures"` references replaced with `dataKey`
- Hardcoded title string replaced with `chartTitle`
- Optional `subtitle` `<p>` rendered below the title when provided
- Defaults exactly match current hardcoded values — `dlq_operations` is unaffected when no
  `line_chart_config` is present in its definition

---

### 3. `widgetRegistry.js` — three additive changes

**a) `date_string` formatter in `kpi_card` propsAdapter** — added as `else if` after the existing
`datetime` case:

```js
else if (formatter === "date_string" && value != null) {
  value = String(value).slice(0, 10);
  valueFontSize = "1.4rem";
}
```

The `valueFontSize = "1.4rem"` assignment is consistent with the existing `datetime` formatter
which applies the same override. This is an acceptable pattern for Step 2; a future improvement
could move `valueFontSize` to the metric catalog entry.

**b) `line_chart` propsAdapter update** — passes `line_chart_config` fields to `TrendChart`:

```js
line_chart: {
  component: TrendChart,
  propsAdapter: (widget, data) => ({
    days:      data,
    dataKey:    widget.line_chart_config?.data_key,
    chartTitle: widget.line_chart_config?.title,
    subtitle:   widget.line_chart_config?.subtitle,
  }),
},
```

When `line_chart_config` is absent, all three values are `undefined` and `TrendChart` prop defaults
apply. `dlq_operations` behavior is unchanged.

**c) `generic_table` entry** — new registry key:

```js
generic_table: {
  component: GenericTable,
  propsAdapter: (widget, data) => ({
    title:        widget.title,
    rows:         data,
    columns:      widget.columns ?? [],
    totals:       widget.totals ?? false,
    emptyMessage: widget.empty_message,
  }),
},
```

---

### 4. `metricCatalog.js` — 5 new entries

```js
total_ccds_sent: {
  label:             "Total CCDs Sent",
  formatter:         "number",
  tone:              "neutral",
  footnote:          "All time",
  data_source_field: "total_ccds_sent",
  trend:             null,
  thresholds:        [],
},

earliest_event_ts: {
  label:             "First CCD Sent",
  formatter:         "date_string",
  tone:              "neutral",
  footnote:          null,
  data_source_field: "earliest_event_ts",
  trend:             null,
  thresholds:        [],
},

latest_event_ts: {
  label:             "Most Recent CCD Sent",
  formatter:         "date_string",
  tone:              "neutral",
  footnote:          null,
  data_source_field: "latest_event_ts",
  trend:             null,
  thresholds:        [],
},

regions_active_30d: {
  label:             "Regions Active",
  formatter:         "number",
  tone:              "neutral",
  footnote:          "Last 30 days",
  data_source_field: "regions_active_30d",
  trend:             null,
  thresholds:        [],
},

sites_active_30d: {
  label:             "Sites Active",
  formatter:         "number",
  tone:              "neutral",
  footnote:          "Last 30 days",
  data_source_field: "sites_active_30d",
  trend:             null,
  thresholds:        [],
},
```

---

## `sent_to_udm/definition.json` Design

### KPI section (`flex_row`)

| Widget id | metric | artifact field |
|---|---|---|
| `total_ccds_sent` | `total_ccds_sent` | `summary.json` → `total_ccds_sent` |
| `first_ccd_sent` | `earliest_event_ts` | `summary.json` → `earliest_event_ts` |
| `most_recent_ccd_sent` | `latest_event_ts` | `summary.json` → `latest_event_ts` |
| `regions_active_30d` | `regions_active_30d` | `summary.json` → `regions_active_30d` |
| `sites_active_30d` | `sites_active_30d` | `summary.json` → `sites_active_30d` |

No `grid` layout is used — `flex_row` for KPI section, `stack` for all other sections.
Because no section uses `layout.type === "grid"`, `DashboardRenderer`'s `hasGridSections` check
evaluates to false and the "Reset layout" button correctly does not appear.

### Region Summary table (`generic_table`, `totals: true`)

Source: `region_summary.json` → field `regions`

| `field` | `header` | `format` | `aggregate` |
|---|---|---|---|
| `region` | Region | — | `"label"` |
| `ccd_count` | CCDs Sent | `"number"` | `"sum"` |
| `first_seen` | First CCD Sent | `"timestamp"` | `"min"` |
| `last_seen` | Most Recent CCD Sent | `"timestamp"` | `"max"` |

### Trend chart (`line_chart`)

Source: `trend_30d.json` → field `days`

```json
"line_chart_config": {
  "data_key": "ccd_count",
  "title": "CCDs Sent To UDM by Region (Last 30 Days)",
  "subtitle": "Regional breakdown coming in a future release."
}
```

### Lifetime Detail table (`generic_table`, no totals)

Source: `lifetime_detail.json` → field `rows`

| `field` | `header` | `format` | `aggregate` |
|---|---|---|---|
| `region` | Region | — | — |
| `site` | Facility | — | — |
| `ccd_count` | CCDs Sent | `"number"` | — |
| `first_seen` | First CCD | `"timestamp"` | — |
| `last_seen` | Most Recent CCD | `"timestamp"` | — |

### Recent 30-Day Detail table (`generic_table`, no totals)

Source: `recent_detail_30d.json` → field `rows`

```json
"empty_message": "No sites active in the last 30 days."
```

| `field` | `header` | `format` | `aggregate` |
|---|---|---|---|
| `region` | Region | — | — |
| `site` | Facility | — | — |
| `ccd_count` | CCDs Sent | `"number"` | — |
| `first_seen_30d` | First Sent (30d) | `"timestamp"` | — |
| `last_seen_30d` | Last Sent (30d) | `"timestamp"` | — |

### Required envelope fields

The `sent_to_udm/definition.json` must include:
- `"schema_version": "1.0.0"` — required by the established definition contract
- `"defaults": { "section": "kpis" }` — required for initial section navigation
- `"filters": [{ "id": "client", ... }, { "id": "env", ... }]` — consistent with all existing
  definitions

---

## Known Visual Changes After Migration

These are **expected changes**, not regressions. They should be confirmed during Step 8
verification as acceptable behavior, not treated as surprises.

**1. Page container and `<h1>` title are added.**
`SentToUdm.jsx` currently renders a bare `<div>` with no outer page constraints. `DashboardRenderer`
wraps all content in `styles.page` (`maxWidth: 900, margin: "0 auto", padding: "2rem 1.5rem"`) and
always renders an `<h1>` title from `definition.title` ("CCD Files Sent To UDM"). After migration,
the dashboard gains a consistent page container and title heading matching `dlq_operations` and
`pipeline_health`. This is a visual improvement and intentional consistency gain.

**2. Section heading style changes.**
`SentToUdm.jsx` renders section titles as `<h3>` at 0.75rem, uppercase, muted color.
`DashboardRenderer` renders `section.label` as `<h2>` at 1.1rem, weight-600, with a blue left
border accent. Table sections will have visually heavier headings after migration. This is consistent
with the other two definition-driven dashboards.

Both changes should be confirmed as acceptable during Step 8 browser verification before the
migration commit is finalized.

---

## Risk Analysis

### Risk 1 — `TrendChart` regression (`dlq_operations`)

`TrendChart` is modified with optional props. If the default values do not exactly match the
current hardcoded strings, `dlq_operations` chart changes visually.

**Mitigation:** Verify defaults verbatim against current source before modifying. `dlq_operations`
definition.json passes no `line_chart_config` — existing behavior must be byte-for-byte identical
when the config is absent. Confirm `dlq_operations` trend chart visually after Step 3.

### Risk 2 — `widgetRegistry.js` modification cascades

Central module. A syntax error here breaks all definition-driven dashboards.

**Mitigation:** All changes are additive (new `else if` branch, new `?` optional chain, new
registry key). Run `npx vitest run` after each sub-change. Do not batch all three changes.

### Risk 3 — `SentToUdm.jsx` migration (highest-risk, last step)

If `definition.json` or any new widget infrastructure has a defect, `/contexture/prod/sent_to_udm`
breaks. `WidgetRenderer`'s `UnknownWidget` fallback prevents crashes but individual widgets may
render as warning blocks.

**Mitigation:** Execute Step 8 only after Steps 1–7 are all verified. Keep the bespoke body
in the Git diff for clean rollback. Verify all six browser checks before accepting the change.

### Risk 4 — `aggregate` field absent from column definitions

If `totals: true` is set on a table but a column has no `aggregate` field, that column's totals
cell is empty. This is correct behavior (defined as `"none"` equivalent). However, missing
`aggregate` on the "Total" label column would result in an empty first cell. The `region_summary`
column definitions must explicitly set `"aggregate": "label"` on the region column.

### Risk 5 — `date_string` formatter on null/undefined values

`String(null).slice(0, 10)` → `"null"`. The formatter must guard: `value != null` before
applying `String(value).slice(0, 10)`. Return `null` when guard fails (KpiCard renders `"—"`
for null values).

### Risk 6 — Vitest suite regression

`metricCatalog.test.js`, `resolveWidgets.test.js`, `useFilterState.test.js` test infrastructure
being modified. All modifications are to new keys or new branches. Run `npx vitest run` after
each step.

---

## Implementation Steps

Steps are ordered: additive infrastructure first, migration last. Each step is independently
verifiable before the next begins.

### Step 1 — Extend `metricCatalog.js`

Add 5 new entries (listed above). No existing entries change.

**Verify:** `npx vitest run` — all existing tests pass. No existing KPI cards affected.

---

### Step 2 — Add `date_string` formatter to `kpi_card` propsAdapter in `widgetRegistry.js`

Add `else if (formatter === "date_string" && value != null)` branch after the existing `datetime`
case. Guard: `value != null` before slice.

**Verify:** `npx vitest run` — all tests pass. `dlq_operations` and `pipeline_health` KPI cards
visually unchanged.

---

### Step 3 — Extend `TrendChart.jsx` with configurable props

Add `dataKey`, `chartTitle`, `subtitle` optional props with defaults matching exact current
hardcoded values. Replace hardcoded strings in JSX with prop references.

**Verify:** `npx vitest run` — all tests pass. Navigate to `/default/local/dlq_operations` —
confirm trend chart title and data series are visually identical to pre-change state.

---

### Step 4 — Update `line_chart` propsAdapter in `widgetRegistry.js`

Pass `line_chart_config` fields through to `TrendChart`. Use optional chaining so that absence
of `line_chart_config` results in `undefined` props → `TrendChart` defaults apply.

**Verify:** `npx vitest run` — all tests pass. `dlq_operations` trend chart still renders
unchanged (no `line_chart_config` in its definition).

---

### Step 5 — Create `GenericTable.jsx`

New component at `portal/src/components/GenericTable.jsx`. Implement:
- Card-style container wrapper (own `background`, `border`, `borderRadius`, `boxShadow`)
- Column-driven `<thead>` / `<tbody>` render
- `format` field handling per column (`"number"`, `"date_string"` → 10-char date, `"timestamp"` → 19-char local datetime, absent = raw string)
- Empty state: renders `emptyMessage` when `rows.length === 0`
- Totals row: when `totals === true`, appends a row using explicit `aggregate` field per column
  (`"sum"`, `"min"`, `"max"`, `"label"`, `"none"`/absent = empty cell)

Write Vitest tests covering:
- Columns render with correct headers
- Row data renders correctly for each format type
- Empty state message renders when `rows` is empty
- Totals row appears when `totals === true` with correct values per `aggregate` type
- No totals row when `totals` is false or absent

**Verify:** `npx vitest run` — new GenericTable tests pass, all existing tests pass.

---

### Step 6 — Register `generic_table` in `widgetRegistry.js`

Add `import GenericTable` and new `generic_table` registry entry (shown above).

**Verify:** `npx vitest run` — all tests pass. No existing registry entries changed.

---

### Step 7 — Create `sent_to_udm/definition.json`

Create the full definition file using the column specifications and widget definitions documented
above. Required fields checklist before saving:

- [ ] `"schema_version": "1.0.0"` present
- [ ] `"defaults": { "section": "kpis" }` present
- [ ] `"filters"` array with `client` and `env` entries present
- [ ] All `artifact` names match the 5 known `sent_to_udm` artifact filenames
- [ ] All `type` values exist in `widgetRegistry`
- [ ] All `metric` values exist in `metricCatalog`
- [ ] `region_summary_table` has `"totals": true` and all columns have explicit `aggregate` values
- [ ] `recent_table` has `"empty_message": "No sites active in the last 30 days."`
- [ ] No `"grid"` layout sections (confirms "Reset layout" button will not appear)

**Verify:** Lint/parse `definition.json`. `SentToUdm.jsx` is still the bespoke component at
this point — the definition file exists but is not wired in. No live dashboard is affected.

---

### Step 8 — Migrate `SentToUdm.jsx`

Replace the bespoke component body:

```jsx
import DashboardRenderer from "../../components/DashboardRenderer.jsx";
import definition from "./definition.json";

export default function SentToUdm() {
  return <DashboardRenderer definition={definition} />;
}
```

Remove all bespoke imports (recharts, useParams, useDashboardArtifacts, HealthBanner, KpiCard,
ScopeEmptyState, theme, fmtTs, ARTIFACT_NAMES, styles). These are all handled internally by
`DashboardRenderer` and the widget system.

**Verify (all six checks must pass):**

1. `npx vitest run` — all tests (114 + GenericTable tests) pass
2. `npm run build` — clean build, no errors
3. `publisher run --client contexture --env prod --dashboard sent_to_udm` — SUCCESS
4. Browser `/contexture/prod/sent_to_udm`:
   - HealthBanner renders with SUCCESS status
   - KPI row: 5 cards (Total CCDs Sent, First CCD Sent, Most Recent CCD Sent, Regions Active, Sites Active)
   - Region Summary table: 4 region rows + Grand Total row
   - Trend chart: title "CCDs Sent To UDM by Region (Last 30 Days)" with subtitle
   - Lifetime Detail table: Region / Facility / CCDs Sent / First CCD / Most Recent CCD
   - Recent 30-Day table: Region / Facility / CCDs Sent / First Sent (30d) / Last Sent (30d)
   - Page container and `<h1>` title present (expected visual change — confirm acceptable)
   - Section headings at 1.1rem with blue border accent (expected visual change — confirm acceptable)
   - No "Reset layout" button (no grid sections)
5. Browser `/default/local/sent_to_udm` — `ScopeEmptyState` renders (no artifacts for this scope)
6. Browser `/default/local/dlq_operations` and `/default/local/pipeline_health` — both
   visually unchanged, no regression

---

## File Change Summary

| Step | File | Change type | Regression risk |
|---|---|---|---|
| 1 | `metricCatalog.js` | Additive — new keys only | None |
| 2 | `widgetRegistry.js` | Additive — new `else if` branch | None |
| 3 | `TrendChart.jsx` | Additive — optional props with defaults | Low — defaults preserve current behavior |
| 4 | `widgetRegistry.js` | Additive — undefined config → undefined props → TrendChart defaults | None |
| 5 | `GenericTable.jsx` | New file | None |
| 6 | `widgetRegistry.js` | Additive — new registry key | None |
| 7 | `sent_to_udm/definition.json` | New file — not wired until Step 8 | None |
| 8 | `SentToUdm.jsx` | Replace bespoke body | Medium — verified last, full visual check required |

Steps 1–7 are all safe to execute without affecting any rendering path used by the three live
dashboards. Step 8 is the only step that changes visible behavior for `sent_to_udm`.
