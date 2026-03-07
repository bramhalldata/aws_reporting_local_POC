# Plan: Add System Health Banner

## Context

The portal currently shows a minimal freshness line in the page header, reading from
`summary.json`. This needs to be replaced with a proper System Health Banner that reads
exclusively from `manifest.json` — the correct architectural source for health and
freshness metadata. The banner displays publisher status, data freshness, artifact
timestamp, and schema version.

`manifest.json` is missing `report_ts`, which is required for the "data as of" field.
All other banner fields (`generated_at`, `status`, `schema_version`) are already present.

---

## Architecture Compliance

| Requirement | How it is met |
|-------------|--------------|
| Portal is presentation-only | Banner renders manifest fields as strings; no computation |
| manifest.json is the health source | All four banner fields come from manifest, not summary |
| Publisher generates manifest metadata | `report_ts` added by publisher (already computed in `run()`) |
| No metric logic in React | Timestamps displayed as-is; no age/staleness calculation |

---

## Proposed manifest.json Fields

Current fields (unchanged):
- `schema_version` — "1.0.0"
- `generated_at` — ISO-8601 UTC timestamp of when the publisher ran
- `status` — "SUCCESS" | "ERROR"
- `artifacts` — list of artifact filenames

**New field:**
- `report_ts` — the fixed anchor timestamp all SQL metric windows were relative to

Note: `report_ts` and `generated_at` serve different purposes and need not be identical.
- `report_ts` — the metric window anchor (ends in "Z", computed before queries run)
- `generated_at` — when the publisher ran and wrote artifacts (ends in "+00:00")

Updated manifest.json example:
```json
{
  "schema_version": "1.0.0",
  "generated_at": "2026-03-07T16:41:29+00:00",
  "report_ts": "2026-03-07T16:41:29Z",
  "status": "SUCCESS",
  "artifacts": ["summary.json", "trend_30d.json", "top_sites.json", "exceptions.json"]
}
```

---

## Banner UI Behaviour

- Rendered at the very top of the page, above the `<header>`
- Four fields displayed horizontally (wraps on small screens):
  - **Status** — green "SUCCESS" pill or red "ERROR" pill (from `manifest.status`)
  - **Data as of** — `manifest.report_ts` (the data window anchor)
  - **Generated** — `manifest.generated_at` (when publisher ran)
  - **Schema** — `manifest.schema_version`
- If manifest fails to load, the banner is replaced by the existing error box
- No new dependencies; inline styles consistent with existing portal style

---

## Impacted Layers

| Layer | Change |
|-------|--------|
| Publisher | Add `report_ts` to manifest dict in `main.py`; change status to "SUCCESS" |
| Validator | Add `report_ts` field and update status enum in `manifest_schema.py` |
| Portal (data) | No change — `manifest` is already returned from `loadArtifacts()` |
| Portal (UI) | Add `HealthBanner` component; render it above `<header>`; remove redundant freshness line from header |

---

## Files to Change

### 1. `src/publisher/validators/manifest_schema.py`
- Add `"report_ts"` to `required` list
- Add `"report_ts": {"type": "string"}` to `properties`
- Change `status` enum from `["ok", "error"]` to `["SUCCESS", "ERROR"]`
- Keep `additionalProperties: False`

### 2. `src/publisher/main.py`
- In the manifest dict (step 9 of `run()`), add `"report_ts": report_ts`
- Change `"status": "ok"` to `"status": "SUCCESS"`
- `report_ts` is already in scope — no other changes needed

### 3. `portal/src/App.jsx`
- Add `HealthBanner` component:
  - Props: `{ status, generatedAt, reportTs, schemaVersion }`
  - Renders a horizontal bar with four labelled fields
  - Status field uses a coloured pill: green for "SUCCESS", red for anything else
- In `App` render:
  - Move `<HealthBanner>` above `<header>`, reading from `data.manifest`
  - Remove the existing `<p style={styles.freshness}>` line from the header (its information is now in the banner)
  - Update `manifest.status !== "ok"` check in `loadArtifacts()` to `manifest.status !== "SUCCESS"`
- Add banner styles to the `styles` object: `banner`, `bannerField`, `bannerLabel`, `bannerValue`, `pill`, `pillSuccess`, `pillError`

---

## Files NOT Changed

| File | Reason |
|------|--------|
| `sql/athena_views.sql` | No SQL changes |
| `src/publisher/validators/summary_schema.py` | summary.json schema unchanged |
| `src/publisher/validators/trend_30d_schema.py` | unchanged |
| `src/publisher/validators/top_sites_schema.py` | unchanged |
| `src/publisher/validators/exceptions_schema.py` | unchanged |
| `data/generate_fixtures.py` | No data changes |
| `portal/vite.config.js`, `portal/index.html`, `portal/src/main.jsx` | unchanged |
| `requirements.txt` | No new Python dependencies |

---

## Verification Steps

1. Run `python src/publisher/main.py` → exits 0
2. Inspect `artifacts/manifest.json`:
   - `report_ts` is present and is a valid ISO-8601 string (the metric anchor, ends in "Z")
   - `generated_at` is present and is a valid ISO-8601 string (when publisher ran, ends in "+00:00")
   - The two values are independent and need not be identical
   - `status` is `"SUCCESS"`
   - `schema_version` is `"1.0.0"`
3. Cross-artifact timestamp consistency:
   - `report_ts` in `manifest.json` matches `report_ts` in `summary.json`, `trend_30d.json`, `top_sites.json`, `exceptions.json`
   - `generated_at` in `manifest.json` matches `generated_at` in all four payload artifacts
4. Run `cd portal && npm run dev` → banner renders at the top of the page
5. Confirm banner shows: green "SUCCESS" pill, correct "Data as of" (`report_ts`), "Generated" (`generated_at`), and "Schema" values
6. Manually set `"status": "ERROR"` in `artifacts/manifest.json`, refresh → confirm banner shows red "ERROR" pill
7. Confirm header no longer has the old freshness line (replaced by the banner)
8. Schema validation: run publisher with `report_ts` removed from the manifest dict → confirm `ValidationError` is raised and no artifacts are written
