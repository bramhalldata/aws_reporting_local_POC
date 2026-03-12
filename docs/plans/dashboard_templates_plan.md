# Feature Plan: Dashboard Templates

**Feature:** Dashboard Templates
**Stage:** Plan
**Date:** 2026-03-12

---

## 1. Feature Overview

The platform has a full widget registry, metric catalog, widget presets, plugin contract, and
developer guides.  A developer adding a new dashboard still authors `definition.json` from
scratch — selecting section structure, widget types, layout positions, and filter declarations
without a starting point.  Common dashboard shapes recur across clients but have no reusable
form.

This feature defines **dashboard templates**: documented, annotated `definition.json` starter
files that developers copy and fill with dashboard-specific values.

No runtime mechanism.  No core code changes.  Templates are documentation artifacts.

---

## 2. Why Templates Matter

| Without templates | With templates |
|------------------|----------------|
| Developer reads two existing dashboards to reverse-engineer the shape | Developer copies the template closest to their goal |
| Every new dashboard re-chooses section structure independently | Common layouts are codified and named |
| New developers don't know which widget combinations make sense together | Templates demonstrate idiomatic widget groupings |
| `add-dashboard.md` Step 1 says "create definition.json" with no model | Step 1 says "start from `docs/templates/<name>.json`" |

Templates reduce authoring friction and establish conventions for common dashboard shapes
without adding any runtime complexity.

---

## 3. Proposed Template Model

### What a template is

A template is a complete, annotated `definition.json` skeleton stored under `docs/templates/`.

All dashboard-specific values use `"<SCREAMING_SNAKE_CASE>"` placeholder syntax:

```json
{
  "id":    "<DASHBOARD_ID>",
  "title": "<Human Readable Title>",
  ...
}
```

Every placeholder is immediately obvious and greppable.  A developer replaces all
`<PLACEHOLDER>` values to produce a concrete `definition.json`.

Templates are **never** imported, referenced at runtime, or registered in `dashboardRegistry`.
They are starting points only.

### Placeholder conventions

| Value type | Placeholder syntax | Example |
|-----------|-------------------|---------|
| String — dashboard id | `"<DASHBOARD_ID>"` | becomes `"site_performance"` |
| String — human title | `"<Human Readable Title>"` | becomes `"Site Performance"` |
| String — metric ID | `"<METRIC_ID>"` | becomes `"failures_last_24h"` |
| String — artifact name | `"<ARTIFACT_NAME>.json"` | becomes `"summary.json"` |
| String — artifact field | `"<FIELD_NAME>"` | becomes `"failures_last_24h"` |
| String — section ID | `"<SECTION_ID>"` | becomes `"kpis"` |
| String — widget ID | `"<WIDGET_ID>"` | becomes `"failures_24h"` |
| Number — layout position | `0` | replace with actual column/row |
| Number — layout size | `6` | replace with actual width/height |

Widget preset references require no substitution — the preset ID is real and ready to use.
Widgets with no matching preset use fully annotated inline definitions with placeholders.

### Template catalogue (v1 — 3 templates)

#### `minimal`

One section, one KPI card.

- Section: "Overview" (grid, 1 `kpi_card`)
- Filters: client, env, date_range (standard set)
- Use for: prototypes, proof-of-concept dashboards, starting point before adding sections

#### `kpi_overview`

Two sections: KPI grid + ranked table.

- Section 1: "Overview" (grid, 2 `kpi_card` — uses preset references)
- Section 2: "Details" (stack, 1 `data_table`)
- Filters: client, env, date_range
- Use for: executive summaries, client-facing operational dashboards

#### `full_operational`

Four sections: KPI grid + trend chart + site breakdown + exceptions.

- Section 1: "Overview" (grid, 2 `kpi_card` — uses preset references)
- Section 2: "Trends" (stack, 1 `line_chart`)
- Section 3: "Top Sites" (stack, 1 `data_table`)
- Section 4: "Exceptions" (stack, 1 `exceptions_table`)
- Filters: client, env, date_range
- Use for: production operations dashboards — mirrors the existing `dlq_operations` shape

