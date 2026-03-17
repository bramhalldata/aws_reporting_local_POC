# Step 3 Plan: `sent_to_udm` — Polish, Tests, and Documentation

**Status:** Awaiting approval before implementation begins.
**Date:** 2026-03-17
**Prerequisite:** Step 2 complete and verified.

---

## Scope

Step 3 closes out three items deferred from Step 2:

1. **Portal** — render the `recent_detail_30d` table in `SentToUdm.jsx`
2. **Tests** — publisher validator tests for the 5 new `sent_to_udm` schema validators
3. **Docs** — add `sent_to_udm` artifact contracts to `docs/json-contracts.md`

This step is strictly additive. No existing files change except `SentToUdm.jsx`, `json-contracts.md`, and the addition of new test files.

---

## Affected Files

### Modified
| File | Change |
|---|---|
| `portal/src/dashboards/sent_to_udm/SentToUdm.jsx` | Add `recent_detail_30d` table section |
| `docs/json-contracts.md` | Add `sent_to_udm` artifact section |

### New
| File | Purpose |
|---|---|
| `src/publisher/tests/__init__.py` | Makes `tests/` a Python package |
| `src/publisher/tests/test_sent_to_udm_summary_schema.py` | Tests for `sent_to_udm_summary_schema` |
| `src/publisher/tests/test_sent_to_udm_region_summary_schema.py` | Tests for `sent_to_udm_region_summary_schema` |
| `src/publisher/tests/test_sent_to_udm_trend_30d_schema.py` | Tests for `sent_to_udm_trend_30d_schema` |
| `src/publisher/tests/test_sent_to_udm_lifetime_detail_schema.py` | Tests for `sent_to_udm_lifetime_detail_schema` |
| `src/publisher/tests/test_sent_to_udm_recent_detail_30d_schema.py` | Tests for `sent_to_udm_recent_detail_30d_schema` |

### Unchanged (explicitly)
- All existing dashboard components (`DlqOperations`, `PipelineHealth`)
- All existing schema validators and their tests (none exist — do not add retroactively)
- `src/publisher/main.py` — no changes
- `sql/athena_views.sql` — no changes
- `dashboards/sent_to_udm/dashboard.json` — no changes
- `portal/src/dashboards/index.js` — no changes
- `docs/architecture/artifact-layout.md` — the new dashboard follows the existing layout pattern exactly; no structural change to document
- `docs/architecture/portal-routing.md` — no routing changes were made

---

## A. Portal — `recent_detail_30d` Table

### Gap
`recent_detail_30d.json` is declared in `ARTIFACT_NAMES` and fetched by `useDashboardArtifacts`, but is never destructured or rendered in the component. The artifact loads silently and is discarded.

### Change
Add one destructure line and one table section to `SentToUdm.jsx` — after the existing "Site Detail — All Time" section.

### Data shape (from live artifact)
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

Field names `first_seen_30d` and `last_seen_30d` differ from the lifetime table (`first_seen`, `last_seen`). The existing `fmtTs()` helper handles both — no change needed there.

The section title should reference the `window_days` value from the artifact (`recent.window_days`) rather than hardcoding "30" — defensive against any future window change.

### Table columns
`Region` / `Site` / `CCDs Sent (30d)` / `First Seen (30d)` / `Last Seen (30d)`

### Risk
The `recent_detail_30d` rows array may be empty if no sites were active in the 30-day window. The component must guard against this with the same empty-state pattern used by the trend chart (a `textMuted` message, not an error).

---

## B. Publisher Validator Tests

### Current state
There are no Python test files anywhere in the repository. The portal has 8 Vitest test files (114 tests). No Python test runner (`pytest`) is confirmed installed.

### Test runner decision
Use Python's built-in `unittest` module — no external dependency required, consistent with the repo's zero-configuration Python setup. Each test file is independently runnable with `python -m unittest` and discoverable with `python -m unittest discover`.

If `pytest` is added to the project later, `unittest`-style tests are fully pytest-compatible with no changes.

### Test pattern per validator
Each test file covers three cases:

1. **Valid payload passes** — construct a minimal valid artifact dict, call `validate()`, assert no exception is raised.
2. **Missing required field fails** — remove one required field, assert `jsonschema.ValidationError` is raised.
3. **Wrong type fails** — set an integer field to a string, assert `jsonschema.ValidationError` is raised.
4. **Extra field fails** — add an unknown key (all schemas use `additionalProperties: False`), assert `jsonschema.ValidationError` is raised.

This gives 4 test methods per file × 5 files = 20 new tests.

### Minimal valid payloads per validator

**`test_sent_to_udm_summary_schema.py`** — valid payload:
```python
{
    "schema_version":       "1.2.0",
    "generated_at":         "2026-03-17T18:00:00+00:00",
    "report_ts":            "2026-03-17T18:00:00Z",
    "total_regions_active": 4,
    "total_sites_active":   6,
    "total_ccds_sent":      300,
    "earliest_event_ts":    "2026-01-06 23:59:14-05:00",
    "latest_event_ts":      "2026-03-07 01:07:46-05:00",
    "regions_active_30d":   4,
    "sites_active_30d":     6,
}
```

