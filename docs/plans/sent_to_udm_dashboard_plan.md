# Implementation Plan: `sent_to_udm` Dashboard

**Status:** Awaiting approval before implementation begins.
**Date:** 2026-03-17
**Dashboard ID:** `sent_to_udm`
**Target route:** `/contexture/prod/sent_to_udm`
**Artifact scope:** `artifacts/contexture/prod/current/sent_to_udm/`

---

## Business Intent

Portal-native replacement for the Excel-based "CCD Files Sent To UDM" report.

Answers two questions:
1. Since processing began, which regions and sites have sent CCDs to the UDM, and over what time period?
2. Over the last 30 days, which regions and sites have been actively sending CCDs?

Expected layout: header / HealthBanner → KPI row → region summary table → 30-day trend chart → lifetime detail table → 30-day detail table.

---

## Affected Files

### New files
| File | Purpose |
|---|---|
| `dashboards/sent_to_udm/dashboard.json` | Publisher config: declares SQL blocks and artifact list |
| `src/publisher/validators/sent_to_udm_summary_schema.py` | Schema validator for `summary.json` |
| `src/publisher/validators/sent_to_udm_region_summary_schema.py` | Schema validator for `region_summary.json` |
| `src/publisher/validators/sent_to_udm_trend_30d_schema.py` | Schema validator for `trend_30d.json` |
| `src/publisher/validators/sent_to_udm_lifetime_detail_schema.py` | Schema validator for `lifetime_detail.json` |
| `src/publisher/validators/sent_to_udm_recent_detail_30d_schema.py` | Schema validator for `recent_detail_30d.json` |
| `portal/src/dashboards/sent_to_udm/SentToUdm.jsx` | Bespoke portal dashboard component |

### Modified files (additive only)
| File | Change |
|---|---|
| `data/generate_fixtures.py` | Add second Parquet generator for `ccd_sent_to_udm.parquet` |
| `sql/athena_views.sql` | Append 5 new named SQL blocks |
| `src/publisher/main.py` | Add 5 validator imports; add `elif dashboard == "sent_to_udm":` branch |
| `portal/src/dashboards/index.js` | Append `sent_to_udm` entry to `dashboardRegistry` |

### Unchanged files (explicitly)
- `src/publisher/main.py` — `run()` function structure, `bootstrap()`, `discover_dashboards()`, `_rebuild_run_history()`, `_rebuild_platform_manifest()`, `__main__` block, `dlq_operations` if-branch, `pipeline_health` elif-branch
- `portal/src/App.jsx` — `DEFAULT_CLIENT`, `DEFAULT_ENV`, all redirects, routing structure
- `portal/src/dashboards/index.js` — existing two entries and their order
- All existing widget components (`TrendChart`, `TopSitesTable`, `ExceptionsTable`, `KpiCard`)
- All existing schema validators
- All existing SQL blocks

---

## A. Current Architecture Summary

The platform is a five-layer pipeline:

1. **Fixture generator** (`data/generate_fixtures.py`) — stands in for ETL. Writes deterministic Parquet to `data/parquet/`.
2. **Publisher** (`src/publisher/main.py`) — reads Parquet via DuckDB using SQL from `sql/athena_views.sql`, assembles and validates JSON artifacts, writes to `artifacts/{client}/{env}/runs/{run_id}/{dashboard}/`, copies to `artifacts/{client}/{env}/current/{dashboard}/`, then rebuilds `run_history.json` and `platform-manifest.json`. Dashboard dispatch is **case-based** (`if/elif`) inside `run()`. Dashboard discovery for `bootstrap()` is registry-driven via `dashboards/<id>/dashboard.json`.
3. **Artifacts** — JSON files under `artifacts/`. Vite serves `artifacts/` as its `publicDir`, so artifact paths resolve as `/{client}/{env}/current/{dashboard}/{filename}`.
4. **Portal** (`portal/`) — React SPA. Routes are `/:client/:env/<dashboardId>`. `dashboardRegistry` is a plain array in `dashboards/index.js`; first entry is the default landing page. `DashboardRenderer` is a config-driven rendering engine. `useDashboardArtifacts` fetches and validates artifacts. `useArtifactPath` constructs fetch URLs. `ScopeEmptyState` handles missing scopes gracefully.
5. **Plugin system** — `portal/src/plugins/index.js` is empty but ready. `registerPlugin()` can contribute dashboards, widget types, metrics, and presets without touching platform files.

