# Synthetic Demo Data Generator — Implementation Plan

**Feature:** Realistic Synthetic Demo Data Generator (XPath and No Valid MRN scenarios)
**Output artifact:** `docs/plans/synthetic_demo_data_generator_plan.md`
**Date:** 2026-03-10
**Status:** Draft — pending review

---

## 1. Feature Summary

The platform currently stores artifact data from a DuckDB-backed publisher that queries
real (or minimal local) data. For demos, the existing data is sparse and operationally
uninteresting: generic failure codes like `TIMEOUT`, `AUTH_ERROR`, flat counts, and
placeholder site names like `site_alpha`.

The synthetic demo data generator creates realistic, scenario-driven run sequences that
produce believable artifacts across the two highest-value failure families:

1. **XPath regression** — source CCD mapping fails for specific XPath fields; site names
   and provider names are realistic healthcare organizations
2. **No Valid MRN** — OID/assigning authority whitelist drift causes MRN resolution
   failures across multiple sites; OIDs match realistic HL7 patterns

The generated data:
- Follows all existing artifact JSON contracts (validated before write)
- Populates a real scope visible through the platform manifest and selector
- Produces a sequence of runs that tell an operationally plausible story
- Enables meaningful Run Comparison, Run Health Classification, and AI analysis

**What this is NOT:**
- Not a production simulation engine
- Not a CCD/XML parser or HL7 generator
- Not arbitrary random JSON — scenarios are hand-crafted data structures
- Not real PHI — site names are provider organization names (not patient data);
  OIDs are standard HL7 public identifiers

---

## 2. Demo Use Cases

### Run History

The generator produces 4 runs per scenario (8 runs total in `contexture/local`),
spanning the past ~6 days. Run History shows a plausible operational timeline:

```
20260310T090000Z  dlq_operations   SUCCESS   → remediation (low failures)
20260309T090000Z  dlq_operations   SUCCESS   → sustained_peak (high failures)
20260308T090000Z  dlq_operations   SUCCESS   → degradation_onset (spike begins)
20260305T090000Z  dlq_operations   SUCCESS   → baseline (normal)
20260310T090000Z  pipeline_health  SUCCESS   → remediation
20260309T090000Z  pipeline_health  SUCCESS   → sustained_peak
...
```

### Run Detail

Each run has realistic artifact counts, named exception types, and named sites.
A user clicking into the peak run sees XPath messages like:
`"No match found for XPath 'CustodianName' with input 'Castle Valley Childrens Clinic'"`.

### Run Comparison

Comparing **baseline** vs **sustained_peak**:
- summary delta: `failures_last_24h` 8 → 89 (11× increase → Critical)
- exceptions diff: 6 new XPath failure types appear
- health classification: **Critical**

Comparing **sustained_peak** vs **remediation**:
- failures drop from 89 → 11 (88% reduction → Healthy)
- health classification: **Healthy**

### Run Health Classification

The 4-run sequence exercises all health states:
- baseline → Stable (no comparison; or compare with self → Stable)
- baseline→degradation → **Warning** (25%+ increase) or **Critical** (doubled)
- degradation→peak → **Warning** (new failure types added)
- peak→remediation → **Healthy** (failures drop > 20%)

### AI Run-to-Run Anomaly Analysis

The XPath scenario provides rich signal:
- Large positive delta on `failures_last_24h` and `failures_last_7d`
- 4–6 new failure types in the degradation onset comparison
- Specific, named XPath fields and provider organizations

The MRN scenario provides different signal:
- Drop in `total_documents_last_24h` and `active_sites_last_24h`
- New MRN OID patterns appearing in `failure_types`

Both give the local LLM enough concrete, structured context to produce meaningful
anomaly summaries.

---

## 3. Scenario Model

**Recommendation: Python list-of-dicts scenario definitions** at the top of the
generator script. No YAML or separate config files for Phase 1 — the data is
intentionally hand-crafted, not computed, so Python literals are more maintainable.

