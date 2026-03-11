# Demo Scenarios Guide

**Platform:** AWS Reporting POC
**Date:** 2026-03-10
**Demo scope:** `contexture / local`

This guide makes the demo repeatable and easy to present. It covers available scenarios,
recommended comparisons, expected health badge outcomes, and an AI analysis click path.

---

## Quick Start

```bash
# 1. Regenerate the demo scope (safe to re-run — idempotent)
python scripts/generate_demo_data.py

# 2. Start the portal
cd portal && npm run dev
# Portal: http://localhost:5173
```

After starting the dev server, navigate to:
`http://localhost:5173/contexture/local/history`

---

## Demo Scope

| Field | Value |
|-------|-------|
| Client | `contexture` |
| Environment | `local` |
| Base URL | `http://localhost:5173/contexture/local` |
| Dashboards | `dlq_operations` (XPath scenario) · `pipeline_health` (MRN scenario) |
| Total runs | 8 (4 per dashboard, spanning 2026-03-04 through 2026-03-10) |

---

## Recommended Demo Flow

This sequence takes approximately 10 minutes and exercises every major platform feature.

1. **Open Run History** — show the full run timeline across both dashboards
2. **Open a Run Detail** — drill into the sustained_peak run to see raw exception data
3. **XPath Critical comparison** — baseline vs sustained_peak → health badge turns Critical
4. **XPath Healthy comparison** — sustained_peak vs remediation → health badge turns Healthy
5. **AI Analysis** — trigger AI summary on the Critical comparison; walk through the output
6. **MRN comparison** — show the MRN failure type diff and document volume recovery
7. **Selector** — switch to `default / local` to demonstrate multi-scope capability

---

## Scenario 1 — XPath Regression (`dlq_operations`)

**Story:** A new source organization deploys a CCD template variant that breaks several
XPath field mappings. Failures spike across multiple provider sites before a mapping
fix is deployed six days later.

### Run Progression

| Run ID | Label | Date | failures_24h | failures_7d | Story |
|--------|-------|------|-------------|------------|-------|
| `20260304T090000Z` | baseline | 2026-03-04 | 8 | 52 | Normal processing; minor sporadic errors |
| `20260306T090000Z` | degradation_onset | 2026-03-06 | 67 | 148 | CustodianName mapping breaks at Castle Valley |
| `20260308T090000Z` | sustained_peak | 2026-03-08 | 89 | 201 | 6 XPath fields affected across 6 provider sites |
| `20260310T090000Z` | remediation | 2026-03-10 | 11 | 76 | Mapping fix deployed; failures return near-baseline |

### Recommended Comparisons

