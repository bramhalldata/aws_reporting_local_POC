# Feature Plan: Widget Library Documentation

**Feature:** Widget Library Documentation
**Stage:** Plan
**Date:** 2026-03-12

---

## 1. Feature Overview

The widget system is fully registry-based, preset-aware, filter-aware, and plugin-ready.  Four
widget types are in production.  No single reference document exists that tells a developer what
widgets are available, what `definition.json` fields they require, what artifact shape they
consume, or when to choose one over another.

This feature produces `docs/guides/widget-library.md` — a focused internal reference document
that serves as the authoritative catalog for all widget types, metric definitions, and widget
presets.

No source code changes.  Deliverables: plan, review, and the guide itself.

---

## 2. Documentation Need

### What developers ask today

- "What widget types can I use?"  → currently answered only by reading `widgetRegistry.js`
- "What fields go in `definition.json` for a `kpi_card`?" → no doc; must read source + example dashboards
- "What metric IDs exist?" → must read `metricCatalog.js`
- "What presets can I reference?" → must read `widgetPresets.js`
- "When should I use `data_table` vs `exceptions_table`?" → no guidance exists

### What already exists

`docs/guides/add-dashboard.md` has a brief widget-type table:

| `type` | Component | Expected data shape |
|--------|-----------|---------------------|
| `kpi_card` | KpiCard | scalar number or string |
| `line_chart` | TrendChart | `[{ date, failures }]` |
| `data_table` | TopSitesTable | `[{ site, failures }]` |
| `exceptions_table` | ExceptionsTable | `[{ failure_type, count }]` |

This table is correct but insufficient for practical use — it has no field-level detail, no
examples, no metric catalog reference, and no guardrails.

---

## 3. Proposed Documentation Structure

### File: `docs/guides/widget-library.md`

**Audience:** Internal platform developers adding dashboards or new widget types.

**Length target:** ~300–400 lines — detailed enough to be useful, short enough to stay maintained.

**Format:** One H2 per major section.  Each widget type follows a consistent sub-template:
*purpose → definition.json fields table (Required column) → artifact data shape → `kpi_config` block if applicable → example snippet*.

---

### Section outline

#### Overview
- How widgets work: `definition.json` → `resolveWidgets` → `WidgetRenderer` → `widgetRegistry[type]` → `propsAdapter` → component
- Authoritative source files: `portal/src/widgetRegistry.js`, `portal/src/metricCatalog.js`, `portal/src/dashboards/widgetPresets.js`

#### Widget Type Reference

One sub-section per type following the template above.

**`kpi_card`**
- Purpose: display a single scalar metric with label, tone, footnote, and optional delta
- Fields table (Required column included):

| Field | Required | Description |
|-------|----------|-------------|
| `type` | Yes | `"kpi_card"` |
| `metric` | No* | Metric catalog ID — supplies label, tone, footnote, formatter. *Required unless all overridden via `kpi_config`. |
| `data_source.artifact` | Yes | JSON artifact filename (e.g. `"summary.json"`) |
| `data_source.field` | Yes | Field path within artifact (e.g. `"failures_last_24h"`) |
| `layout` | Yes (grid) | `{ col, row, w, h }` — initial grid position |
| `kpi_config` | No | Override block: `{ tone, footnote, delta, sparklineData }` |

- Artifact data shape: scalar — `number | string | null`
- `kpi_config` fields table (P2 + P3 from review):

| Field | Type | Description |
|-------|------|-------------|
| `tone` | string | Overrides catalog tone: `"neutral"`, `"positive"`, `"warning"`, `"critical"` |
| `footnote` | string | Overrides catalog footnote text |
| `delta` | string | Comparison line below value (e.g. `"↓ 8% vs last week"`) |
| `sparklineData` | array | Reserved — not yet rendered |

- Preset shorthand note
- Full inline example

**`line_chart`**
- Purpose: display daily trend data over 30 days as a line chart
- Fields table with Required column
- Artifact data shape: `[{ date: "YYYY-MM-DD", failures: number }, ...]`
- No metric catalog dependency
- Full inline example

**`data_table`**
- Purpose: display a ranked list of sites with failure counts
- Fields table with Required column
- Artifact data shape: `[{ site: string, failures: number }, ...]`
- `title` field maps to column header / card title
- Full inline example

**`exceptions_table`**
- Purpose: display failure types ranked by count
- Fields table with Required column
- Artifact data shape: `[{ failure_type: string, count: number }, ...]`
- Default title: `"Exceptions by Type — last 7 days"`
- Full inline example

