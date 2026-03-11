# Demo Hardening Pass and Demo Scenario Guide — Implementation Plan

**Feature:** Demo Hardening Pass and Demo Scenario Guide
**Output artifact:** `docs/plans/demo_hardening_and_scenarios_plan.md`
**Review artifact:** `docs/reviews/demo_hardening_and_scenarios_review.md`
**Date:** 2026-03-10
**Status:** Draft — pending review

---

## 1. Hardening Goals

The synthetic demo data is generated and the platform features are implemented. Before
calling the demo ready, the following must be confirmed end-to-end:

### Correctness
- All 8 runs are visible in Run History for `contexture/local`
- Run Detail loads for all 8 runs without errors
- Dashboard views (dlq_operations, pipeline_health) load and display the most recent run data
- All comparison pairs produce the expected health badge classification
- The AI analysis panel is triggerable and produces a non-empty response on the XPath peak comparison

### UI coherence
- Health badges display with correct color (Critical = red, Healthy = green, etc.)
- The selector shows `contexture` and `local` as the demo scope options
- Navigating to an unknown scope (e.g., `/unknown/scope/history`) produces a readable empty state, not a crash
- Empty-state messages are informative (not generic "loading..." stuck states)

### Repeatability
- `python scripts/generate_demo_data.py` runs cleanly with exit code 0
- Re-running the generator is idempotent — produces identical artifacts
- Portal picks up regenerated data after a browser refresh (no stale cache issues in dev)

### No regressions
- `default/local` scope still works normally (not affected by demo data generation)
- Portal build (`npm run build`) passes without errors
- Portal unit tests (`npm test`) pass

---

## 2. Demo Validation Checklist

This checklist must be executed once before the demo is considered ready. It should
be re-run after any generator or portal change.

### Setup

```bash
# Step 1: Regenerate the demo scope (ensures fresh, idempotent data)
python scripts/generate_demo_data.py
# Expected: "Done. 8 runs written to artifacts/contexture/local/"

# Step 2: Start the portal dev server
cd portal && npm run dev
# Expected: Vite dev server at http://localhost:5173
```

### Check 1 — Run History

Navigate to: `http://localhost:5173/contexture/local/history`

Expected:
- Page loads without errors
- 8 run rows visible (4 dlq_operations + 4 pipeline_health), sorted most-recent-first
- Most recent run (20260310T090000Z) appears at the top for each dashboard
- Dates displayed span 2026-03-04 through 2026-03-10

### Check 2 — Run Detail (XPath peak)

Navigate to: `http://localhost:5173/contexture/local/history/20260308T090000Z/dlq_operations`

Expected:
- Page loads without errors
- failures_last_24h = 89, failures_last_7d = 201
- Exception list shows 6 XPath failure types with realistic provider org names
- Top sites list shows Castle Valley Childrens Clinic at #1

### Check 3 — Run Comparison: XPath baseline vs peak [Critical]

Navigate to:
`http://localhost:5173/contexture/local/history/compare?dashboard=dlq_operations&base=20260304T090000Z&target=20260308T090000Z`

Expected:
- `[Critical]` health badge shown in the comparison header
- Summary diff: failures_last_24h 8 → 89 (+81), failures_last_7d 52 → 201 (+149)
- Exceptions diff: 4+ new failure types in the `added` column
- Top sites diff: Castle Valley moved from #2 to #1; new entrants visible
- Health badge color: red/error theme

### Check 4 — Run Comparison: XPath peak vs remediation [Healthy]

Navigate to:
`http://localhost:5173/contexture/local/history/compare?dashboard=dlq_operations&base=20260308T090000Z&target=20260310T090000Z`

Expected:
- `[Healthy]` health badge shown
- Summary diff: failures_last_24h 89 → 11 (88% reduction)
- Exceptions diff: 4 failure types in the `removed` column (resolved types)
- Health badge color: green/success theme

### Check 5 — Run Comparison: MRN degradation vs remediation

Navigate to:
`http://localhost:5173/contexture/local/history/compare?dashboard=pipeline_health&base=20260306T090000Z&target=20260310T090000Z`