---

## B. Safe Insertion Points

| Concern | Safe insertion point |
|---|---|
| Dashboard registration (portal) | Append one entry to `dashboardRegistry` array in `portal/src/dashboards/index.js` |
| Publisher dispatch | Add `elif dashboard == "sent_to_udm":` after the `pipeline_health` elif at `main.py:481`, before the `else` error block |
| SQL blocks | Append new named blocks to the end of `sql/athena_views.sql`, after the last existing `-- [end]` |
| Dashboard config | Create `dashboards/sent_to_udm/dashboard.json` |
| Artifact schemas | Create new validator files in `src/publisher/validators/`; add to top-level import block in `main.py` |
| Portal UI | Create `portal/src/dashboards/sent_to_udm/SentToUdm.jsx` as a bespoke component |
| Fixture data | Add a second generator function in `data/generate_fixtures.py` writing `ccd_sent_to_udm.parquet` |

---

## C. Risk Review

**Risk 1 — Breaking publisher dispatch for existing dashboards**
The `if/elif` chain in `run()` must not be restructured. The new `elif dashboard == "sent_to_udm":` block must be appended after `pipeline_health` and before the `else` error block. Do not refactor the chain into a dispatch map or registry — that is a structural change with no required benefit here.

**Risk 2 — Shared Parquet validation blocking `sent_to_udm`**
`run()` validates `PARQUET_PATH` (hardcoded to `ccd_failures.parquet`) at step 2, before the if/elif. If `ccd_failures.parquet` does not exist, `sent_to_udm` will fail even though it uses a different Parquet file. Mitigation: always run `generate_fixtures.py` before the publisher — it generates both Parquet files. This is the existing convention and requires no code change. Note it in developer runbook.

**Risk 3 — Shared DuckDB table registration**
The `ccd_failures` table is registered in DuckDB before the if/elif and will be present during the `sent_to_udm` branch. This is harmless — `sent_to_udm` SQL blocks reference only `ccd_sent_to_udm`. Do not move table registration into the if/elif branches.

**Risk 4 — NavBar showing `sent_to_udm` on `default/local`**
Adding `sent_to_udm` to `dashboardRegistry` makes the tab appear globally. On `default/local`, no artifacts exist for this dashboard. `useDashboardArtifacts` handles this: when `manifest.json` returns non-JSON, it sets `isScopeEmpty=true`. `SentToUdm.jsx` is a bespoke component and is not rendered through `DashboardRenderer` — it must check `isScopeEmpty` itself and render `ScopeEmptyState` directly. See Section G for the required state-check pattern.

**Risk 5 — Reusing existing widget types with wrong data shapes**
`TrendChart` expects `days[]{date, failures}` and has a hardcoded title "Failure Trend — last 30 days". `TopSitesTable` expects `{site, failures}` columns. Neither matches `sent_to_udm` data. Do not adapt these shared components. Implement `SentToUdm.jsx` as a bespoke component using `useDashboardArtifacts` directly, keeping all rendering logic local.

**Risk 6 — Changing default route or legacy redirects**
`defaultDashboard = dashboardRegistry[0].id` in `App.jsx`. The new entry must be appended (not prepended) to `dashboardRegistry` so `dlq_operations` remains the default landing page. Do not change `DEFAULT_CLIENT`, `DEFAULT_ENV`, or any redirect paths.

**Risk 7 — SQL block name collisions**
All SQL blocks share a single namespace in `athena_views.sql`. Use the `sent_to_udm_` prefix on all five new blocks. Never reuse or shadow existing block names.

**Risk 8 — Schema validator imports**
`main.py` imports all validators at the top of the file in a single `from validators import (...)` block. The five new validators must be added to this block. Do not modify any existing import lines within the block.

