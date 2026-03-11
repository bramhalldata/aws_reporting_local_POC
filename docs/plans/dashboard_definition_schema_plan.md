# Dashboard Definition Schema — Implementation Plan

**Feature:** Dashboard Definition Schema
**Roadmap Phase:** 1 of 10
**Branch:** feature/dashboard-plugin-architecture
**Date:** 2026-03-11

---

## Feature Overview

Introduces a structured `DashboardDefinition` contract that describes a dashboard entirely through configuration. This is the architectural pivot that enables future phases: renderer, widget registry, layout abstraction, and drag-and-drop.

This feature is **schema only** — no renderer, no persistence, no visual changes to the portal.

---

## Current Problem / Limitation

Dashboards are currently built by direct JSX composition in `portal/src/dashboards/{id}/*.jsx`. Each dashboard manually:
- Selects which components to render
- Determines layout order in markup
- Hard-codes which artifact fields to display
- Embeds filter behavior inline

The existing `dashboards/{id}/dashboard.json` is a **publisher config** only — it tells the Python publisher which SQL blocks to run and which artifacts to produce. It contains no rendering information.

There is no machine-readable description of *what a dashboard looks like* — which widgets it contains, how they are arranged, which filters apply, or what default state it starts in.

---

## Proposed Schema Design

The `DashboardDefinition` contract is a JSON document that fully describes a dashboard's rendering intent.

It is **separate from** the existing `dashboard.json` publisher config. They are linked by a shared `id` field. This separation keeps backend assembly logic independent from frontend rendering config.

### Separation of Concerns

| File | Consumer | Purpose |
|------|----------|---------|
| `dashboards/{id}/dashboard.json` | Python publisher | SQL blocks to run, artifacts to produce |
| `dashboards/{id}/definition.json` | Portal renderer (Phase 2+) | Widgets, layout sections, filters, defaults |

### Top-Level Structure

```json
{
  "id": "dlq_operations",
  "title": "DLQ Operations",
  "description": "Monitors DLQ failure rates and site-level breakdowns.",
  "schema_version": "1.0.0",
  "layout": { ... },
  "widgets": [ ... ],
  "filters": [ ... ],
  "defaults": { ... }
}
```

Note: `schema_version` (not `version`) for consistency with `manifest.json`.

### `layout` Object

Groups widgets into named sections. Minimal layout abstraction for Phase 1 — no grid coordinates (deferred to Phase 6).

```json
"layout": {
  "sections": [
    {
      "id": "kpis",
      "label": "Overview",
      "widget_ids": ["failures_24h", "failures_7d", "active_sites"]
    },
    {
      "id": "trends",
      "label": "Trends",
      "widget_ids": ["failure_trend_chart"]
    },
    {
      "id": "breakdowns",
      "label": "Breakdowns",
      "widget_ids": ["top_sites_table", "exception_types_table"]
    }
  ]
}
```

### `widgets` Array

Each widget is a typed, self-contained display unit. Widget types map to existing components in `portal/src/components/`.

Supported types for Phase 1:

| Type | Maps To |
|------|---------|
| `kpi_card` | `KpiCard.jsx` |
| `line_chart` | `TrendChart.jsx` |
| `data_table` | `TopSitesTable.jsx` |
| `exceptions_table` | `ExceptionsTable.jsx` |
| `health_banner` | `HealthBanner.jsx` (binds to `manifest.json`) |

```json
"widgets": [
  {
    "id": "failures_24h",
    "type": "kpi_card",
    "title": "Failures (24h)",
    "data_source": {
      "artifact": "summary.json",
      "field": "total_failures_24h"
    }
  },
  {
    "id": "failure_trend_chart",
    "type": "line_chart",
    "title": "30-Day Failure Trend",
    "data_source": {
      "artifact": "trend_30d.json",
      "field": null
    }
  }
]
```

`field: null` means the entire artifact payload is passed (for array-typed artifacts like trend data).

**Note on `health_banner`:** This widget type binds to `manifest.json` rather than a data artifact. Use `"artifact": "manifest.json"` with `"field": null`. Full manifest binding behavior is handled in Phase 2.