**`test_sent_to_udm_region_summary_schema.py`** — valid payload:
```python
{
    "schema_version": "1.2.0",
    "generated_at":   "2026-03-17T18:00:00+00:00",
    "report_ts":      "2026-03-17T18:00:00Z",
    "regions": [
        {"region": "AZ", "site_count": 2, "ccd_count": 87,
         "first_seen": "2026-01-06 23:59:14-05:00",
         "last_seen":  "2026-03-07 01:07:46-05:00"},
    ],
}
```

**`test_sent_to_udm_trend_30d_schema.py`** — valid payload:
```python
{
    "schema_version": "1.2.0",
    "generated_at":   "2026-03-17T18:00:00+00:00",
    "report_ts":      "2026-03-17T18:00:00Z",
    "days": [
        {"date": "2026-02-16", "ccd_count": 4},
    ],
}
```

**`test_sent_to_udm_lifetime_detail_schema.py`** — valid payload:
```python
{
    "schema_version": "1.2.0",
    "generated_at":   "2026-03-17T18:00:00+00:00",
    "report_ts":      "2026-03-17T18:00:00Z",
    "rows": [
        {"region": "AZ", "site": "az_site_1", "ccd_count": 87,
         "first_seen": "2026-01-06 23:59:14-05:00",
         "last_seen":  "2026-03-07 01:07:46-05:00"},
    ],
}
```

**`test_sent_to_udm_recent_detail_30d_schema.py`** — valid payload:
```python
{
    "schema_version": "1.2.0",
    "generated_at":   "2026-03-17T18:00:00+00:00",
    "report_ts":      "2026-03-17T18:00:00Z",
    "window_days":    30,
    "rows": [
        {"region": "AZ", "site": "az_site_1", "ccd_count": 21,
         "first_seen_30d": "2026-02-15 18:20:23-05:00",
         "last_seen_30d":  "2026-03-05 08:51:02-05:00"},
    ],
}
```

### Import path
Test files live under `src/publisher/tests/`. They import validators using the same pattern as `main.py`:
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

### Change
Append a `sent_to_udm` section following the exact format used for `dlq_operations` and `pipeline_health`. Cover all 5 artifact files.

### Key notes to include
- `trend_30d.json` uses `ccd_count` (not `failures`) — call this out explicitly to prevent confusion with the DLQ trend artifact of the same filename
- `summary.json` `earliest_event_ts` / `latest_event_ts` are data-derived (`MIN/MAX(timestamp)`) — not `report_ts`-relative
- `recent_detail_30d.json` uses `first_seen_30d` / `last_seen_30d` — note the `_30d` suffix distinction from the lifetime artifact's `first_seen` / `last_seen`

---

## D. Risk Review

**Risk 1 — `recent_detail_30d` empty rows**
If no sites were active in the 30-day window, `recent.rows` is an empty array. The table must render a graceful empty state (muted message) rather than an empty `<tbody>`. A missing check renders a valid but visually broken table with headers and no rows.

**Risk 2 — `fmtTs()` and the `_30d` field suffix**
The existing `fmtTs()` helper works on any string. The 30d row fields are named `first_seen_30d` / `last_seen_30d` — not `first_seen` / `last_seen`. The table implementation must use the correct field names. A copy-paste from the lifetime table using the wrong keys produces `undefined` values rendered as `"—"` silently.

**Risk 3 — Test import path resolution**
`src/publisher/validators/` is not on `sys.path` by default. The test files must insert the parent directory (`src/publisher/`) onto `sys.path` before importing — the same technique used in `main.py`'s `_publisher_dir` block. A missing `sys.path` insert produces `ModuleNotFoundError` silently when tests are run from the repo root.

**Risk 4 — `additionalProperties: False` coverage in tests**
All 5 schemas use `additionalProperties: False`. This is the most likely schema configuration to be accidentally removed during a future edit. The extra-field test case specifically guards this. Do not skip it.

**Risk 5 — Docs: `trend_30d.json` name collision confusion**
Both `dlq_operations` and `sent_to_udm` have a `trend_30d.json` artifact. They share only the filename — the schemas are different (`failures` vs `ccd_count`). The `json-contracts.md` entry must clearly scope each to its dashboard and call out the field name difference to prevent a future developer from assuming the schemas are interchangeable.

---

## E. Verification Steps

After implementation:

1. Start Vite dev server. Navigate to `/contexture/prod/sent_to_udm` — confirm the `recent_detail_30d` table renders below the lifetime table with correct data.
2. Confirm the 30d table header reads "Site Detail — Last 30 Days (30d)" (or similar using `window_days`).
3. Navigate to `/default/local/sent_to_udm` — confirm `ScopeEmptyState` still renders (no regression from the JSX change).
4. Run `python -m unittest discover -s src/publisher/tests -p "test_*.py"` — confirm 20 tests pass.
5. Run `npx vitest run` from `portal/` — confirm all 114 existing tests still pass.
6. Visually inspect `docs/json-contracts.md` — confirm `sent_to_udm` section is present and accurate.
7. Run portal build — confirm clean build with no new errors.

---

## F. Step 3 Implementation Order

1. Add `recent_detail_30d` table to `SentToUdm.jsx` — smallest change, immediately testable in the browser.
2. Create `src/publisher/tests/__init__.py`.
3. Create 5 test files under `src/publisher/tests/`.
4. Run `python -m unittest discover` — confirm 20 tests pass.
5. Update `docs/json-contracts.md` with `sent_to_udm` section.
6. Final verification: portal build + vitest + manual browser check.