```python
XPATH_SCENARIO = {
    "client_id": "contexture",
    "env_id":    "local",
    "dashboard": "dlq_operations",
    "runs": [
        {
            "label":          "baseline",
            "offset_days":    6,        # 6 days ago
            "failures_24h":   8,
            "failures_7d":    52,
            "top_sites":      [...],    # list of {site, failures}
            "exceptions":     [...],    # list of {failure_type, count}
            "trend_override": None,     # None → auto-generated from failures_7d
        },
        {
            "label":          "degradation_onset",
            "offset_days":    4,
            "failures_24h":   67,
            ...
        },
        ...
    ]
}

MRN_SCENARIO = {
    "client_id": "contexture",
    "env_id":    "local",
    "dashboard": "pipeline_health",
    "runs": [...]
}
```

Each run definition contains all the data needed to produce the artifacts for that
run. The generator iterates scenarios → runs → writes artifacts → calls rebuild.

This structure is:
- Readable: a developer can understand the full demo story by reading the data
- Editable: adding a new run or tweaking a count is a one-line change
- Correct: no compute logic hidden in the generator — all values are explicit

---

## 4. Run Design

### Run timeline

Both scenarios run under `contexture/local`. Run IDs are generated from the current
date minus an offset, always at 09:00 UTC, producing stable unique IDs:

```
offset_days=6 → 20260304T090000Z  (baseline)
offset_days=4 → 20260306T090000Z  (degradation_onset)
offset_days=2 → 20260308T090000Z  (sustained_peak)
offset_days=0 → 20260310T090000Z  (remediation)
```

The same time slot is used for both dashboards on each date, matching how `bootstrap`
would produce them.

### Scenario arc

**XPath scenario (`dlq_operations`):**

| Run | Label | failures_24h | failures_7d | Story |
|-----|-------|-------------|------------|-------|
| 1 | baseline | 8 | 52 | Normal CCD processing; minor sporadic errors |
| 2 | degradation_onset | 67 | 148 | New source org deploys; XPath CustodianName breaks |
| 3 | sustained_peak | 89 | 201 | Issue spreads; 4 XPath fields affected across 6 sites |
| 4 | remediation | 11 | 76 | Mapping fix deployed; failures return near-baseline |

**MRN scenario (`pipeline_health`):**

| Run | Label | total_docs_24h | active_sites_24h | Story |
|-----|-------|---------------|----------------|-------|
| 1 | baseline | 847 | 24 | Normal pipeline; high document volume |
| 2 | degradation_onset | 612 | 18 | Whitelist update misconfigured; MRN misses start |
| 3 | sustained_peak | 543 | 15 | 3 OID patterns consistently rejected |
| 4 | remediation | 801 | 22 | Whitelist corrected; volume recovers |

### Scope choice

**Both scenarios target `contexture/local`.**

Rationale:
- Already registered in the platform manifest and the portal selector
- No new scope bootstrap required (generator writes directly)
- `default/local` is preserved as a simpler baseline for development/validation
- Using a single scope for both dashboards matches how a real client deployment works

The generator clears and replaces existing `contexture/local` runs for the demo
scenarios (idempotent — re-running the generator produces the same result).

---

## 5. Artifact Types to Generate

### `dlq_operations` (XPath scenario)

| Artifact | Format |
|----------|--------|
| `summary.json` | `{failures_last_24h, failures_last_7d, top_sites[{site,failures}]}` |
| `top_sites.json` | `{window_days: 30, sites[{site,failures}]}` |
| `exceptions.json` | `{window_days: 7, exceptions[{failure_type,count}]}` — XPath messages as failure_type |
| `trend_30d.json` | `{days[{date,failures}]}` — 30 synthetic daily entries per run |
| `manifest.json` | `{run_id, status:"SUCCESS", artifacts:[filenames]}` — standard manifest |

### `pipeline_health` (MRN scenario)

| Artifact | Format |
|----------|--------|
| `summary.json` | `{total_documents_last_24h, active_sites_last_24h, latest_event_timestamp}` |
| `failure_types.json` | `{window_days: 1, failure_types[{failure_type,count}]}` — MRN messages as failure_type |
| `manifest.json` | `{run_id, status:"SUCCESS", artifacts:[filenames]}` |

### Schema compliance

