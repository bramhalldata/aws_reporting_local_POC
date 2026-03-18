# Phase 2 Platform Hardening — Implementation Plan

**Status:** Reviewed (three rounds) — ready for implementation approval.
**Review scores:** R1 8.2/10 (content) → R2 6.0/10 (skill compliance) → R3 9.0/10 → final touches applied.

---

## Goal

Introduce formal validation, schema contracts, and updated documentation to harden the definition-driven dashboard platform. The architecture already works and all dashboards are definition-driven. This phase strengthens what exists: errors caught early, extension points fully documented, architectural rules anchored in a durable contract document.

Zero changes to publisher logic, artifact contracts, routing, or the dashboard registry. All changes are additive.

---

## Files to Create

```
docs/architecture/system-architecture-contract.md
portal/src/dashboards/dashboard-definition.schema.json
portal/src/dashboards/dashboard-definition.schema.test.js
portal/src/dashboards/validateDefinition.js
portal/src/dashboards/validateDefinition.test.js
```

---

## Files to Modify

```
docs/guides/widget-library.md
docs/guides/add-dashboard.md
portal/src/components/WidgetRenderer.jsx
portal/src/components/DashboardRenderer.jsx
portal/src/dashboards/dlq_operations/definition.json
portal/src/dashboards/pipeline_health/definition.json
portal/src/dashboards/sent_to_udm/definition.json
portal/src/metricCatalog.test.js
portal/package.json
```

---

## Unchanged Components

```
src/publisher/          — publisher logic, SQL execution, artifact generation, schema validation
sql/athena_views.sql    — metric definitions
artifacts/              — all artifact contracts (summary.json, manifest.json, etc.)
portal/src/App.jsx      — routing unchanged
portal/src/dashboards/index.js  — dashboardRegistry unchanged
portal/src/widgetRegistry.js    — no new widget types in this phase
portal/src/metricCatalog.js     — no new metrics in this phase (tests only)
portal/src/hooks/               — all hooks unchanged
portal/src/components/DashboardGrid.jsx
portal/src/components/KpiCard.jsx
portal/src/components/TrendChart.jsx
portal/src/components/GenericTable.jsx
portal/src/components/TopSitesTable.jsx
portal/src/components/ExceptionsTable.jsx
portal/src/dashboards/*/       — dashboard component files unchanged (definition.json adds $schema only)
```

---

## New SQL / Schema / Config

**New JSON Schema file:** `portal/src/dashboards/dashboard-definition.schema.json`

This is a JSON Schema Draft-07 document used for editor validation (VSCode) and Vitest regression tests. It is not loaded at runtime in the production bundle.

**Top-level required fields:**

```
id              string
title           string
schema_version  string (pattern: "^\d+\.\d+\.\d+$")
layout.sections array (minItems: 1)
widgets         array (minItems: 1)
filters         array
defaults.section string
```

**Section shape:**

```
id          string (required)
widget_ids  array of strings (required, minItems: 1)
label       string (optional)
description string (optional)
layout.type enum: "grid" | "stack" | "flex_row"
```

**Widget shape — `preset`/`type`/`data_source` mutual exclusivity:**

`type` and `data_source` are optional in the schema (to allow preset widgets that legitimately omit them). Presence requirements for non-preset widgets are enforced by `validateDefinition`, not by JSON Schema — this avoids brittle `oneOf`/`if-then-else` constructs. The schema validates field types when fields are present; the structural validator enforces business-rule presence constraints.

```
id          string (required)
type        string (optional)
preset      string (optional)
data_source.artifact  string matching \.json$
data_source.field     string
```

**Widget-specific optional blocks** (validated when present):

```
kpi_config        { tone?, footnote?, delta?, sparklineData? }
line_chart_config { data_key?, title?, subtitle? }
columns[]         { field: string, header: string, format?: enum, aggregate?: enum }
totals            boolean
empty_message     string
metric            string
```

**New devDependency:** `ajv` added to `portal/package.json` for use in `dashboard-definition.schema.test.js` only — not included in the production bundle.

---

## New Artifacts

None. This phase introduces no new publisher artifacts and no changes to existing artifact schemas.

---

## Validator Changes

`portal/src/dashboards/validateDefinition.js` — new pure function (portal-layer only, unrelated to publisher validators in `src/publisher/validators/`).

