# Step 3 Plan: `sent_to_udm` — Portal UI Completion, Tests, and Documentation

**Status:** Awaiting approval before implementation begins.
**Date:** 2026-03-17
**Prerequisite:** Step 2 complete and verified.

---

## Context: What Step 2 Already Built

Step 2 created and registered `SentToUdm.jsx` with five working sections. These sections must
remain unchanged except where this plan explicitly calls for refinement:

| Section | Status | Notes |
|---|---|---|
| HealthBanner | ✓ Complete | No changes needed |
| KPI Row | Partial — refine | Dates currently footnotes; original spec wants them as KPI cards |
| Region Summary Table | Partial — refine | Missing Grand Total row; column labels differ from spec |
| 30-Day Trend Chart | Partial — constraint conflict | Aggregate only; stacked-by-region requires new artifact (see Section D) |
| Lifetime Detail Table | Partial — refine | Labels differ from spec; see Section D |
| Recent 30-Day Detail Table | ✗ Not implemented | `recent_detail_30d.json` fetched but never rendered |

Dashboard registration in `portal/src/dashboards/index.js` is complete. Do not change it.

---

## Architecture Guardrails (Mandatory)

These rules apply to every change in Step 3:

- Do not modify publisher logic, SQL blocks, artifact schemas, or fixture generation
- Do not edit `main.py`, `athena_views.sql`, `dashboard.json`, any validator file, or `generate_fixtures.py`
- React must not compute metrics — all values come from artifacts as-is
- All artifact path construction must go through `useDashboardArtifacts` (which internally calls `useArtifactPath`) — no manual URL construction
- Do not change `DEFAULT_CLIENT`, `DEFAULT_ENV`, redirect logic, or existing dashboard components
- `dlq_operations` and `pipeline_health` must remain completely unaffected

---

## Affected Files

### Modified
| File | Change |
|---|---|
| `portal/src/dashboards/sent_to_udm/SentToUdm.jsx` | Refine KPI row, refine Region Summary, refine Lifetime Detail labels, add Recent 30-Day table |
| `docs/json-contracts.md` | Add `sent_to_udm` artifact section |

### New
| File | Purpose |
|---|---|
| `src/publisher/tests/__init__.py` | Makes `tests/` a Python package |
| `src/publisher/tests/test_sent_to_udm_summary_schema.py` | Validator tests |
| `src/publisher/tests/test_sent_to_udm_region_summary_schema.py` | Validator tests |
| `src/publisher/tests/test_sent_to_udm_trend_30d_schema.py` | Validator tests |
| `src/publisher/tests/test_sent_to_udm_lifetime_detail_schema.py` | Validator tests |
| `src/publisher/tests/test_sent_to_udm_recent_detail_30d_schema.py` | Validator tests |

### Unchanged (explicitly)
- `portal/src/dashboards/index.js` — registration already complete
- All publisher files, SQL, validators, fixture generator
- `DlqOperations.jsx`, `PipelineHealth.jsx`, and all shared components
- `portal/src/App.jsx` — routing defaults unchanged

---

## A. Portal UI Refinements and Completions

### Step 2 component review

The current `SentToUdm.jsx` loads all 5 artifacts but never destructures or renders
`recent_detail_30d.json`. The other four sections are rendered but need label and layout
refinements to match the original specification.

---

### Section 1 — Header

**Status:** HealthBanner is already rendering `status`, `generated_at`, `report_ts`, and `schema_version`. This satisfies the original spec requirement for a refreshed timestamp and client/env context (both come from URL params via `useParams()`).

**No change needed.**

---

### Section 2 — KPI Row

**Current state:** 5 cards — Regions Active (All Time), Sites Active (All Time), Total CCDs Sent, Regions Active (30d), Sites Active (30d). The earliest and latest event timestamps are currently shown as `footnote` text on the Regions Active card.

**Original spec:** Total CCDs Sent · First CCD Sent · Most Recent CCD Sent · Regions Active · Sites Active (Last 30 Days)

