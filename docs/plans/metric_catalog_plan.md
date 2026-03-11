# Plan: Metric Catalog

## Goal

Introduce a centralized `MetricCatalog` that defines metric properties (label, formatter,
tone defaults, thresholds, trend settings) in one place.  KPI card widgets in dashboard
definitions will reference a metric by ID rather than duplicating label and display rules
inline on every widget.

---

## Context

Currently each `kpi_card` widget in a `definition.json` carries all display properties
inline via `widget.title` and `widget.kpi_config.*`.  When the same logical metric appears
across multiple dashboards (e.g. `failures_last_24h`) every instance must be updated
independently.  The Metric Catalog removes this duplication by making a widget's `metric`
field the single source of truth for display semantics.

---

## Files to Create

### `portal/src/metricCatalog.js`

A named-export module containing one entry per known metric.

**Metric definition shape:**

```js
{
  label:             string,           // eyebrow label rendered by KpiCard
  formatter:         string,           // "number" | "string" | "currency" | "percent"
  tone:              string,           // default tone: "neutral" | "positive" | "warning" | "critical"
  footnote:          string | null,    // default footnote (null = none)
  data_source_field: string | null,    // advisory artifact field name; see Data Source Binding note below
  trend: {                             // optional; reserved for Phase 6 trend arrows
    direction: "up_good" | "down_good",
  } | null,
  thresholds: [                        // optional ordered rules; first match wins
    { op: ">=" | ">" | "<=" | "<" | "==", value: number, tone: string }
  ],
}
```

**Data Source Binding — design decision:**

`data_source_field` is included in the catalog shape as an advisory field only.  In this
feature it is populated for documentation purposes (e.g. `"failures_last_24h"`) but is
**not enforced or read** by the propsAdapter.  Each widget definition retains its own
`data_source` block, which remains the authoritative binding.

Rationale for deferral:
- Auto-binding `data_source.field` from the catalog would require changing `WidgetRenderer`
  or `DashboardRenderer`, which are outside this feature's scope.
- The widget `data_source` block also carries the `artifact` filename, which the catalog
  has no knowledge of.
- Full data source binding is deferred to a future "Metric-Driven Data Binding" feature.

The field is present in the shape so the contract is visible and migration is
straightforward when that feature arrives.

**Initial catalog entries** (covers all existing kpi_card widgets):

| Metric ID                   | Label                     | Formatter | Default Tone | Footnote                    |
|-----------------------------|---------------------------|-----------|--------------|-----------------------------|
| `failures_last_24h`         | Failures — last 24 h      | number    | neutral      | 24-hour rolling window      |
| `failures_last_7d`          | Failures — last 7 days    | number    | neutral      | 7-day rolling window        |
| `total_documents_last_24h`  | Documents — last 24 h     | number    | neutral      | 24-hour rolling window      |
| `active_sites_last_24h`     | Active Sites — last 24 h  | number    | neutral      | Sites with ≥1 event         |
| `latest_event_timestamp`    | Latest Event              | string    | neutral      | Most recent pipeline event  |

### `portal/src/metricCatalog.test.js`

Unit tests for the catalog module and the `kpi_card` propsAdapter resolution logic.

**Test cases to cover:**

| # | Scenario | Expected outcome |
|---|----------|-----------------|
| 1 | `widget.metric` matches a catalog entry | `label`, `tone`, and `footnote` are resolved from catalog |
| 2 | Widget `kpi_config.tone` overrides catalog tone | widget-level tone wins |
| 3 | Widget `title` is set alongside `metric` | widget `title` wins over catalog label |
| 4 | Unknown metric ID (`"nonexistent_metric"`) | falls back to `widget.title` and `"neutral"` tone; no throw |
| 5 | `widget.metric` absent, `widget.title` set | behaves as today; catalog not consulted |
| 6 | Threshold rule triggered (value ≥ threshold) | tone set to threshold tone |
| 7 | Threshold rule not triggered (value below threshold) | catalog default tone used |

The test file imports the catalog directly and exercises the propsAdapter via the
`widgetRegistry.kpi_card.propsAdapter` export.

---

## Files to Modify

### `portal/src/widgetRegistry.js`

Update the `kpi_card` `propsAdapter` to resolve metric catalog properties when
`widget.metric` is set.

**Resolution order (highest priority last):**

1. Catalog defaults for `widget.metric` (label, tone, footnote)
2. Widget `title` overrides catalog label when explicitly set alongside `widget.metric`
3. Widget `kpi_config.*` overrides catalog defaults for tone, footnote, delta

If `widget.metric` is not set, the adapter behaves exactly as today (backward compatible).

**Threshold evaluation:**

If the catalog entry has `thresholds` and the resolved data value is a number, the adapter
evaluates rules top-to-bottom and applies the first matching rule's `tone` — before the
`kpi_config.tone` override is applied.  This lets catalog-level threshold signals be
overridden at the widget level if needed.

