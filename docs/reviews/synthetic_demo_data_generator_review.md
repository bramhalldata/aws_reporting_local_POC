# Synthetic Demo Data Generator — Plan Review

**Feature:** Realistic Synthetic Demo Data Generator (XPath and No Valid MRN failure scenarios)
**Plan artifact:** `docs/plans/synthetic_demo_data_generator_plan.md`
**Date:** 2026-03-10
**Reviewer:** Claude Code
**Recommendation:** APPROVED WITH TWO NOTES

---

## 1. Feature Summary

**Assessment: Correct and well-scoped.**

The plan correctly identifies the problem: existing data is too sparse to demonstrate
meaningful run comparison, health classification, or AI anomaly analysis. The solution —
hand-crafted scenario definitions that produce realistic artifacts — is the right approach
for Phase 1. The "what this is NOT" section is particularly well-defined: not a simulation
engine, not stochastic, not real PHI. These boundaries prevent scope creep in implementation.

The choice of two failure families (XPath regression and No Valid MRN) is sound: they
are structurally different (field-mapping failure vs. OID whitelist drift), they use
different dashboards (`dlq_operations` vs. `pipeline_health`), and they produce different
artifact types (`exceptions.json` vs. `failure_types.json`), exercising more of the
comparison and classification surface area.

---

## 2. Demo Use Cases

**Assessment: Correct. The run sequence produces the right signal for each feature.**

The run comparison examples are mathematically verified against the health classification
thresholds in `runHealth.js`:

- baseline → sustained_peak: failures_24h 8 → 89, delta = 81, ratio = 10.1 > 1.0 (FAILURE_CRITICAL_RATIO) → **Critical** ✓
- sustained_peak → remediation: failures_24h 89 → 11, delta = -78, ratio = -0.876 < -0.20 (FAILURE_HEALTHY_RATIO) → **Healthy** ✓
- New exception types added in degradation_onset → `CRITICAL_MANY_NEW_FAILURE_TYPES` or `WARNING_NEW_FAILURE_TYPE` ✓

The AI analysis signal is well-selected: XPath failures provide named entities (specific
XPath fields, specific provider organization names) that a local LLM can describe
meaningfully. MRN failures provide a document volume drop with named OID patterns.
Both give the LLM concrete, structured context beyond generic "failure count increased."

One correction to the plan text (Section 4 Run timeline): the offset labels in the
timeline comment are inverted. The table shows:

```
offset_days=6 → baseline
offset_days=4 → degradation_onset
offset_days=2 → sustained_peak
offset_days=0 → remediation
```

But relative to 2026-03-10:

- offset_days=6 → 2026-03-04 (not 20260304, the plan shows 20260304T090000Z — this is correct)
- offset_days=0 → 2026-03-10 (today = remediation)

The dates are correct. The label comment in Section 2's run history table shows
`20260305T090000Z` for the baseline row, but Section 4 computes `20260304T090000Z`
for `offset_days=6`. This is a minor inconsistency in the illustrative comments;
the Section 4 table values are authoritative and correct.

**Note 1 — Run history row count:** Section 2 shows "8 runs in history" but run history
groups by dashboard. The portal Run History page (if implemented as per the run history
plan) shows runs per dashboard, not aggregated. The verification step should read:

```
# 4 rows in dlq_operations run history
# 4 rows in pipeline_health run history
```

The implementation should ensure both dashboards appear in the selector and history
page, not that 8 rows appear on a single page.

---

## 3. Scenario Model

**Assessment: Correct. Python literal dicts are the right format for Phase 1.**

The rejection of YAML/config files is correct: the scenario data is intentionally
opinionated and hand-crafted. Python literals are readable, version-controlled, and
require no additional parsing dependency. The structure — scenarios → runs → data keys
— is clean and correctly separates the "what runs to write" concern from the
"how to write them" concern.

The `trend_override: None → auto-generated from failures_7d` pattern is correctly
noted but requires clarification in implementation: the trend generation function
(`build_trend_30d`) must produce a 30-day series that is internally consistent with
the published `failures_last_7d` value. The last 7 entries in the trend should sum to
approximately `failures_7d`. The implementation should document this invariant.

---

## 4. Run Design

**Assessment: Correct. The 4-run arc exercises all relevant health states.**

The XPath scenario arc produces:
- baseline → degradation_onset: 8 → 67 failures_24h, ratio = 7.375 > 1.0 → Critical ✓
- degradation_onset → sustained_peak: 67 → 89, ratio = 0.328 > 0.25 → Warning (plus new failure types) ✓
- sustained_peak → remediation: 89 → 11, ratio = -0.876 < -0.20 → Healthy ✓