**Required change:** Promote `earliest_event_ts` and `latest_event_ts` to dedicated KPI cards. Revise the row to match the original spec order. Remove the "Regions Active (All Time)" / "Sites Active (All Time)" split — consolidate to 5 cards matching the spec.

**Revised KPI row (left to right):**

| Card | Label | Source field | `valueFontSize` |
|---|---|---|---|
| 1 | Total CCDs Sent | `summary.total_ccds_sent` | default |
| 2 | First CCD Sent | `summary.earliest_event_ts` (date portion only, `slice(0,10)`) | `"1.4rem"` |
| 3 | Most Recent CCD Sent | `summary.latest_event_ts` (date portion only) | `"1.4rem"` |
| 4 | Regions Active | `summary.regions_active_30d` with footnote "Last 30 days" | default |
| 5 | Sites Active | `summary.sites_active_30d` with footnote "Last 30 days" | default |

The `valueFontSize` override on cards 2 and 3 prevents the full timestamp string from overflowing the card. Using only the date portion (`slice(0,10)`) matches the "First CCD Sent" display intent and avoids the timezone-offset string rendering issue from DuckDB.

---

### Section 3 — Region Summary Table

**Current state:** Columns are Region, Sites, CCDs Sent, First Seen, Last Seen. No Grand Total row.

**Original spec:** Region · CCDs Sent · First CCD Sent · Most Recent CCD Sent · Grand Total row.

**Required changes:**
1. Drop the "Sites" column — not in the original spec
2. Relabel "First Seen" → "First CCD Sent", "Last Seen" → "Most Recent CCD Sent"
3. Add a Grand Total row below the region rows. Computed inline in the component from `regionSummary.regions`:
   - Total CCDs: `regions.reduce((sum, r) => sum + r.ccd_count, 0)`
   - First CCD: `min(regions.map(r => r.first_seen))` — use the earliest string from the array (ISO strings sort lexicographically in YYYY-MM-DD order, making string min safe)
   - Most Recent: `max(regions.map(r => r.last_seen))`

The Grand Total row is a computed presentation aggregate, not a metric — it does not introduce new business logic. It is derived entirely from artifact data already present in the component.

Style the Grand Total row distinctly: bold text, slightly heavier top border, `theme.background` background to visually separate it from the data rows.

---

### Section 4 — 30-Day Trend Chart

**Current state:** Aggregate `AreaChart` — total CCDs per day across all regions.

**Original spec:** "Stacked chart: X axis: process_date, Y axis: CCD count, Stack: region"

**Constraint conflict — deferred:** A stacked regional chart requires per-region daily counts:
```json
{ "date": "2026-02-16", "AZ": 2, "CO": 1, "WS": 3, "UNKNOWN": 0 }
```
The current `trend_30d.json` only provides aggregate daily totals `{ date, ccd_count }`. Adding regional breakdown requires a new artifact (e.g., `trend_30d_by_region.json`) and a new SQL block — both are backend changes prohibited in Step 3.

**Resolution for Step 3:** Keep the existing aggregate `AreaChart`. Update the section title to:
> "CCDs Sent To UDM by Region (Last 30 Days)"

Add a muted subtitle noting "Regional breakdown coming in a future release" to acknowledge the gap without blocking Step 3. The chart already correctly answers "how many CCDs were sent per day over 30 days" — the regional stack is an enhancement, not a correctness issue.

**Future step (Step 4 or later):** Add `sent_to_udm_trend_30d_by_region` SQL block + `trend_30d_by_region.json` artifact + replace the chart with a `BarChart` or `AreaChart` with stacked series.

---

### Section 5 — Lifetime Detail Table

**Current state:** Columns are Region · Site · CCDs Sent · First Seen · Last Seen.

**Original spec:** Region · Parent OID · Facility · CCDs Sent · First CCD · Most Recent CCD

