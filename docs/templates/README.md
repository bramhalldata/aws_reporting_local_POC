# Dashboard Templates

Annotated `definition.json` starter files.  Copy one, fill in the placeholders, then follow
the [add-dashboard.md](../guides/add-dashboard.md) workflow to register the dashboard.

---

## Which template should I use?

| I want to build… | Use this template |
|------------------|------------------|
| A single headline KPI — prototype or proof-of-concept | `minimal` |
| An executive or client-facing view with KPIs and a ranked table | `kpi_overview` |
| A full operations dashboard with KPIs, trend, sites, and exceptions | `full_operational` |
| Something that doesn't fit above | Start from `minimal` and add sections |

---

## Templates

### `minimal.json`

**Shape:** One section — KPI grid with one metric card.

**Use for:** Prototypes, lightweight dashboards, or as a base before adding sections.

**Contents:**
- Section: "Overview" (grid layout)
- 1 × `kpi_card` (fully annotated with placeholders)
- Standard filters: client, env, date_range

---

### `kpi_overview.json`

**Shape:** Two sections — KPI grid + ranked table.

**Use for:** Executive summaries or client-facing operational dashboards that need a headline
number and a ranked breakdown.

**Contents:**
- Section 1: "Overview" (grid) — 2 × `kpi_card` using failure-metric presets
- Section 2: "Details" (stack) — 1 × `data_table` with placeholders
- Standard filters: client, env, date_range

> The KPI cards reference `failures_24h_kpi` and `failures_7d_kpi` presets.  Replace the
> `"preset"` field with `"type": "kpi_card"` plus inline fields if you need a different metric.
> See [widget-library.md](../guides/widget-library.md) for the full `kpi_card` field reference.

---

### `full_operational.json`

**Shape:** Four sections — KPI grid + trend chart + site breakdown + exceptions.

**Use for:** Production operations dashboards.  Mirrors the layout of the existing
`dlq_operations` dashboard.

**Contents:**
- Section 1: "Overview" (grid) — 2 × `kpi_card` using failure-metric presets
- Section 2: "Trends" (stack) — 1 × `line_chart` with placeholders
- Section 3: "Top Sites" (stack) — 1 × `data_table` with placeholders
- Section 4: "Exceptions" (stack) — 1 × `exceptions_table` with placeholders
- Standard filters: client, env, date_range

> The KPI cards reference `failures_24h_kpi` and `failures_7d_kpi` presets.  Replace the
> `"preset"` field with `"type": "kpi_card"` plus inline fields if you need a different metric.

---

## How to use a template

**1. Copy the template:**

```sh
cp docs/templates/kpi_overview.json portal/src/dashboards/<id>/definition.json
```

**2. Fill in all placeholders:**

All dashboard-specific values use `"<SCREAMING_SNAKE_CASE>"` placeholder syntax.
Replace every occurrence before proceeding.

```sh
# Confirm no placeholders remain:
grep '<' portal/src/dashboards/<id>/definition.json
# Should return no output.
```

**3. Continue with the workflow:**

Follow Steps 2 and 3 of [add-dashboard.md](../guides/add-dashboard.md):
- Create the view component
- Add the registry entry

---

## Placeholder conventions

| Value type | Placeholder syntax | Example result |
|-----------|-------------------|----------------|
| Dashboard ID | `"<DASHBOARD_ID>"` | `"site_performance"` |
| Human title | `"<Human Readable Title>"` | `"Site Performance"` |
| Section ID | `"<SECTION_ID>"` | `"kpis"` |
| Widget ID | `"<WIDGET_ID>"` | `"failures_24h"` |
| Metric ID | `"<METRIC_ID>"` | `"failures_last_24h"` |
| Artifact filename | `"<ARTIFACT_NAME>.json"` | `"summary.json"` |
| Artifact field | `"<FIELD_NAME>"` | `"failures_last_24h"` |

Layout numbers (`col`, `row`, `w`, `h`) use reasonable defaults — adjust as needed.

Preset references (`"preset": "failures_24h_kpi"`) are ready to use with no substitution.
See [widget-library.md — Widget Presets Reference](../guides/widget-library.md#widget-presets-reference)
for all available preset IDs.

---

## Adding a new template

Add a template when a new dashboard shape recurs across two or more real dashboards.
Templates should use only widget types, presets, and fields documented in
[widget-library.md](../guides/widget-library.md).  No experimental fields.