Every artifact is validated against the existing validators in `src/publisher/validators/`
before being written. If validation fails, the generator aborts with a clear error
message identifying the offending field.

---

## 6. Message Realism Strategy

### XPath failure messages

The `exceptions.json` `failure_type` field for XPath failures uses full descriptive
messages matching the format from the user's context. A realistic pool of XPath
failure types:

```python
XPATH_FAILURE_TYPES = [
    "No match found for XPath 'CustodianName' with input 'Castle Valley Childrens Clinic'",
    "No match found for XPath 'AuthorName' with input 'Orthopedic Centers of Colorado, LLC'",
    "No match found for XPath 'ServicePerformerAddress2' with input '6801 S YOSEMITE STREET, CENTENNIAL, CO, 80112-1406, US'",
    "No match found for XPath 'ProviderOrganizationName' with input 'Miramont Family Medicine-Snow Mesa'",
    "No match found for XPath 'CustodianName' with input 'UCHealth Poudre Valley Hospital'",
    "No match found for XPath 'FacilityName' with input 'Banner Fort Collins Medical Center'",
    "No match found for XPath 'AuthorName' with input 'SCL Health St. Francis Medical Center'",
    "No match found for XPath 'PatientAddress' with input '2750 ARAPAHOE RD, LAFAYETTE, CO, 80026, US'",
    "No match found for XPath 'ProviderOrganizationName' with input 'Rocky Mountain Primary Care - Lone Tree'",
    "No match found for XPath 'CustodianName' with input 'Colorado Springs Health Partners'",
]
```

The baseline run uses 2–3 of these at low counts. The peak run uses 6–8 at high counts.
The remediation run drops back to 1–2 at low counts. This produces meaningful set-diff
results in Run Comparison (new failure types appeared, then resolved).

### No Valid MRN failure messages

The `failure_types.json` `failure_type` field uses realistic OID messages:

```python
MRN_FAILURE_TYPES = [
    "No valid MRN found with provided whitelisted. MRNs in document: [2.16.840.1.113883.3.9620.2]",
    "No valid MRN found with provided whitelisted. MRNs in document: [Mrn,Interface Mapping External ID,Id,2.16.840.1.113883.4.1]",
    "No valid MRN found with provided whitelisted. MRNs in document: [1.2.840.113619.21.1.8411625035966477652.2.1.1.1]",
    "No valid MRN found with provided whitelisted. MRNs in document: [2.16.840.1.113883.3.9620.1,2.16.840.1.113883.4.1]",
    "No valid MRN found with provided whitelisted. MRNs in document: [2.16.840.1.113883.3.1239.5.1.3.1.2.2]",
    "No valid MRN found with provided whitelisted. MRNs in document: [1.2.840.10008.1.2.1.99]",
]
```

**Privacy analysis:** OIDs (Object Identifiers) are public standard identifiers in
HL7/DICOM namespaces. They identify assigning authorities, not individuals. Site names
are healthcare provider organization names (publicly known entities, not patient data).
No patient names, DOBs, SSNs, or medical record contents appear in any generated artifact.

---

## 7. Site / Source Distribution

### Failure distribution principles

Flat uniform distributions are unrealistic and uninteresting for demos. Real DLQ
failure patterns are:
- **Top-site concentrated:** 2–3 sites account for 60–70% of failures
- **Long tail:** several sites with low counts
- **Run-to-run variation:** which site is #1 may shift between runs

### XPath site distribution

**Baseline run** (failures_7d = 52):
```
UCHealth Poudre Valley Hospital:     19 (37%)
Castle Valley Childrens Clinic:      11 (21%)
HealthONE Sky Ridge Medical Center:   8 (15%)
Miramont Family Medicine-Snow Mesa:   7 (13%)
Banner Fort Collins Medical Center:   7 (13%)
```

**Sustained peak run** (failures_7d = 201):
```
Castle Valley Childrens Clinic:      72 (36%)   ← moved to #1 (new XPath issue)
UCHealth Poudre Valley Hospital:     49 (24%)
Orthopedic Centers of Colorado LLC:  31 (15%)   ← new entrant
Miramont Family Medicine-Snow Mesa:  26 (13%)
HealthONE Sky Ridge Medical Center:  14 (7%)
SCL Health St. Francis Medical Center: 9 (4%)   ← new entrant
```