**Column name mapping — POC constraint:** The artifact contains `region` and `site`. "Parent OID" and "Facility" are production field names from the Excel source that do not exist in the POC data model. The fixture data uses `site` as a placeholder for what production would call "Facility." "Parent OID" likely maps to `region` (the organizational grouping level above site).

**Required changes — labels only, no data change:**
- "Region" → keep as "Region" (maps to `region`)
- Drop the implicit "Parent OID" column — in this POC, region IS the parent grouping; a separate column would duplicate it
- "Site" → relabel to "Facility" (maps to `site`)
- "First Seen" → relabel to "First CCD"
- "Last Seen" → relabel to "Most Recent CCD"

No new fields, no computations. The data is identical — only the column header labels change.

Note in a component comment that `site` = Facility in the POC. When the production ETL adds a `facility_name` field to the artifact, the column can be updated to reference it.

---

### Section 6 — Recent 30-Day Detail Table

**Status:** Not implemented. `recent_detail_30d.json` is fetched but never destructured or rendered.

**Artifact shape (confirmed from live artifact):**
```json
{
  "window_days": 30,
  "rows": [
    { "region": "AZ", "site": "az_site_1", "ccd_count": 21,
      "first_seen_30d": "2026-02-15 18:20:23-05:00",
      "last_seen_30d":  "2026-03-05 08:51:02-05:00" }
  ]
}
```

**Original spec columns:** Process Date · Region · Parent OID · Facility · CCDs Sent

**Constraint note on "Process Date":** The `recent_detail_30d` artifact groups by `(region, site)` over the 30-day window — there is no single "process_date" per row. The closest available fields are `first_seen_30d` and `last_seen_30d` (the date range of activity for that region/site). "Process Date" from the Excel report likely referred to an individual-row date at a lower granularity than what this artifact provides.

**Resolution:** Render the available data. Use both date boundary fields to communicate the activity window. Section title: "Site Activity — Last 30 Days".

**Columns:**

| Header | Source field | Notes |
|---|---|---|
| Region | `row.region` | |
| Facility | `row.site` | Same "Facility" label as Section 5 for consistency |
| CCDs Sent | `row.ccd_count` | `toLocaleString()` |
| First Sent (30d) | `row.first_seen_30d` | `fmtTs()` |
| Last Sent (30d) | `row.last_seen_30d` | `fmtTs()` |

**Empty state:** If `recent.rows.length === 0`, render a muted message: "No sites active in the last 30 days." Do not render an empty table body.

**Implementation note:** Add `const recent = artifacts["recent_detail_30d.json"];` to the destructure block alongside `manifest`, `summary`, `regionSummary`, `trend30d`, and `lifetime`.

---

## B. Publisher Validator Tests

### Current state
No Python test files exist anywhere in the repository. The portal has 114 Vitest tests. No Python test runner (`pytest`) is confirmed installed.

### Test runner
Use Python's built-in `unittest` — no external dependency, works with `python -m unittest discover`. `unittest`-style tests are fully `pytest`-compatible if a test runner is added later.

### Test pattern per validator (4 test methods each, 20 tests total)

1. **Valid payload passes** — construct a minimal valid dict, call `validate()`, assert no exception.
2. **Missing required field fails** — remove one required field, assert `jsonschema.ValidationError`.
3. **Wrong type fails** — set an integer field to a string, assert `jsonschema.ValidationError`.
4. **Extra field fails** — add an unknown key, assert `jsonschema.ValidationError` (`additionalProperties: False` must hold).

### Minimal valid payload per validator

**`sent_to_udm_summary_schema`**
```python
{
    "schema_version": "1.2.0", "generated_at": "2026-03-17T18:00:00+00:00",
    "report_ts": "2026-03-17T18:00:00Z",
    "total_regions_active": 4, "total_sites_active": 6, "total_ccds_sent": 300,
    "earliest_event_ts": "2026-01-06 23:59:14-05:00",
    "latest_event_ts": "2026-03-07 01:07:46-05:00",
    "regions_active_30d": 4, "sites_active_30d": 6,
}
```