**Risk 9 — `dashboard.json` and the `elif` branch must be created atomically**
Once `dashboards/sent_to_udm/dashboard.json` exists, `discover_dashboards()` includes `sent_to_udm` in `bootstrap()` runs. If the `elif` branch has not been added to `main.py` yet, any `bootstrap()` invocation will hit the `else: sys.exit(1)` path with the error "No artifact assembler for dashboard 'sent_to_udm'". These two changes must land in the same commit or be applied together in the same implementation step.

**Risk 10 — `dashboard.json` artifacts list must exactly match `artifacts_to_write` keys**
`dashboard.json["artifacts"]` drives both the manifest and the `shutil.copy2` loop at `main.py:561`. If `artifacts_to_write` in the `elif` branch contains a key not listed in `dashboard.json["artifacts"]`, that artifact is written to the run folder but never copied to `current/` and never included in the manifest — silently wrong. Conversely, if `dashboard.json["artifacts"]` lists a filename not in `artifacts_to_write`, the copy step raises `FileNotFoundError`. These two lists must be kept in sync exactly. During implementation, define `dashboard.json["artifacts"]` first and use it as the authoritative checklist when writing the elif branch.

---

## D. Proposed Artifact Contract

All artifacts follow the existing envelope: `schema_version`, `generated_at`, `report_ts` at the top level.

### `manifest.json`
Auto-generated by existing publisher infrastructure. Shape is identical to all existing manifests. The `artifacts` list in `dashboard.json` drives it. No new schema validator needed.

Fields: `schema_version`, `run_id`, `generated_at`, `report_ts`, `status`, `artifacts[]`

---

### `summary.json`
Purpose: KPI scalars for the header row.
Grain: single flat object (no array).

```
schema_version      string
generated_at        string   ISO-8601
report_ts           string   ISO-8601
total_regions_active    int  — distinct regions with any CCD, all time
total_sites_active      int  — distinct sites with any CCD, all time
total_ccds_sent         int  — total CCD count, all time
earliest_event_ts   string   ISO-8601 — MIN(timestamp) from dataset; data-derived, not report_ts-relative
latest_event_ts     string   ISO-8601 — MAX(timestamp) from dataset; data-derived, not report_ts-relative
regions_active_30d      int  — distinct regions active in last 30 days
sites_active_30d        int  — distinct sites active in last 30 days
```

Note on `earliest_event_ts` / `latest_event_ts`: these come from `MIN/MAX(timestamp)` in the Parquet data, not from `report_ts`. This differs from all existing summary timestamps. It is intentional — the business question explicitly asks "over what time period?" — but reviewers should note the deviation from the `report_ts`-relative pattern used elsewhere.

Alignment: consistent with `pipeline_health/summary.json` envelope (scalar KPIs in a flat object). New validator required.

---

### `region_summary.json`
Purpose: one row per region, lifetime activity rollup.
Grain: one row per `region`.

```
schema_version  string
generated_at    string
report_ts       string
regions: [
  { region, site_count, ccd_count, first_seen, last_seen }
]
```

Alignment: consistent with `top_sites.json` pattern (envelope + named array of row objects). New validator required.

---

### `trend_30d.json`
Purpose: daily CCD-sent counts for the last 30 days, with date spine.
Grain: one row per calendar day.

```
schema_version  string
generated_at    string
report_ts       string
days: [
  { date, ccd_count }
]
```

Note: field name is `ccd_count`, not `failures`. This differs from `dlq_operations/trend_30d.json` which uses `failures`. These are separate artifact files in separate dashboard scopes — there is no contract conflict. The bespoke `SentToUdm.jsx` component consumes `ccd_count` directly. Do not rename `failures` in the existing DLQ trend artifact. New validator required.

---

### `lifetime_detail.json`
Purpose: all-time per-region/site detail table (answers business question 1).
Grain: one row per `(region, site)` pair.

```
schema_version  string
generated_at    string
report_ts       string
rows: [
  { region, site, ccd_count, first_seen, last_seen }
]
```