**Remediation run** (failures_7d = 76):
```
UCHealth Poudre Valley Hospital:     28 (37%)   ← back to #1
Castle Valley Childrens Clinic:      18 (24%)
Miramont Family Medicine-Snow Mesa:  12 (16%)
HealthONE Sky Ridge Medical Center:  10 (13%)
Banner Fort Collins Medical Center:   8 (11%)
```

The site rank shift (baseline: UCHealth #1 → peak: Castle Valley #1) is a realistic
artifact of source-specific mapping regression. Run Comparison shows this site
movement clearly.

---

## 8. Integration Strategy

### Recommended approach: Direct artifact write + publisher rebuild functions

The generator writes artifact JSON files directly to the standard directory layout
and then calls the two existing publisher rebuild functions:

```
scripts/generate_demo_data.py
  → for each scenario → for each run:
    1. Build artifact dict (Python literal)
    2. Validate with existing validators (src/publisher/validators/)
    3. Write to artifacts/{client}/{env}/runs/{run_id}/{dashboard}/
    4. Write manifest.json to same dir
  → Call _rebuild_run_history(generated_at, client_id, env_id) per scope
  → Call _rebuild_platform_manifest(generated_at)
  → Print summary
```

**Why not through the publisher pipeline:**
- The publisher requires DuckDB + Parquet data + SQL queries. Synthetic generation
  bypasses all of this by definition.
- Running `publisher run` for synthetic data would require fabricating a Parquet
  dataset, which is more complex and creates false impression of real data.

**Why not raw JSON files without rebuild:**
- `run_history.json` and `platform-manifest.json` must be rebuilt after writing
  run artifacts, or the portal and selector won't show the new runs.
- The rebuild functions are already correct and tested — reusing them is better
  than reimplementing.

**Idempotency:** The generator clears the target scope's `runs/` directory before
writing, then rebuilds from scratch. Re-running always produces an identical result.
This prevents stale runs accumulating.

---

## 9. Scope / Client / Environment Target

**Primary scope: `contexture/local`**

Both scenarios (dlq_operations XPath and pipeline_health MRN) target `contexture/local`.

**Justification:**
- Already in the platform manifest — portal selector shows it immediately
- Represents a realistic "healthcare client" scope
- `default/local` remains untouched as a development baseline
- A single demo scope containing both dashboards matches real deployment shape

**No new scope bootstrapping required.** The generator writes directly into the
artifact tree without needing `publisher bootstrap`.

**Idempotency note:** The generator deletes existing `artifacts/contexture/local/runs/`
before writing. Existing `artifacts/contexture/local/current/` is rebuilt from the
new runs. This is a destructive-then-rebuild pattern, matching what a `bootstrap` does.
The user is warned in the script output before deletion.

---

## 10. File / Module Design

### Files to create

| File | Purpose |
|------|---------|
| `scripts/generate_demo_data.py` | Main generator: scenario definitions, artifact builders, CLI entry point |

### No new modules required

All generator logic lives in one script. The scenario data structures (site names,
failure type messages, run counts) are defined at the top as Python constants — they
are intentionally readable data, not computed values.

The script imports:
- `src.publisher.main._rebuild_run_history` and `_rebuild_platform_manifest`
- `src.publisher.validators.*` for validation before write

### Script structure

```
scripts/generate_demo_data.py
  ├── # Constants: XPATH_FAILURE_TYPES, MRN_FAILURE_TYPES, XPATH_SITES, MRN_SITES
  ├── # Scenario definitions: XPATH_SCENARIO, MRN_SCENARIO
  ├── def make_run_id(offset_days) → str
  ├── def make_report_ts(offset_days) → str
  ├── def build_trend_30d(failures_7d, run_date) → list[{date,failures}]
  ├── def write_artifact(path, payload) → None  (validates + writes)
  ├── def write_run(scenario, run_def) → str  (returns run_id)
  ├── def clear_scope_runs(client_id, env_id) → None
  ├── def generate_scenario(scenario) → None
  └── if __name__ == "__main__": main()
```

### CLI invocation

```bash
# Generate all demo scenarios
python scripts/generate_demo_data.py

# Output:
# Clearing contexture/local runs...
# Writing XPath scenario (dlq_operations)...
#   [1/4] baseline         → 20260304T090000Z  (8 failures_24h)
#   [2/4] degradation_onset → 20260306T090000Z (67 failures_24h)
#   [3/4] sustained_peak   → 20260308T090000Z  (89 failures_24h)
#   [4/4] remediation      → 20260310T090000Z  (11 failures_24h)
# Writing MRN scenario (pipeline_health)...
#   [1/4] baseline         → 20260304T090000Z  (847 docs)
#   ...
# Rebuilding run_history.json for contexture/local...
# Rebuilding platform-manifest.json...
# Done. 8 runs written to artifacts/contexture/local/
```

---

## 11. Verification Plan

### Artifact file existence

```bash
# After running the generator:
ls artifacts/contexture/local/runs/
# Expected: 4 run_id directories

ls artifacts/contexture/local/runs/*/dlq_operations/
# Expected: summary.json, top_sites.json, exceptions.json, trend_30d.json, manifest.json

ls artifacts/contexture/local/runs/*/pipeline_health/
# Expected: summary.json, failure_types.json, manifest.json
```

### Schema validation (in-generator)

Validated before write. If any artifact fails validation, the generator aborts
and prints the validation error.

### Portal verification

```bash
# Start portal dev server
cd portal && npm run dev

# 1. Navigate to http://localhost:5173/contexture/local/history
# Expected: 8 runs in history (4 dlq_operations + 4 pipeline_health)

# 2. Navigate to http://localhost:5173/contexture/local/dlq_operations
# Expected: shows sustained_peak (most recent) data with XPath failure types

# 3. Navigate to Run Comparison: baseline vs sustained_peak (dlq_operations)
# Expected:
#   - failures_last_24h: 8 → 89 (+81) — CRITICAL badge
#   - exceptions diff: 4-6 new XPath failure types
#   - HealthBadge: [Critical]

# 4. Navigate to Run Comparison: sustained_peak vs remediation (dlq_operations)
# Expected:
#   - failures_last_24h: 89 → 11 (-78) — HEALTHY badge
#   - HealthBadge: [Healthy]

# 5. Run AI analysis on baseline vs peak comparison
# Expected: AI summary mentions XPath failures and site spike

# 6. pipeline_health: navigate to contexture/local/pipeline_health
# Expected: shows remediation data (doc volume recovered)

# 7. Health classification covers: Stable, Warning, Critical, Healthy across comparisons
```

### No PHI verification

```bash
grep -r "DOB\|SSN\|date_of_birth\|patient_name\|social_security" artifacts/contexture/
# Expected: no matches
```

---

## 12. Non-Goals

| Excluded | Reason |
|----------|--------|
| Production-grade simulation engine | Phase 1 is static scenario definitions, not stochastic simulation |
| Full CCD/XML generation | Artifacts contain processed failure metadata, not source documents |
| Real PHI | All data is synthetic provider org names and public OIDs |
| Backend services | Standalone Python script only |
| Changing portal routes | No portal changes needed — existing routes work with new data |
| Changing artifact contracts | All generated artifacts must validate against existing schemas |
| Seeded random generation | Scenarios are fully deterministic data literals, not stochastic |

---

## 13. Future Extensions

| Extension | Description |
|-----------|-------------|
| Additional scenario families | FHIR mapping errors, auth failures, volume spikes |
| Seeded random generation | `random.seed(scenario_name)` for reproducible but varied data |
| Reproducible demo profiles | Named profiles (e.g., `--profile=xpath_crisis`) selecting scenario subsets |
| Dashboard-specific packs | scenario packs per dashboard type |
| Synthetic manifest generation | Generate `platform-manifest.json` entries for offline demos |
| Multi-scope scenarios | Same scenario across default/local and contexture/local for cross-scope demo |

None of these are in Phase 1.