All four health states are reachable across the scenario:
- Unknown: no comparison data (before any runs exist)
- Stable: comparing any run against itself
- Warning: degradation_onset → sustained_peak
- Critical: baseline → degradation_onset or baseline → sustained_peak
- Healthy: sustained_peak → remediation

The MRN scenario uses `total_documents_last_24h` and `active_sites_last_24h` as
primary metrics. These fields do NOT contain "failure" in their names, so
`classifyRunHealth()` will return **Stable** for most comparisons (non-failure fields
do not trigger failure rules — see `isFailureField()` in `runHealth.js`). If the
MRN scenario uses `failure_types.json` for the OID failures, the set-diff comparison
can trigger `WARNING_NEW_FAILURE_TYPE` or `CRITICAL_MANY_NEW_FAILURE_TYPES`, but
the summary-level health classification will be Stable unless the MRN scenario adds
failure-named summary fields.

This is a known limitation of Phase 1's failure field heuristic. The plan does not
claim the MRN scenario produces Critical/Warning health badges — only that it provides
different signal for the AI analysis. This is acceptable for Phase 1 as long as the
demo script and verification plan set correct expectations. The verification plan
(Section 11) does not specify expected health badges for `pipeline_health` comparisons,
which is appropriate given this limitation.

**Scope choice (`contexture/local` for both):** Correct. One scope, two dashboards
matches real deployment shape and avoids needing a new bootstrap.

---

## 5. Artifact Types

**Assessment: Correct. Schema compliance via in-generator validation is the right approach.**

The artifact set for `dlq_operations` is well-chosen:
- `summary.json`, `top_sites.json`, `exceptions.json`, `trend_30d.json`, `manifest.json`

The artifact set for `pipeline_health` is appropriately minimal:
- `summary.json`, `failure_types.json`, `manifest.json`

Validating before write (abort on failure) is correct. This ensures the generated
data never produces artifacts that would cause portal errors on load.

One implementation note: the `manifest.json` `artifacts` array must list the filenames
of the other artifacts in the same directory. The generator must build this list
dynamically based on which artifact files it writes per dashboard, not hardcode it.
This ensures `manifest.json` stays consistent with the actual files written.

---

## 6. Message Realism Strategy

**Assessment: Correct. XPath and OID messages are realistic and appropriate.**

The XPath failure messages match the format confirmed from the platform's DLQ
processing output. The OID strings in the MRN messages are valid HL7/DICOM OID
format (`2.16.840.1.113883.*`, `1.2.840.10008.*`).

**Privacy analysis confirmed:** OIDs are public standard identifiers (assigning
authority namespaces). Site names are publicly known healthcare provider organization
names. No patient-identifying information (name, DOB, SSN, MRN value, address) appears.
The plan's privacy analysis is correct.

The baseline → peak → remediation exception progression is well-designed:
- Baseline: 2–3 failure types at low counts
- Peak: 6–8 failure types at high counts
- Remediation: 1–2 at low counts

This guarantees that set-diff comparisons will show meaningful `added` and `removed`
arrays, exercising `CRITICAL_MANY_NEW_FAILURE_TYPES` and `WARNING_NEW_FAILURE_TYPE`
rules in the health classifier.

---

## 7. Site / Source Distribution

**Assessment: Correct. The top-site concentration pattern is realistic and demonstrable.**