**`sent_to_udm_region_summary_schema`**
```python
{
    "schema_version": "1.2.0", "generated_at": "2026-03-17T18:00:00+00:00",
    "report_ts": "2026-03-17T18:00:00Z",
    "regions": [{"region": "AZ", "site_count": 2, "ccd_count": 87,
                 "first_seen": "2026-01-06 23:59:14-05:00",
                 "last_seen": "2026-03-07 01:07:46-05:00"}],
}
```

**`sent_to_udm_trend_30d_schema`**
```python
{
    "schema_version": "1.2.0", "generated_at": "2026-03-17T18:00:00+00:00",
    "report_ts": "2026-03-17T18:00:00Z",
    "days": [{"date": "2026-02-16", "ccd_count": 4}],
}
```

**`sent_to_udm_lifetime_detail_schema`**
```python
{
    "schema_version": "1.2.0", "generated_at": "2026-03-17T18:00:00+00:00",
    "report_ts": "2026-03-17T18:00:00Z",
    "rows": [{"region": "AZ", "site": "az_site_1", "ccd_count": 87,
              "first_seen": "2026-01-06 23:59:14-05:00",
              "last_seen": "2026-03-07 01:07:46-05:00"}],
}
```

**`sent_to_udm_recent_detail_30d_schema`**
```python
{
    "schema_version": "1.2.0", "generated_at": "2026-03-17T18:00:00+00:00",
    "report_ts": "2026-03-17T18:00:00Z",
    "window_days": 30,
    "rows": [{"region": "AZ", "site": "az_site_1", "ccd_count": 21,
              "first_seen_30d": "2026-02-15 18:20:23-05:00",
              "last_seen_30d": "2026-03-05 08:51:02-05:00"}],
}
```

### Import path
Test files live under `src/publisher/tests/`. Use the same `sys.path` pattern as `main.py`:
```python
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from validators import sent_to_udm_summary_schema
```

### Run command
```
python -m unittest discover -s src/publisher/tests -p "test_*.py"
```

---

## C. Documentation — `docs/json-contracts.md`

Append a `sent_to_udm` section following the existing format for `dlq_operations` and `pipeline_health`. Cover all 5 artifacts.

**Required call-outs in the section:**
- `trend_30d.json` uses `ccd_count` — not `failures`. Same filename as the DLQ artifact; schemas are not interchangeable. Each is scoped to its dashboard directory.
- `summary.json` fields `earliest_event_ts` / `latest_event_ts` are data-derived (`MIN/MAX(timestamp)`) not `report_ts`-relative.
- `recent_detail_30d.json` uses `first_seen_30d` / `last_seen_30d` — note the `_30d` suffix to distinguish from `lifetime_detail.json`'s `first_seen` / `last_seen`.

---

## D. Constraint Conflicts — Explicit Record

These items from the original Step 3 prompt cannot be implemented in this step without violating the architecture or the Step 3 scope constraint ("do not modify backend logic").

| Original spec requirement | Constraint | Resolution |
|---|---|---|
| Trend chart stacked by region | `trend_30d.json` has only aggregate daily counts; per-region daily breakdown requires a new SQL block + artifact | Render aggregate chart; add subtitle noting regional stack is a future enhancement |
| "Parent OID" column | Not in artifact data model; POC uses `region` as the organizational grouping | Use `region` as the grouping column; add code comment mapping to production field name |
| "Facility" column | Not in artifact data model; POC uses `site` as a placeholder | Relabel "Site" → "Facility" in column headers; same data |
| "Process Date" column in recent_detail_30d | No per-row single date; artifact groups by (region, site) with date range | Render `first_seen_30d` / `last_seen_30d` as "First Sent (30d)" / "Last Sent (30d)" |

None of these require artifact changes — they are label decisions and acknowledged scope boundaries. The regional stacking is the only item that requires a future backend extension.

---

## E. Risk Review