Expected:
- Summary diff shows total_documents_last_24h recovering (612 → 801) and active_sites recovering (18 → 22)
- failure_types diff shows 3 MRN OID patterns in the `removed` column
- Health badge: `[Warning]` or `[Stable]` (MRN summary fields are not failure-named → failure rules don't fire; set-diff removal does not trigger warning rules; net result is Stable unless new types appear vs removed)

### Check 6 — AI Analysis on XPath critical comparison

On the XPath baseline vs peak comparison page (Check 3):
- Click "Analyze with AI" (or equivalent button)
- Expected: loading spinner appears, then AI summary populates within ~45s
- Expected output mentions: XPath failures, Castle Valley Childrens Clinic, failure spike
- If Ollama is not running: error state shows "AI analysis unavailable" gracefully (no crash)

### Check 7 — Selector behavior

From any page:
- Open the client selector: `contexture` should be listed
- Open the env selector: `local` should be listed
- Switch to `default / local` → dashboard view should load `default/local` data
- Switch back to `contexture / local` → dashboard view returns correctly

### Check 8 — Empty state behavior

Navigate to: `http://localhost:5173/nonexistent/scope/history`

Expected:
- Empty state renders (not a blank page or JS error)
- Informative message explaining no data is available for this scope
- Navigation still functional (selector, navbar)

### Check 9 — Default scope unaffected

Navigate to: `http://localhost:5173/default/local/dlq_operations`

Expected:
- Dashboard loads normally with `default/local` data
- Not affected by the `contexture/local` demo data generation

### Check 10 — Build and test pass

```bash
cd portal && npm test    # All tests pass (including runHealth.test.js)
cd portal && npm run build  # Build completes without errors
```

---

## 3. Demo Scenario Guide

The following section describes the full contents of `docs/demo/demo-scenarios.md`.

### Purpose

A standalone reference document that makes the demo repeatable and easy to present.
Audience: the person running the demo (developer, PM, or client-facing presenter).

### Contents

#### Header section
- Platform name, date, and demo scope
- One-line purpose statement

#### Demo scope

| Field | Value |
|-------|-------|
| Client | `contexture` |
| Environment | `local` |
| Base URL | `http://localhost:5173/contexture/local` |
| Dashboards | `dlq_operations` (XPath), `pipeline_health` (MRN) |

#### Regeneration command

```bash
python scripts/generate_demo_data.py
cd portal && npm run dev
```

Short note: re-running is safe and idempotent.

#### Scenario 1 — XPath Regression (dlq_operations)

**Story:** A new source organization deploys with a CCD template variant that breaks
several XPath field mappings. The issue spreads across sites before a mapping fix
is deployed.

Run progression table:

| Run ID | Label | Date | failures_24h | failures_7d | Story |
|--------|-------|------|-------------|------------|-------|
| 20260304T090000Z | baseline | 2026-03-04 | 8 | 52 | Normal processing |
| 20260306T090000Z | degradation_onset | 2026-03-06 | 67 | 148 | CustodianName mapping breaks |
| 20260308T090000Z | sustained_peak | 2026-03-08 | 89 | 201 | 4 XPath fields affected across 6 sites |
| 20260310T090000Z | remediation | 2026-03-10 | 11 | 76 | Mapping fix deployed |

Recommended comparisons table:

| Comparison | Direct URL | Expected health badge |
|------------|-----------|----------------------|
| baseline vs sustained_peak | `…/compare?dashboard=dlq_operations&base=20260304T090000Z&target=20260308T090000Z` | **Critical** |
| degradation_onset vs sustained_peak | `…/compare?dashboard=dlq_operations&base=20260306T090000Z&target=20260308T090000Z` | **Warning** |
| sustained_peak vs remediation | `…/compare?dashboard=dlq_operations&base=20260308T090000Z&target=20260310T090000Z` | **Healthy** |
| baseline vs baseline (self) | same base and target | **Stable** |

AI summary click path (requires Ollama running with `llama3.2`):
1. Navigate to baseline vs sustained_peak comparison
2. Click "Analyze with AI"
3. Expected: mentions XPath failures, Castle Valley Childrens Clinic, failure count spike

#### Scenario 2 — No Valid MRN (pipeline_health)

**Story:** A whitelist configuration update misconfigures the OID (assigning authority)
whitelist. Documents from sites using non-whitelisted OIDs are rejected, causing
document volume to drop and MRN resolution failure counts to rise. The whitelist is
corrected on day 4.

Run progression table:

| Run ID | Label | Date | total_docs_24h | active_sites_24h | MRN failure types |
|--------|-------|------|---------------|-----------------|-------------------|
| 20260304T090000Z | baseline | 2026-03-04 | 847 | 24 | 2 (low counts) |
| 20260306T090000Z | degradation_onset | 2026-03-06 | 612 | 18 | 4 (new OIDs rejected) |
| 20260308T090000Z | sustained_peak | 2026-03-08 | 543 | 15 | 5 (peak rejection) |
| 20260310T090000Z | remediation | 2026-03-10 | 801 | 22 | 1 (residual) |

Recommended comparisons:

| Comparison | Direct URL | Expected health badge |
|------------|-----------|----------------------|
| degradation_onset vs remediation | `…/compare?dashboard=pipeline_health&base=20260306T090000Z&target=20260310T090000Z` | **Stable** (docs recover; failure fields not failure-named) |
| baseline vs sustained_peak | `…/compare?dashboard=pipeline_health&base=20260304T090000Z&target=20260308T090000Z` | **Warning** (new MRN failure types appear) |

Note for presenter: The `pipeline_health` summary fields (`total_documents_last_24h`,
`active_sites_last_24h`) do not contain "failure" in their names, so the failure
severity rules do not fire on them. The health badge for MRN comparisons is driven
by the `failure_types` set-diff, not by summary field changes. This is a known
Phase 1 limitation, and can be a talking point about dashboard-specific rule overrides
planned for Phase 2.

#### Navigation reference

| Page | URL pattern |
|------|------------|
| Dashboard (current run) | `/{client}/{env}/{dashboard_id}` |
| Run History | `/{client}/{env}/history` |
| Run Detail | `/{client}/{env}/history/{runId}/{dashboardId}` |
| Run Compare | `/{client}/{env}/history/compare?dashboard=…&base=…&target=…` |

#### Troubleshooting section

| Symptom | Fix |
|---------|-----|
| Selector doesn't show `contexture` | Regenerate data; check `artifacts/platform-manifest.json` |
| Run History shows 0 runs | Regenerate data; check `artifacts/contexture/local/current/run_history.json` |
| AI panel shows "unavailable" | Start Ollama: `OLLAMA_ORIGINS=* ollama serve` |
| Health badge shows `[Unknown]` | Comparison data may not have loaded; refresh |
| `npm run dev` serves stale data | Hard-refresh browser (Ctrl+Shift+R); Vite serves from disk |

---

## 4. Files to Create / Modify

| File | Action | Description |
|------|--------|-------------|
| `docs/demo/demo-scenarios.md` | Create | Demo scenario guide — full reference document |
| `docs/plans/demo_hardening_and_scenarios_plan.md` | Create | This plan artifact |
| `docs/reviews/demo_hardening_and_scenarios_review.md` | Create | Review artifact |

No portal code changes. No artifact contract changes. No new routes.

The `docs/demo/` directory does not yet exist and will be created when the guide is written.

---

## 5. Non-Goals

| Excluded | Reason |
|----------|--------|
| Platform architecture changes | Demo hardening is validation only; no new features |
| New routes or pages | Existing routes are sufficient for all demo scenarios |
| New artifact contracts | All demo data follows existing validated schemas |
| Portal code changes | The hardening pass may surface bugs, but fixing them is a separate task unless trivial |
| Automated demo validation tests | Phase 1 is a manual checklist; automation is a future enhancement |
| New AI features | Existing AI analysis panel covers the demo path |
| Multi-scope demo | Both scenarios share one scope (`contexture/local`); cross-scope demo is a future extension |
| CI integration of demo data | The generator is a development tool; it does not run in CI |

---

## 6. Verification

The plan is complete when:

1. `docs/demo/demo-scenarios.md` is written and reviewed
2. The manual checklist (Section 2) passes end-to-end on a fresh dev server
3. No portal code changes were required (or any required fixes are tracked separately)
4. The demo guide is readable by a non-developer presenter in under 5 minutes