New validator required.

---

### `recent_detail_30d.json`
Purpose: last-30-days per-region/site detail table (answers business question 2).
Grain: one row per `(region, site)` pair active in the last 30 days only.

```
schema_version  string
generated_at    string
report_ts       string
window_days     int  (30)
rows: [
  { region, site, ccd_count, first_seen_30d, last_seen_30d }
]
```

New validator required.

---

## E. Proposed SQL Block Plan

All blocks reference a new DuckDB table `ccd_sent_to_udm`, registered in the `elif` branch. All temporal windows anchor to `{report_ts}` after substitution, consistent with all existing blocks. New blocks are appended to `sql/athena_views.sql` below the last existing `-- [end]`.

### `sent_to_udm_summary`
Grouping: none — single row, multiple columns.
Expected columns (in this exact order, as positional index access is used in the publisher):

```
col 0: total_regions_active   int
col 1: total_sites_active     int
col 2: total_ccds_sent        int
col 3: earliest_event_ts      timestamp → str()
col 4: latest_event_ts        timestamp → str()
col 5: regions_active_30d     int
col 6: sites_active_30d       int
```

**Important — pattern deviation:** All existing scalar blocks use `fetchone()[0]` (single value). This block returns 7 columns from a single `fetchone()` call, accessed by positional index. The column order above is the authoritative contract between SQL and the publisher elif branch. Any change to SELECT column order must be reflected in both places simultaneously.

Dependencies: `ccd_sent_to_udm` must have `region`, `site`, `timestamp`.

---

### `sent_to_udm_region_summary`
Grouping: `region`.
Expected columns: `region, site_count, ccd_count, first_seen, last_seen`
Dependencies: `ccd_sent_to_udm.region`, `ccd_sent_to_udm.site`, `ccd_sent_to_udm.timestamp`.

---

### `sent_to_udm_trend_30d`
Grouping: calendar day, last 30 days, with date spine to fill missing days as 0.
Expected columns: `date (string), ccd_count`
Pattern: follows the DLQ `trend_30d` block — date spine via `generate_series`, filled with `COALESCE(count, 0)`. Anchor: `CAST('{report_ts}' AS TIMESTAMP) - INTERVAL '30 days'`.

---

### `sent_to_udm_lifetime_detail`
Grouping: `(region, site)`, no window filter.
Expected columns: `region, site, ccd_count, first_seen, last_seen`

---

### `sent_to_udm_recent_detail_30d`
Grouping: `(region, site)`, filtered to last 30 days.
Expected columns: `region, site, ccd_count, first_seen_30d, last_seen_30d`
Filter: `timestamp >= CAST('{report_ts}' AS TIMESTAMP) - INTERVAL '30 days'`.

---

## F. Publisher Integration Proposal

### `dashboards/sent_to_udm/dashboard.json`

```json
{
  "dashboard_id": "sent_to_udm",
  "title": "CCD Files Sent To UDM",
  "description": "Tracks CCD files sent to UDM by region and site.",
  "portal_route": "/sent_to_udm",
  "sql_blocks": [
    "sent_to_udm_summary",
    "sent_to_udm_region_summary",
    "sent_to_udm_trend_30d",
    "sent_to_udm_lifetime_detail",
    "sent_to_udm_recent_detail_30d"
  ],
  "artifacts": [
    "summary.json",
    "region_summary.json",
    "trend_30d.json",
    "lifetime_detail.json",
    "recent_detail_30d.json"
  ]
}
```

The `artifacts` list here is the authoritative source. Use it as the checklist when writing `artifacts_to_write` in the elif branch. The keys of `artifacts_to_write` must exactly match this list — see Risk 10.

### `main.py` changes (additive only)

**Change 1 — imports:** Add 5 new names to the existing `from validators import (...)` block:
```
sent_to_udm_lifetime_detail_schema,
sent_to_udm_recent_detail_30d_schema,
sent_to_udm_region_summary_schema,
sent_to_udm_summary_schema,
sent_to_udm_trend_30d_schema,
```