| Comparison | Direct URL | Expected Health Badge |
|------------|-----------|----------------------|
| baseline vs sustained_peak | [compare link](http://localhost:5173/contexture/local/history/compare?dashboard=dlq_operations&base=20260304T090000Z&target=20260308T090000Z) | **Critical** |
| degradation_onset vs sustained_peak | [compare link](http://localhost:5173/contexture/local/history/compare?dashboard=dlq_operations&base=20260306T090000Z&target=20260308T090000Z) | **Warning** |
| sustained_peak vs remediation | [compare link](http://localhost:5173/contexture/local/history/compare?dashboard=dlq_operations&base=20260308T090000Z&target=20260310T090000Z) | **Healthy** |
| any run vs itself | same base and target run ID | **Stable** |

### What to Show in Each Comparison

**baseline vs sustained_peak (Critical):**
- Summary delta: failures_last_24h jumped from 8 to 89 — a 10× increase
- Exceptions diff: 4 new XPath failure types appeared (CustodianName, AuthorName, ProviderOrganizationName, FacilityName)
- Top sites diff: Castle Valley Childrens Clinic moved from #2 to #1; two new sites entered the top list
- Health badge: red `[Critical]` — failure doubled threshold exceeded

**sustained_peak vs remediation (Healthy):**
- Summary delta: failures_last_24h dropped from 89 to 11 — an 88% reduction
- Exceptions diff: 4 failure types moved to the `removed` column (mapping fix resolved them)
- Health badge: green `[Healthy]` — 20%+ reduction threshold exceeded

### AI Analysis Click Path

> **Prerequisite:** Ollama must be running with the `llama3.2` model.
> Start it with: `OLLAMA_ORIGINS=* ollama serve`
> If Ollama is unavailable, the panel shows a graceful "AI analysis unavailable" message.

1. Navigate to the **baseline vs sustained_peak** comparison (Critical)
2. Click **"Analyze with AI"** in the panel below the comparison tables
3. Wait up to 45 seconds for the local model to respond
4. Expected output: a structured summary covering the failure spike, affected XPath fields,
   and provider sites — drawn from the comparison data visible in the tables above
5. If the output mentions Castle Valley, XPath fields, or the magnitude of the failure
   increase, the AI analysis is working correctly

---

## Scenario 2 — No Valid MRN (`pipeline_health`)

**Story:** A whitelist configuration update misconfigures the OID (assigning authority)
whitelist used for MRN resolution. Documents from sites using non-whitelisted OIDs
are silently rejected, causing document volume to drop and active site count to fall.
The whitelist is corrected on day 6.

### Run Progression

| Run ID | Label | Date | total_docs_24h | active_sites_24h | MRN failure types |
|--------|-------|------|---------------|-----------------|-------------------|
| `20260304T090000Z` | baseline | 2026-03-04 | 847 | 24 | 2 (low counts — normal) |
| `20260306T090000Z` | degradation_onset | 2026-03-06 | 612 | 18 | 4 (new OID patterns rejected) |
| `20260308T090000Z` | sustained_peak | 2026-03-08 | 543 | 15 | 5 (peak rejection; 3 OID patterns consistent) |
| `20260310T090000Z` | remediation | 2026-03-10 | 801 | 22 | 1 (whitelist corrected; residual) |

### Recommended Comparisons

| Comparison | Direct URL | Expected Health Badge |
|------------|-----------|----------------------|
| baseline vs sustained_peak | [compare link](http://localhost:5173/contexture/local/history/compare?dashboard=pipeline_health&base=20260304T090000Z&target=20260308T090000Z) | **Warning** |
| degradation_onset vs remediation | [compare link](http://localhost:5173/contexture/local/history/compare?dashboard=pipeline_health&base=20260306T090000Z&target=20260310T090000Z) | **Stable** |

### What to Show in Each Comparison

**baseline vs sustained_peak (Warning):**
- failure_types diff: 3 new MRN OID patterns in the `added` column
- Summary: document volume visible in the tables (847 → 543 drop shown in the diff)
- Health badge: **Warning** — new failure types appeared (set-diff rule fires)

**degradation_onset vs remediation (Stable):**
- failure_types diff: 3 MRN OID patterns in the `removed` column (resolved)
- Summary: document volume recovering (612 → 801), active sites recovering (18 → 22)
- Health badge: **Stable**

> **Presenter note — Why Stable for the recovery comparison?**
>
> The `pipeline_health` summary fields (`total_documents_last_24h`, `active_sites_last_24h`)
> do not contain the word "failure" in their names. The Phase 1 health classifier
> identifies failure metrics by field name — so volume recovery is not recognized as
> a "Healthy" improvement by the current rules.
>
> This is a known Phase 1 limitation and a useful demo talking point:
> - Phase 1: failure-field heuristic based on field name substring matching
> - Phase 2 roadmap: per-dashboard rule overrides, allowing `total_documents_last_24h`
>   to be explicitly configured as an improvement metric for `pipeline_health`
>
> The removal of failure types from the set-diff also does not trigger a Healthy badge
> (only *additions* of failure types trigger Warning/Critical rules, not removals).

---

## Navigation Reference

| Page | URL pattern |
|------|------------|
| Dashboard (current run) | `/{client}/{env}/{dashboard_id}` |
| Run History | `/{client}/{env}/history` |
| Run Detail | `/{client}/{env}/history/{runId}/{dashboardId}` |
| Run Comparison | `/{client}/{env}/history/compare?dashboard=…&base=…&target=…` |

---

## Hardening Checklist

Run this before any demo to confirm the environment is ready.

### Setup

```bash
python scripts/generate_demo_data.py   # regenerate demo scope
cd portal && npm run dev               # start dev server
```

### Checks

| # | Check | URL | Pass criteria |
|---|-------|-----|---------------|
| 1 | Run History loads | `/contexture/local/history` | 8 run rows visible, sorted most-recent-first; rows span 2026-03-04 to 2026-03-10 |
| 2 | Run Detail — XPath peak | `/contexture/local/history/20260308T090000Z/dlq_operations` | failures_24h=89; 6 exception types listed; Castle Valley at #1 |
| 3 | Critical comparison | `…/compare?dashboard=dlq_operations&base=20260304T090000Z&target=20260308T090000Z` | `[Critical]` badge; failures_24h 8→89 in summary diff |
| 4 | Healthy comparison | `…/compare?dashboard=dlq_operations&base=20260308T090000Z&target=20260310T090000Z` | `[Healthy]` badge; failures_24h 89→11 in summary diff |
| 5 | MRN comparison | `…/compare?dashboard=pipeline_health&base=20260306T090000Z&target=20260310T090000Z` | `[Stable]` badge; failure_types removed column shows 3 resolved OIDs |
| 6 | AI analysis | Critical comparison page (check 3) | AI panel produces output after clicking "Analyze with AI"; output references comparison data (requires Ollama) |
| 7 | Selector | Any page | `contexture` and `local` appear in selector dropdowns; switching to `default/local` loads correctly |
| 8 | Empty state | `/nonexistent/scope/history` | Empty state renders; no JS error; navigation still works |
| 9 | Default scope unaffected | `/default/local/dlq_operations` | Dashboard loads normally; not affected by demo data |
| 10 | Build and test pass | Terminal | `npm test` and `npm run build` complete without errors |

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Selector doesn't show `contexture` | Run `python scripts/generate_demo_data.py`; check `artifacts/platform-manifest.json` |
| Run History shows no runs | Run generator; check `artifacts/contexture/local/current/run_history.json` |
| AI panel shows "unavailable" | Start Ollama: `OLLAMA_ORIGINS=* ollama serve` |
| Health badge shows `[Unknown]` | Comparison data may not have loaded yet; try refreshing |
| Portal shows stale data after regeneration | Hard-refresh the browser (Ctrl+Shift+R / Cmd+Shift+R) |
| `npm run dev` fails | Run `npm install` inside `portal/` first |