Receives the **raw definition object** (before `resolveWidgets`) and returns `{ valid: boolean, errors: string[] }`.

**Why raw definition:** The validator catches authoring errors in `definition.json` before any runtime processing. Preset resolution is a runtime concern. Preset widgets (entries with a `preset` field and no `type`) are explicitly exempted from the type/data_source presence checks.

**Checks:**

1. `definition.id` is a non-empty string
2. `definition.schema_version` is a non-empty string
3. `definition.layout.sections` is a non-empty array
4. Each section has a string `id` and a non-empty `widget_ids` array
5. Each `widget_id` in every section resolves to an entry in `definition.widgets`
6. No duplicate `widget.id` values within `definition.widgets`
7. Each non-preset widget has a string `type` and `data_source.artifact` ending in `.json`
8. Each `generic_table` widget with `totals: true` has at least one column with a non-`"none"` `aggregate` value

---

## Publisher Changes

None. Publisher is out of scope for this phase.

---

## Portal Changes

### `WidgetRenderer.jsx` — null guard for missing `data_source`

**Current behavior:** `widget.data_source.artifact` throws `TypeError` if `data_source` is absent. Converts to `UnknownWidget` render instead of crash.

```js
if (!widget.data_source) {
  return <UnknownWidget type={`config_error: widget "${widget.id}" has no data_source`} id={widget.id} />;
}
```

### `DashboardRenderer.jsx` — integrate `validateDefinition`

Call `validateDefinition(definition)` at the top of the component body. Since `definition` is a static import, the object reference is stable — this runs effectively once per dashboard mount.

```jsx
const validationResult = validateDefinition(definition);
if (!validationResult.valid) {
  if (import.meta.env.DEV) {
    return (
      <div style={styles.page}>
        <div style={styles.errorBox}>
          <strong>Definition error in "{definition.id}":</strong>
          <ul>{validationResult.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </div>
      </div>
    );
  }
  console.error(`[DashboardRenderer] Invalid definition "${definition.id}":`, validationResult.errors);
  // In production: proceed — render with UnknownWidget fallbacks, no blank screen.
}
```

### Documentation updates

**`docs/guides/widget-library.md`** — add:
- `generic_table` full specification (field table, column shape, format values, aggregate values, example)
- `flex_row` section layout type
- `line_chart_config` optional block reference
- `date_string` formatter in the metric catalog formatter table
- 5 `sent_to_udm` metrics in the metric catalog reference table: `total_ccds_sent`, `earliest_event_ts`, `latest_event_ts`, `regions_active_30d`, `sites_active_30d`
- `generic_table` in "Current types" list

**`docs/guides/add-dashboard.md`** — add:
- `flex_row` to section layout types table
- `generic_table` to "Current types" list
- Checklist item: "All `generic_table` widgets with `totals: true` have at least one column with an `aggregate` field"

---

## Step-by-Step Implementation Plan

### Step 1 — Create `docs/architecture/system-architecture-contract.md`

Establish the persistent architectural anchor. Every future AI session reads this document first.

**Contents:** 10 enumerated rules (R1–R10), pipeline ownership table, boundary violations section, extension points section.

Rules to capture:
- **R1** — Metrics live in SQL only (not in publisher Python, React, propsAdapter, or AI)
- **R2** — Parquet is the analytical storage format
- **R3** — Publisher generates deterministic artifacts (`report_ts` fixed at run start)
- **R4** — JSON artifacts are the delivery contract (schema changes require validators + docs + tests)
- **R5** — Portal is presentation-only (no metric computation, no operational queries)
- **R6** — Dashboard definitions are presentation-layer only (layout, bindings, formatting — not metrics)
- **R7** — Routing state is URL state (`useParams()` only — no context, localStorage, or global store)
- **R8** — `useArtifactPath()` is the only artifact URL builder
- **R9** — Multi-client via configuration, not code forks
- **R10** — Publisher is immutable from portal work

**Affected files:**
- `docs/architecture/system-architecture-contract.md` (new)

**Verification:**
- Document exists at `docs/architecture/system-architecture-contract.md`
- All 10 rules present and traceable to current code or `CLAUDE.md`
- No rule contradicts the current implementation

---

### Step 2 — Update `docs/guides/widget-library.md`

**Affected files:**
- `docs/guides/widget-library.md`