**Change 2 — elif branch:** Insert after the `pipeline_health` elif block and before the `else` error block. The branch must:

1. Validate that `data/parquet/ccd_sent_to_udm.parquet` exists. Fail fast with a clear message pointing to `generate_fixtures.py`. (The `ccd_failures.parquet` validation at step 2 of `run()` still runs and must still pass — both Parquet files are generated by `generate_fixtures.py`.)
2. Register `ccd_sent_to_udm` as an additional DuckDB table using the existing `con` connection.
3. Execute the 5 SQL blocks.
4. For `sent_to_udm_summary`: use `fetchone()` and access columns by positional index per the order defined in Section E. Do not use `fetchone()[0]`.
5. For all timestamp values (`earliest_event_ts`, `latest_event_ts`, `first_seen`, `last_seen`, `first_seen_30d`, `last_seen_30d`): wrap in `str()` before including in the artifact payload. DuckDB returns these as timestamp objects; the existing precedent is `str(latest_event)` in the `pipeline_health` branch at `main.py:484`.
6. Assemble 5 artifact payloads with the standard envelope (`schema_version`, `generated_at`, `report_ts`, then data fields).
7. Validate each payload against its corresponding new schema validator.
8. Populate `artifacts_to_write` with keys matching `dashboard.json["artifacts"]` exactly.

### What must remain untouched
- All of `run()` before the if/elif: config load, parquet validation, SQL parse, DuckDB setup, `generated_at` computation
- All of `run()` after the if/elif: manifest build, artifact write, current/ copy, run_history rebuild, platform-manifest rebuild
- `_rebuild_run_history()` — run_history integration is fully automatic
- `_rebuild_platform_manifest()` — fully automatic
- `discover_dashboards()` — generic; creating `dashboard.json` is sufficient
- The `__main__` block — remains pointing to `dlq_operations`
- The `dlq_operations` if-branch and `pipeline_health` elif-branch — do not touch

---

## G. Portal Integration Proposal

### Component approach

Implement `SentToUdm.jsx` as a **bespoke component** that calls `useDashboardArtifacts("sent_to_udm", [...])` directly and renders its own sections. Do not use the `DashboardRenderer` + `definition.json` config approach.

Rationale: existing widget types have hardcoded field names (`failures`) and titles ("Failure Trend — last 30 days") incompatible with `sent_to_udm` data shapes. Creating new widget types for a single dashboard is premature generalization. A bespoke component is simpler, fully isolated, and carries zero regression risk to existing dashboards.

The component may import and use `HealthBanner` and `KpiCard` directly — both are purely prop-driven and do not share state with other components.

### `portal/src/dashboards/index.js` change

Append as the third entry:
```js
{ id: "sent_to_udm", label: "CCD Sent to UDM", component: SentToUdm }
```

`dlq_operations` remains first — default landing page is unchanged.

### Missing-artifact behavior

`useDashboardArtifacts` already sets `isScopeEmpty=true` when `manifest.json` returns non-JSON or a non-200 response. `SentToUdm.jsx` must check `loading`, `error`, and `isScopeEmpty` before rendering data sections. When `isScopeEmpty` is true, render `ScopeEmptyState` (imported from `../../components/ScopeEmptyState.jsx`) — consistent with how `DashboardRenderer` handles it.

### NavBar visibility

`sent_to_udm` appears as a tab for all client/env combinations. On `default/local` the scope will be empty and `ScopeEmptyState` renders gracefully. Do not attempt conditional tab hiding based on artifact presence — that would require reading `platform-manifest.json` in NavBar, which is a structural change outside the scope of this feature.

---

## H. Fixture / Data Proposal

### New file: `data/parquet/ccd_sent_to_udm.parquet`

Extend `data/generate_fixtures.py` with a second generator function and a second `pq.write_table()` call inside `main()`. Existing `ccd_failures` generation is untouched.

### Schema for `ccd_sent_to_udm`