The failure distribution follows the 60–70% concentration principle. The site rank
shift (UCHealth #1 in baseline → Castle Valley #1 in peak) is a realistic artifact
of source-specific regression and will produce visible movement in the Run Comparison
top_sites diff table.

The explicit data tables for baseline, peak, and remediation runs are the right level
of specification: they make the scenario story readable and verifiable without requiring
the reviewer to compute values.

---

## 8. Integration Strategy

**Assessment: Correct. Direct artifact write + publisher rebuild is the right design.**

The three alternatives are correctly evaluated:
1. Through the full publisher pipeline — rejected correctly (requires real Parquet data)
2. Raw JSON without rebuild — rejected correctly (run_history.json won't reflect new runs)
3. Direct write + rebuild functions — chosen correctly (minimal coupling, reuses tested code)

The idempotent clear-then-rebuild pattern is correct. The warning before deletion is
important UX for a script that has destructive first steps.

**Note 2 — Import path for publisher functions:**

The plan references:
```python
from src.publisher.main import _rebuild_run_history, _rebuild_platform_manifest
```

These are private functions (underscore-prefixed). If the publisher module does not
expose these publicly, the generator must either:
(a) Call them by their private names (acceptable for an internal script), or
(b) The implementation should verify that `_rebuild_run_history` and
    `_rebuild_platform_manifest` exist with the expected signatures before relying on them.

The implementation step should begin by reading `src/publisher/main.py` (or equivalent)
to confirm the exact function names and signatures before writing the generator script.
This is critical — if the functions are not importable as specified, the integration
strategy fails entirely.

---

## 9. Scope / Client / Environment Target

**Assessment: Correct and consistent with Section 4.**

Sections 4 and 9 agree: `contexture/local`, no new bootstrapping, `default/local`
preserved. The idempotency note correctly identifies the destructive-then-rebuild
pattern and warns the user.

---

## 10. File / Module Design

**Assessment: Correct. Single-file script with clear structure is appropriate for Phase 1.**

The function breakdown is clean:
- Data constants at the top (readable scenario definitions)
- `make_run_id` / `make_report_ts` — deterministic ID generation
- `build_trend_30d` — synthetic 30-day trend series
- `write_artifact` — validate + write (single responsibility)
- `write_run` — orchestrates artifact writing for one run
- `clear_scope_runs` — idempotent scope clearing
- `generate_scenario` — iterates runs within one scenario
- `main()` — entry point

This structure is correct. No premature abstractions, no over-engineering.

The CLI output format (progress lines per run with label, run_id, and key metric) is
well-designed — it makes the output human-readable and debuggable.

---

## 11. Verification Plan

**Assessment: Adequate with one correction.**

The shell commands for artifact existence verification are correct.

The portal verification steps are well-structured and cover:
- Run History display (8 rows — see Note 1 above for clarification)
- Run Detail (most recent run shows XPath failures)
- Run Comparison critical path (baseline→peak → Critical, peak→remediation → Healthy)
- AI analysis trigger
- pipeline_health data visible

The PHI grep check is correctly included and uses appropriate patterns.

**Correction:** Verification step 1 should specify:
```bash
# Navigate to http://localhost:5173/contexture/local/history
# Expected: run history shows 4 runs for dlq_operations, 4 for pipeline_health
# (not 8 rows on a single combined history page, unless the portal aggregates by scope)
```

---

## 12. Non-Goals

**Assessment: Well-bounded.**

All exclusions are correct and prevent scope creep. The explicit rejection of "seeded
random generation" is particularly important — hand-crafted data is more predictable
for demos than seeded random, even if seeded is deterministic.

---

## 13. Future Extensions

**Assessment: Appropriate for a Phase 1 plan.**

All extensions are genuinely future work and correctly deferred. The "reproducible
demo profiles" extension (`--profile=xpath_crisis`) is the most likely first extension
and is well-described.

---

## Summary Assessment

| Section | Status |
|---------|--------|
| Feature summary | ✓ Well-scoped; non-goals clear |
| Demo use cases | ✓ Health classification math verified; note on run history row count |
| Scenario model | ✓ Python literals; trend invariant needs documentation in implementation |
| Run design | ✓ 4-run arc correct; MRN health classification limitation noted and acceptable |
| Artifact types | ✓ Schema-compliant; manifest.json artifacts list must be dynamic |
| Message realism | ✓ XPath/OID messages are realistic; privacy analysis confirmed |
| Site distribution | ✓ Top-site concentration and rank shift are realistic |
| Integration strategy | ✓ Direct write + rebuild; publisher function signatures must be verified first |
| Scope target | ✓ `contexture/local`; idempotent; `default/local` preserved |
| File design | ✓ Single script; clean function breakdown |
| Verification plan | ✓ Covers all critical paths; run history count clarification needed |
| Non-goals | ✓ Well-bounded |
| Future extensions | ✓ Correctly deferred |

**Recommendation: APPROVED WITH TWO NOTES**

1. **Publisher function signatures must be verified before implementation.** Read
   `src/publisher/main.py` first to confirm `_rebuild_run_history` and
   `_rebuild_platform_manifest` exist with importable signatures. If the names or
   call signatures differ, adjust the integration strategy accordingly before writing
   the generator.

2. **Trend 30d invariant must be documented and implemented.** The `build_trend_30d`
   function must produce a series where the last 7 daily values sum to approximately
   `failures_last_7d`. Document this invariant in the function docstring. A simple
   implementation: distribute `failures_7d` across the last 7 days with slight
   variation, distribute remaining days proportionally for the preceding 23 days.