**Risk 1 — Grand Total row computed in React**
The Grand Total row for the Region Summary table is computed from `regionSummary.regions` in the component — three `reduce`/`min`/`max` operations over the artifact data. This does not violate the "no metric logic in React" rule: totals and date-range bounds derived from already-computed per-region aggregates are presentation arithmetic, not metric definitions. The underlying `ccd_count`, `first_seen`, `last_seen` values all come from the artifact unchanged.

**Risk 2 — `first_seen_30d` / `last_seen_30d` field name confusion**
The recent_detail_30d table uses `first_seen_30d` / `last_seen_30d`. A copy-paste from the lifetime table using `first_seen` / `last_seen` renders `undefined` → `"—"` silently. No error, no warning. The test is visual: all date cells should show dates, not dashes.

**Risk 3 — `recent.rows` empty array**
If no sites were active in the window, `recent.rows` is an empty array. An unguarded `.map()` renders a valid but empty `<tbody>`. Render a muted no-data message instead.

**Risk 4 — KPI card overflow on date string**
`earliest_event_ts` and `latest_event_ts` from DuckDB are strings like `"2026-01-06 23:59:14-05:00"`. Even with `slice(0,10)` this is `"2026-01-06"` — 10 characters, safe at any KpiCard width. If the raw string (without slice) is used, the 25-character timezone-offset string overflows the card. The `slice(0,10)` call is mandatory on both date KPI cards.

**Risk 5 — Python test `sys.path` resolution**
Running tests from the repo root with `python -m unittest discover -s src/publisher/tests` requires the test files to insert `src/publisher/` onto `sys.path`. Without this, `from validators import ...` raises `ModuleNotFoundError`. The `sys.path.insert` must be at the top of every test file before any `from validators` import.

**Risk 6 — `additionalProperties: False` regression**
All 5 schemas use `additionalProperties: False`. Test case 4 (extra field) in each test file guards this. Do not omit it.

---

## F. Verification Steps

1. Run `python -m unittest discover -s src/publisher/tests -p "test_*.py"` — confirm 20 tests pass.
2. Run `npx vitest run` from `portal/` — confirm all 114 existing tests still pass.
3. `npm run build` in `portal/` — confirm clean build, zero errors.
4. Start Vite dev server. Navigate to `/contexture/prod/sent_to_udm`:
   - HealthBanner renders with SUCCESS status
   - KPI row shows 5 cards: Total CCDs Sent, First CCD Sent, Most Recent CCD Sent, Regions Active, Sites Active
   - Region Summary shows 4 region rows + bold Grand Total row
   - Trend chart renders with title "CCDs Sent To UDM by Region (Last 30 Days)" and aggregate data
   - Lifetime Detail shows Region / Facility / CCDs Sent / First CCD / Most Recent CCD columns
   - Recent 30-Day Detail shows Region / Facility / CCDs Sent / First Sent (30d) / Last Sent (30d)
5. Navigate to `/default/local/sent_to_udm` — confirm `ScopeEmptyState` renders (no regression).
6. Navigate to `/default/local/dlq_operations` and `/default/local/pipeline_health` — confirm both unaffected.
7. Inspect `docs/json-contracts.md` — confirm `sent_to_udm` section is present.

---

## G. Implementation Order

1. Update `SentToUdm.jsx` — in this order within the file:
   - Destructure `recent` from `artifacts["recent_detail_30d.json"]`
   - Revise KPI row (5 cards per spec)
   - Revise Region Summary columns + add Grand Total row
   - Update trend chart title + add subtitle note
   - Relabel Lifetime Detail columns (Facility, First CCD, Most Recent CCD)
   - Add Recent 30-Day Detail table section
2. Create `src/publisher/tests/__init__.py`
3. Create 5 test files in `src/publisher/tests/`
4. Run `python -m unittest discover` — confirm 20 tests pass
5. Update `docs/json-contracts.md`
6. Final: portal build + vitest run + manual browser verification