| Column | Type | Values |
|---|---|---|
| `region` | string | `AZ`, `CO`, `WS`, `UNKNOWN` |
| `site` | string | `az_site_1`, `az_site_2`, `co_site_1`, `ws_site_1`, `ws_site_2`, `unknown_site_1` |
| `timestamp` | timestamp (UTC) | spread over 60 days ending at `FIXTURE_ANCHOR` |
| `document_id` | string | `ccd_{i:06d}_{random}` format |

### Design decisions

- Use the same `FIXTURE_ANCHOR = datetime(2026, 3, 7, 12, 0, 0, tzinfo=timezone.utc)` for consistency with existing fixtures.
- Use `WINDOW_DAYS = 60` so the 30-day window contains a meaningful subset and the lifetime window shows a wider range. With `report_ts` at runtime (~2026-03-17), the 30d window covers ~2026-02-15 to 2026-03-07 — a portion of the fixture range. Lifetime covers the full 60-day window.
- Use ~300 rows and seed `43` (distinct from the existing seed `42`).
- Include at least one site per region so all 4 regions appear in all queries. A fixed seed guarantees determinism, not distribution — `random.choice()` under seed 43 may not place every region within the 30-day window by chance. To guarantee this, the generator must seed the first 4 rows explicitly (one per region, with timestamps hardcoded inside the 30-day window) before the random loop begins. This ensures all 4 regions appear in `recent_detail_30d.json` and in the 30d KPI fields in `summary.json`.
- Ensure some sites have timestamps only in days 31–60 (outside the 30d window) so the lifetime vs. recent contrast is meaningful.

---

## I. Verification Steps

After implementation:

1. Run `python data/generate_fixtures.py` — confirm both `ccd_failures.parquet` and `ccd_sent_to_udm.parquet` exist in `data/parquet/`.
2. Run `publisher run --client contexture --env prod --dashboard sent_to_udm` — confirm all 5 artifact files plus `manifest.json` exist in `artifacts/contexture/prod/current/sent_to_udm/`.
3. Confirm `artifacts/contexture/prod/current/run_history.json` includes a `sent_to_udm` entry.
4. Confirm `artifacts/platform-manifest.json` includes the `contexture/prod` scope with `sent_to_udm` listed.
5. Start Vite dev server. Navigate to `/default/local/sent_to_udm` — confirm `ScopeEmptyState` renders (no errors).
6. Navigate to `/contexture/prod/sent_to_udm` — confirm the dashboard renders with all sections populated.
7. Navigate to `/default/local/dlq_operations` and `/default/local/pipeline_health` — confirm both existing dashboards are unaffected.
8. Run existing Python tests — confirm no regressions.

---

## J. Recommended Step 2 Scope

**Implement in Step 2 (in this order to respect atomic deployment constraint — Risk 9):**

1. Extend `data/generate_fixtures.py` with `ccd_sent_to_udm` Parquet generator. Verify both files generate correctly.
2. Add 5 SQL blocks to `sql/athena_views.sql`. Manually verify each block executes correctly against `ccd_sent_to_udm.parquet` via DuckDB.
3. Create `dashboards/sent_to_udm/dashboard.json` **and** add the `elif dashboard == "sent_to_udm":` branch to `main.py` in the same step (Risk 9).
4. Add 5 validator imports to `main.py` imports block.
5. Create 5 schema validator files in `src/publisher/validators/`.
6. Run publisher and verify artifacts (verification steps 1–4 above).
7. Create `portal/src/dashboards/sent_to_udm/SentToUdm.jsx` — implement `isScopeEmpty` / `loading` / `error` handling first, then `HealthBanner`, KPI row, region summary table, lifetime detail table, 30-day trend chart.
8. Append `sent_to_udm` entry to `portal/src/dashboards/index.js`.
9. Verify all portal routes (verification steps 5–7 above).

**Defer to Step 3:**

- Styling polish and responsive layout for the `SentToUdm` component.
- The `recent_detail_30d` table rendering (add last, after data shapes are confirmed).
- CI schema validation tests for the new validators.
- Documentation updates to `docs/json-contracts.md` and `docs/architecture.md`.
- Any platform-manifest-driven portal enhancements (e.g., conditional NavBar visibility).