**Verification:**
- `grep "generic_table" docs/guides/widget-library.md` → returns content
- `grep "flex_row" docs/guides/widget-library.md` → returns content
- `grep "date_string" docs/guides/widget-library.md` → returns content (formatter table and column format table)
- `grep "line_chart_config" docs/guides/widget-library.md` → returns content
- `grep "total_ccds_sent" docs/guides/widget-library.md` → returns content

---

### Step 3 — Update `docs/guides/add-dashboard.md`

**Affected files:**
- `docs/guides/add-dashboard.md`

**Verification:**
- `flex_row` appears in the layout types table
- `generic_table` appears in "Current types" list
- Validation checklist includes the `generic_table` + `totals: true` aggregate requirement

---

### Step 4 — Create `dashboard-definition.schema.json` + schema tests

Create the JSON Schema file per the schema design above. Add `"$schema": "../dashboard-definition.schema.json"` to all three existing `definition.json` files.

Create `dashboard-definition.schema.test.js` using `ajv` (devDependency) to validate all three production definitions against the schema as a regression gate.

**Affected files:**
- `portal/src/dashboards/dashboard-definition.schema.json` (new)
- `portal/src/dashboards/dashboard-definition.schema.test.js` (new)
- `portal/src/dashboards/dlq_operations/definition.json`
- `portal/src/dashboards/pipeline_health/definition.json`
- `portal/src/dashboards/sent_to_udm/definition.json`
- `portal/package.json`

**Verification:**
- `npx vitest run` — new schema tests pass
- All three production definitions validate cleanly against the schema
- VSCode shows no schema errors in any `definition.json`

---

### Step 5 — Fix `WidgetRenderer` — guard for missing `data_source`

**Affected files:**
- `portal/src/components/WidgetRenderer.jsx`

**Verification:**
- `npx vitest run` — all existing tests pass
- Manual: add a widget entry with no `data_source` — `UnknownWidget` renders with a clear message

---

### Step 6 — Create `validateDefinition.js` + tests

**Affected files:**
- `portal/src/dashboards/validateDefinition.js` (new)
- `portal/src/dashboards/validateDefinition.test.js` (new)

**Test coverage required:**
- One test per check (8 failure cases)
- A valid minimal definition passes
- All three production `definition.json` files pass (regression gate)
- Preset widget with no `type` passes check 7 correctly
- `generic_table` with `totals: true` and no aggregate columns fails check 8

**Verification:**
- `npx vitest run` — all new tests pass
- All three production definitions pass `validateDefinition`

---

### Step 7 — Integrate `validateDefinition` into `DashboardRenderer`

**Affected files:**
- `portal/src/components/DashboardRenderer.jsx`

**Verification:**
- `npx vitest run` — all tests pass
- Navigate to `/default/local/dlq_operations`, `/default/local/pipeline_health`, `/contexture/prod/sent_to_udm` — no error panels
- Manual: introduce a bad `widget_id` reference — error panel renders in dev mode with specific message

---

### Step 8 — Extend `metricCatalog.test.js`

**Affected files:**
- `portal/src/metricCatalog.test.js`

**New tests:**
1. `formatter: "date_string"` → value sliced to 10 chars, `valueFontSize` is `"1.4rem"`
2. `formatter: "datetime"` → existing behavior preserved
3. `total_ccds_sent` metric → label and footnote resolve correctly
4. `earliest_event_ts` metric → formatter resolves to `"date_string"`, output is 10-char date

**Verification:**
- `npx vitest run` — new tests pass, all 7 existing tests still pass

---

## Verification Steps

End-to-end verification after all 8 steps are complete:

```
# 1. All tests pass
cd portal && npx vitest run
Expected: all N tests pass (130 before this phase → ~160+ after)

# 2. Schema validates all three production definitions
# (covered by Step 4 tests — also manual check:)
cd portal && node -e "
  const Ajv = require('ajv');
  const ajv = new Ajv();
  const schema = require('./src/dashboards/dashboard-definition.schema.json');
  const validate = ajv.compile(schema);
  ['dlq_operations','pipeline_health','sent_to_udm'].forEach(id => {
    const def = require('./src/dashboards/' + id + '/definition.json');
    const valid = validate(def);
    console.log(id + ': ' + (valid ? 'PASS' : 'FAIL') + (valid ? '' : ' ' + JSON.stringify(validate.errors)));
  });
"
Expected: all three print PASS

# 3. All three dashboards render correctly
# Navigate to: http://localhost:5173/default/local/dlq_operations
# Navigate to: http://localhost:5173/default/local/pipeline_health
# Navigate to: http://localhost:5173/contexture/prod/sent_to_udm
Expected: all three render normally, no error panels, no console errors

# 4. Editor schema validation active
# Open portal/src/dashboards/dlq_operations/definition.json in VSCode
Expected: no red underlines or schema warning markers

# 5. Existing publisher pipeline unaffected
publisher run --env local --dashboard dlq_operations
publisher run --env local --dashboard pipeline_health
publisher run --client contexture --env prod --dashboard sent_to_udm
Expected: artifacts generated, no errors, schemas pass
```

---

## Negative Tests

### Negative Test 1 — Orphaned `widget_id` triggers `validateDefinition` error

In `portal/src/dashboards/dlq_operations/definition.json`, temporarily add `"nonexistent_widget"` to the `kpis` section's `widget_ids` array. Start the dev server and navigate to the dashboard.

```
Expected:
- In dev mode: error panel renders with message:
  "Definition error in 'dlq_operations': Section 'kpis' references unknown widget id: nonexistent_widget"
- No blank screen, no crash
- Other dashboards continue to render normally
```

Revert after testing.

---

### Negative Test 2 — `generic_table` with `totals: true` and no aggregate columns fails validation

Create a temporary definition with:
```json
{
  "id": "test_widget",
  "type": "generic_table",
  "totals": true,
  "data_source": { "artifact": "summary.json", "field": "rows" },
  "columns": [
    { "field": "name", "header": "Name" },
    { "field": "count", "header": "Count", "format": "number" }
  ]
}
```

Call `validateDefinition` with this definition in a test.

```
Expected:
- valid: false
- errors includes: "Widget 'test_widget' has totals: true but no column defines an aggregate"
```

This is covered by the test suite in Step 6 — no manual step required.

---

### Negative Test 3 — Definition with invalid `$schema`-constrained field fails schema validation

In the Step 4 schema test file, add a negative test that passes a definition with `schema_version: 123` (number instead of string).

```
Expected:
- ajv.validate() returns false
- errors array contains a type violation for schema_version
```

This is covered by `dashboard-definition.schema.test.js` — no manual step required.

---

### Negative Test 4 — Widget with no `data_source` renders `UnknownWidget` instead of crashing

Temporarily add to any definition a widget entry:
```json
{ "id": "broken_widget", "type": "kpi_card" }
```
(No `data_source` field.)

Navigate to the dashboard.

```
Expected:
- An UnknownWidget warning block renders at the widget's position
- Message: "config_error: widget 'broken_widget' has no data_source"
- All other widgets on the dashboard render normally
- No JavaScript console TypeError
```

Revert after testing.

---

## Risk Analysis

| Risk | Likelihood | Mitigation |
|---|---|---|
| Schema rejects a valid production definition | Low | Step 4 Vitest tests validate all three definitions before schema is committed |
| `validateDefinition` reports false positives | Low | Step 6 tests include all three production definitions as explicit pass cases |
| `DashboardRenderer` change blanks a production dashboard | Negligible | Production path logs and proceeds; dev mode only shows error panel; Step 7 verifies all three dashboards render |
| `WidgetRenderer` null guard breaks valid widgets | None | Guard fires only on missing `data_source` — existing 130 tests cover all valid paths |
| Documentation diverges from code | Low | `$schema` references in definition files create continuous editor-visible feedback |
| `data_table`/`exceptions_table` hardcoded schemas | Known, deferred | Both constrained to `{ site, failures }` and `{ failure_type, count }` respectively. Migration to `generic_table` column config is a Phase 3 candidate. |
| `ajv` devDependency supply chain risk | Very low | `ajv` is standard, widely-audited; devDependency only — excluded from production bundle |

---

## Handoff

Plan saved to:
```
docs/plans/phase2_platform_hardening_plan.md
```

Next step: external review

Use this review prompt:

```
Follow:

skills/workflow/review-plan.md

Review the artifact:

docs/plans/phase2_platform_hardening_plan.md

Produce the review artifact:

docs/reviews/phase2_platform_hardening_review.md

Do not implement code yet.
```