---

## 4. Template vs Concrete Dashboard Rules

| Aspect | Template | Concrete dashboard |
|--------|----------|--------------------|
| Location | `docs/templates/<name>.json` | `portal/src/dashboards/<id>/definition.json` |
| `id` field | `"<DASHBOARD_ID>"` | matches folder name and registry entry |
| `title` | `"<Human Readable Title>"` | actual display title |
| Widget preset references | May be used directly (no substitution) | Same |
| Inline widget `metric` | `"<METRIC_ID>"` | actual metric catalog ID |
| Inline widget `data_source.artifact` | `"<ARTIFACT_NAME>.json"` | actual artifact filename |
| `schema_version` | `"1.0.0"` (no substitution needed) | `"1.0.0"` |
| Registered in `dashboardRegistry` | Never | Yes — Step 3 of add-dashboard.md workflow |
| Imported in source code | Never | By the view component |

A template that passes `grep '<' definition.json` with no output is fully customised.

---

## 5. Files to Create or Modify

### Create

| File | Purpose |
|------|---------|
| `docs/templates/minimal.json` | Minimal single-KPI template |
| `docs/templates/kpi_overview.json` | Two-section KPI + table template |
| `docs/templates/full_operational.json` | Four-section full operations template |
| `docs/templates/README.md` | Template index with decision table and usage instructions |

### Modify

| File | Change |
|------|--------|
| `docs/guides/add-dashboard.md` | Add "Starting from a template" section immediately after the Step 1 heading, before the definition.json field-by-field description |

### Not modified

- All source code
- `portal/src/dashboards/index.js` — templates have no runtime presence
- `DashboardRenderer.jsx`, `widgetRegistry.js`, `metricCatalog.js`
- `docs/guides/widget-library.md` — templates link to it, no changes needed

---

## 6. Risks / Tradeoffs

| Risk | Mitigation |
|------|-----------|
| Templates drift from the schema as the platform evolves | Templates use only fields documented in `widget-library.md` and validated by existing concrete dashboards; no experimental fields |
| Three templates with similar names confuse new developers | `docs/templates/README.md` opens with a decision table: describe your dashboard → template recommendation |
| Template KPI widgets become outdated if preset IDs change | Preset-referencing widgets use real preset IDs (not placeholders); they will break visibly if the preset is removed, prompting an update |
| Developer forgets to replace a placeholder | Placeholders use `<SCREAMING_SNAKE_CASE>` — JSON parsers will reject them at parse time, making the error immediate |
| Templates add maintenance overhead | Three small JSON files; maintenance cost is low relative to onboarding value |

---

## 7. Verification Checklist

- [ ] Three template files created in `docs/templates/`
- [ ] `docs/templates/README.md` created with decision table
- [ ] All templates use consistent `"<SCREAMING_SNAKE_CASE>"` placeholder syntax for all variable fields
- [ ] `kpi_overview` and `full_operational` KPI sections use widget preset references (`failures_24h_kpi`, `failures_7d_kpi`)
- [ ] Non-preset widgets (line_chart, data_table, exceptions_table) use fully annotated inline definitions with placeholders
- [ ] `schema_version` is `"1.0.0"` in all templates (no substitution required)
- [ ] Standard filters block (client, env, date_range) is present in all three templates
- [ ] A developer can `cp docs/templates/full_operational.json portal/src/dashboards/<id>/definition.json`, replace all `<...>` values, and have a valid `definition.json` with no unknown fields
- [ ] No `definition.json` fields appear in templates that are not also present in existing concrete dashboards (`dlq_operations`, `pipeline_health`)
- [ ] `add-dashboard.md` "Starting from a template" section added with `cp` command example
- [ ] Zero source code changes made or required