#### Metric Catalog Reference
- What the catalog provides: label (display name), formatter, tone, footnote
- Table of all 5 current metric IDs with all fields
- How to add a new metric: add an entry to `portal/src/metricCatalog.js` following the shape

#### Widget Presets Reference
- What a preset is: a named widget template (type + metric + data_source + layout)
- Merge semantics: `{ ...preset, ...localFields }` — local fields win, shallow merge
- Table of current preset IDs (`failures_24h_kpi`, `failures_7d_kpi`) with full shapes
- When to use a preset: widget binding appears in ≥2 dashboards
- Example: referencing with local layout override

#### Adding a New Widget Type
- 3-step process: create component → add registry entry → (optional) add metric catalog entry
- Reference to `portal/src/widgetRegistry.js` for entry shape
- Note: unknown widget types render `UnknownWidget` (yellow warning block) — no crash (P3 from review)

#### Naming Conventions
| Element | Convention | Example |
|---------|-----------|---------|
| Widget type string | `snake_case` | `kpi_card`, `line_chart` |
| Widget ID in definition.json | `snake_case`, unique within dashboard | `failures_24h` |
| Preset ID | `<metric_id>_kpi` for KPI presets | `failures_24h_kpi` |
| Metric ID | `snake_case`, matches `data_source_field` where possible | `failures_last_24h` |

#### Guardrails
- Metrics (label, tone, formatter, footnote) must be defined in `metricCatalog.js` — **not in component logic or propsAdapters** (architecture rule; see `docs/architecture.md`) (P2 from review)
- `propsAdapter` functions perform data transformation only — no metric computation
- Widget components must not query artifacts directly — `WidgetRenderer` handles all data extraction
- Unknown widget type strings render `UnknownWidget` (visible warning block, not a crash) — safe to experiment
- Preset IDs that don't exist produce the same `UnknownWidget` fallback

---

## 4. Example Coverage Recommendations

Each widget type section should include one complete `definition.json` widget snippet showing
the minimum required fields and one showing all optional fields.  Do not include full dashboard
definitions — keep examples to the widget block only.

Example coverage target:

| Widget | Minimal example | Full example |
|--------|----------------|--------------|
| `kpi_card` | type + data_source + metric | + kpi_config.tone + kpi_config.delta |
| `kpi_card` (preset) | preset reference | + local layout override |
| `line_chart` | type + data_source | — (no optional fields beyond title) |
| `data_table` | type + data_source | + title override |
| `exceptions_table` | type + data_source | + title override |

This is 7 total snippets — sufficient without becoming bloated.

---

## 5. Files to Create or Modify

### Create

| File | Purpose |
|------|---------|
| `docs/guides/widget-library.md` | Primary deliverable — widget type reference |

### Modify

| File | Change |
|------|--------|
| `docs/guides/add-dashboard.md` | Replace "Available widget types" table with a one-line cross-reference: "For full widget type documentation including field tables and examples, see `docs/guides/widget-library.md`." |

### Not modified

- All source code
- `portal/src/widgetRegistry.js` — doc references it, no changes
- `portal/src/metricCatalog.js` — doc references it, no changes
- `portal/src/dashboards/widgetPresets.js` — doc references it, no changes

---

## 6. Risks / Tradeoffs

| Risk | Mitigation |
|------|-----------|
| Docs drift as new widget types are added | "Adding a New Widget Type" section reminds authors to update `widget-library.md` |
| `widget-library.md` duplicates source JSDoc | Keep doc focused on developer orientation and usage examples; source files are ground truth for code contracts |
| `add-dashboard.md` and `widget-library.md` overlap | Strict separation: `add-dashboard.md` = workflow; `widget-library.md` = catalog. Cross-link, don't duplicate. |
| Doc becomes too long | Per-widget template is scannable by H3 headings; target is ≤400 lines |

---

## 7. Verification Checklist

- [ ] `widget-library.md` created at `docs/guides/widget-library.md`
- [ ] New developer can open the file and identify all 4 widget types from the H3 headings within 30 seconds
- [ ] Each widget type section includes a Required column in the fields table
- [ ] Each widget type section includes at least one complete `definition.json` snippet
- [ ] `kpi_card` section includes the `kpi_config` fields table
- [ ] Metric catalog table lists all 5 current metric IDs with all catalog fields
- [ ] Preset table lists both current preset IDs with merge semantics explained
- [ ] Naming conventions section covers widget type strings, widget IDs, metric IDs, preset IDs
- [ ] Guardrails section includes cross-reference to `docs/architecture.md`
- [ ] Guardrails section notes the `UnknownWidget` fallback (no crash)
- [ ] `add-dashboard.md` "Available widget types" section links to `widget-library.md` and removes the duplicate brief table