**Formatter application:**

| formatter  | behaviour in propsAdapter                                    |
|------------|--------------------------------------------------------------|
| `"number"` | pass raw value (KpiCard handles `toLocaleString`)            |
| `"string"` | pass raw value as-is (KpiCard renders strings unchanged)     |
| `"currency"` | pre-format with `Intl.NumberFormat` (style: currency, USD) and pass as string |
| `"percent"` | multiply by 100, append `%`, pass as string                |

> `"currency"` and `"percent"` are defined in the catalog shape for future use.
> Only `"number"` and `"string"` are exercised by the initial catalog entries.

### `portal/src/dashboards/dlq_operations/definition.json`

Add `"metric"` field to the two `kpi_card` widgets.  Remove redundant inline fields that
are now owned by the catalog (label is now catalog-supplied via `metric`; `title` may be
omitted or kept as an override).

```json
{
  "id": "failures_24h",
  "type": "kpi_card",
  "metric": "failures_last_24h",
  "data_source": { "artifact": "summary.json", "field": "failures_last_24h" }
}
```

```json
{
  "id": "failures_7d",
  "type": "kpi_card",
  "metric": "failures_last_7d",
  "data_source": { "artifact": "summary.json", "field": "failures_last_7d" }
}
```

### `portal/src/dashboards/pipeline_health/definition.json`

Add `"metric"` field to the three `kpi_card` widgets.

```json
{ "id": "docs_processed_24h",  "type": "kpi_card", "metric": "total_documents_last_24h",  ... }
{ "id": "active_sites_24h",    "type": "kpi_card", "metric": "active_sites_last_24h",     ... }
{ "id": "latest_event",        "type": "kpi_card", "metric": "latest_event_timestamp",    ... }
```

---

## Unchanged Components

- `portal/src/components/KpiCard.jsx` — no changes; prop contract is stable
- `portal/src/components/DashboardRenderer.jsx` — no changes
- `portal/src/components/WidgetRenderer.jsx` — no changes; metric resolution is internal to the propsAdapter
- `portal/src/components/TrendChart.jsx`
- `portal/src/components/TopSitesTable.jsx`
- `portal/src/components/ExceptionsTable.jsx`
- All publisher, SQL, and artifact files

---

## New SQL / Schema / Config

None.  The Metric Catalog is a portal-only, front-end concern.  It does not alter artifact
schemas or publisher behavior.

---

## New Artifacts

None.

---

## Portal Changes Summary

| File | Change |
|------|--------|
| `portal/src/metricCatalog.js` | **Create** — catalog module with 5 initial metric entries |
| `portal/src/metricCatalog.test.js` | **Create** — 7 unit test cases for catalog resolution and propsAdapter |
| `portal/src/widgetRegistry.js` | **Modify** — `kpi_card` propsAdapter reads catalog when `widget.metric` is set |
| `portal/src/dashboards/dlq_operations/definition.json` | **Modify** — add `"metric"` to 2 kpi_card widgets |
| `portal/src/dashboards/pipeline_health/definition.json` | **Modify** — add `"metric"` to 3 kpi_card widgets |

---

## Backward Compatibility

- Widgets without a `metric` field continue to work exactly as today.
- No existing tests break (propsAdapter falls through to current logic when `widget.metric` is absent).
- No KpiCard prop changes.

---

## Verification Steps

1. **DLQ Operations dashboard loads** — navigate to `/demo/dlq_operations`; KPI cards show
   correct labels ("Failures — last 24 h", "Failures — last 7 days") and values.

2. **Pipeline Health dashboard loads** — navigate to `/demo/pipeline_health`; all three KPI
   cards show correct labels and values.

3. **Catalog-supplied footnote renders** — inspect KPI cards; footnote text matches catalog
   definition without being duplicated in `definition.json`.

4. **Widget-level override works** — temporarily add `"kpi_config": { "tone": "warning" }`
   to a widget with a `metric` reference; confirm the card border changes to amber.

5. **No registry errors** — browser console shows no `Unknown widget type` warnings.

6. **Non-kpi_card widgets unchanged** — `line_chart`, `data_table`, `exceptions_table`
   widgets render without regression.

---

## Negative Tests

1. **Unknown metric ID** — set `"metric": "nonexistent_metric"` on a widget; the propsAdapter
   must fall back gracefully (use `widget.title` and default tone) rather than throwing.
   KpiCard must still render.

2. **metric field absent** — a `kpi_card` widget with no `metric` field and no `kpi_config`
   must render using `widget.title` as label and `"neutral"` tone — same behavior as today.

3. **Threshold not triggered** — set a threshold `{ op: ">=", value: 999999, tone: "critical" }`
   on a catalog entry; a normal data value must not trigger the critical tone.