### `filters` Array

Dashboard-level filter declarations. Phase 1 documents existing URL-param filters only. New filter types (date range, site selector) are deferred.

```json
"filters": [
  { "id": "client", "type": "url_param", "param": "client" },
  { "id": "env",    "type": "url_param", "param": "env" }
]
```

### `defaults` Object

Initial state values. Phase 1 scope: default active section.

```json
"defaults": {
  "section": "kpis"
}
```

---

## Required vs Optional Fields

### DashboardDefinition (root)

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `id` | ✅ | string | Must match `dashboard.json` `dashboard_id` |
| `title` | ✅ | string | Display name |
| `schema_version` | ✅ | string | Semver (e.g. `"1.0.0"`) |
| `description` | ❌ | string | Optional subtitle |
| `layout` | ✅ | object | Must contain `sections` array |
| `widgets` | ✅ | array | Minimum 1 widget required |
| `filters` | ❌ | array | Omit or empty array if no filters |
| `defaults` | ❌ | object | Omit or empty object if no defaults |

### Section

| Field | Required | Type |
|-------|----------|------|
| `id` | ✅ | string |
| `label` | ✅ | string |
| `widget_ids` | ✅ | string[] |

### Widget

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `id` | ✅ | string | Unique within dashboard |
| `type` | ✅ | enum | One of the supported widget types |
| `title` | ✅ | string | Display label |
| `data_source` | ✅ | object | Artifact binding |
| `data_source.artifact` | ✅ | string | Must match an artifact listed in `dashboard.json` (or `manifest.json` for `health_banner`) |
| `data_source.field` | ✅ | string \| null | Specific field key, or `null` for full payload |

### Filter

| Field | Required | Type |
|-------|----------|------|
| `id` | ✅ | string |
| `type` | ✅ | enum (`"url_param"`) |
| `param` | ✅ | string |

---

## Example Dashboard Definition — DLQ Operations

**File:** `dashboards/dlq_operations/definition.json`

```json
{
  "id": "dlq_operations",
  "title": "DLQ Operations",
  "description": "Monitors DLQ failure rates and site-level breakdowns.",
  "schema_version": "1.0.0",
  "layout": {
    "sections": [
      {
        "id": "kpis",
        "label": "Overview",
        "widget_ids": ["failures_24h", "failures_7d", "active_sites"]
      },
      {
        "id": "trends",
        "label": "Trends",
        "widget_ids": ["failure_trend_chart"]
      },
      {
        "id": "breakdowns",
        "label": "Breakdowns",
        "widget_ids": ["top_sites_table", "exception_types_table"]
      }
    ]
  },
  "widgets": [
    {
      "id": "failures_24h",
      "type": "kpi_card",
      "title": "Failures (24h)",
      "data_source": { "artifact": "summary.json", "field": "total_failures_24h" }
    },
    {
      "id": "failures_7d",
      "type": "kpi_card",
      "title": "Failures (7d)",
      "data_source": { "artifact": "summary.json", "field": "total_failures_7d" }
    },
    {
      "id": "active_sites",
      "type": "kpi_card",
      "title": "Active Sites",
      "data_source": { "artifact": "summary.json", "field": "active_sites" }
    },
    {
      "id": "failure_trend_chart",
      "type": "line_chart",
      "title": "30-Day Failure Trend",
      "data_source": { "artifact": "trend_30d.json", "field": null }
    },
    {
      "id": "top_sites_table",
      "type": "data_table",
      "title": "Top Sites by Failures",
      "data_source": { "artifact": "top_sites.json", "field": null }
    },
    {
      "id": "exception_types_table",
      "type": "exceptions_table",
      "title": "Exception Types",
      "data_source": { "artifact": "exceptions.json", "field": null }
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

---

## Example Dashboard Definition — Pipeline Health

**File:** `dashboards/pipeline_health/definition.json`

```json
{
  "id": "pipeline_health",
  "title": "Pipeline Health",
  "description": "Operational health indicators for the CCD failure pipeline.",
  "schema_version": "1.0.0",
  "layout": {
    "sections": [
      {
        "id": "kpis",
        "label": "Overview",
        "widget_ids": ["docs_processed_24h", "active_sites_24h", "latest_event"]
      },
      {
        "id": "breakdowns",
        "label": "Failure Breakdown",
        "widget_ids": ["failure_types_table"]
      }
    ]
  },
  "widgets": [
    {
      "id": "docs_processed_24h",
      "type": "kpi_card",
      "title": "Docs Processed (24h)",
      "data_source": { "artifact": "summary.json", "field": "docs_processed_24h" }
    },
    {
      "id": "active_sites_24h",
      "type": "kpi_card",
      "title": "Active Sites (24h)",
      "data_source": { "artifact": "summary.json", "field": "active_sites_24h" }
    },
    {
      "id": "latest_event",
      "type": "kpi_card",
      "title": "Latest Event",
      "data_source": { "artifact": "summary.json", "field": "latest_event_ts" }
    },
    {
      "id": "failure_types_table",
      "type": "exceptions_table",
      "title": "Failure Types",
      "data_source": { "artifact": "failure_types.json", "field": null }
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

---

## Files to Create

| File | Purpose |
|------|---------|
| `docs/schemas/dashboard_definition.schema.json` | JSON Schema (draft-07) formal definition for validation tooling |
| `dashboards/dlq_operations/definition.json` | Dashboard definition for DLQ Operations |
| `dashboards/pipeline_health/definition.json` | Dashboard definition for Pipeline Health |
| `portal/src/types/dashboardDefinition.js` | JS shape documentation for portal consumers (documentation only — not runtime code) |

## Files to Modify

| File | Change |
|------|--------|
| `docs/json-contracts.md` | Add `DashboardDefinition` section documenting the schema and field catalog |

## Unchanged Components

- `dashboards/{id}/dashboard.json` — publisher configs unchanged
- All React components in `portal/src/components/` — unchanged
- Dashboard page components in `portal/src/dashboards/{id}/` — unchanged
- `portal/src/dashboards/index.js` — unchanged
- Publisher Python code (`src/publisher/`) — unchanged
- SQL views (`sql/athena_views.sql`) — unchanged
- All existing artifact JSON schemas — unchanged

---

## Risks / Tradeoffs

| Risk | Mitigation |
|------|-----------|
| `definition.json` and `dashboard.json` can drift (mismatched artifact names) | Phase 2 renderer validates cross-references; Phase 1 relies on human review |
| `data_source.field` must match actual artifact keys | Document all valid field names per artifact in `docs/json-contracts.md` |
| Widget type enum may grow quickly | Enum is extensible; adding new types does not break existing definitions |
| No TypeScript — no static validation of schema usage in portal | `dashboardDefinition.js` serves as living shape documentation |
| `health_banner` binds to `manifest.json` not a data artifact | Document as special case; full handling deferred to Phase 2 renderer |

---

## Verification Checklist

1. Open `dashboards/dlq_operations/definition.json` — confirm 6 widgets across 3 sections
2. Open `dashboards/pipeline_health/definition.json` — confirm 4 widgets across 2 sections
3. Validate both files against `docs/schemas/dashboard_definition.schema.json` using `ajv` CLI or equivalent
4. Confirm every `data_source.artifact` value in both definitions matches an entry in the corresponding `dashboard.json` `artifacts` array (or is `manifest.json` for `health_banner`)
5. Confirm `docs/json-contracts.md` has a new `DashboardDefinition` section with field catalog
6. Confirm `docs/schemas/dashboard_definition.schema.json` does not reference any specific dashboard by name
7. Confirm a hypothetical new dashboard (e.g. `billing_summary`) can be added by creating only a `definition.json` without modifying the JSON Schema

## Negative Tests

- Remove required field `id` from a `definition.json` → JSON Schema validation must reject with a missing required property error
- Add a widget with `"type": "unknown_widget"` → JSON Schema validation must reject with an enum violation error
- Add a `widget_id` in a `layout.sections` entry with no corresponding widget in the `widgets` array → flag as a cross-reference error (manual check for Phase 1; automated in Phase 2 renderer)
