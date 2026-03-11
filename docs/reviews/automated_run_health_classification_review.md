# Automated Run Health Classification — Plan Review

**Feature:** Automated Run Health Classification
**Plan artifact:** `docs/plans/automated_run_health_classification_plan.md`
**Date:** 2026-03-10
**Reviewer:** Claude Code
**Recommendation:** APPROVED WITH THREE NOTES

---

## 1. Feature Summary

**Assessment: Correct and well-bounded.**

The plan correctly defines the feature as a deterministic interpretation layer
on top of existing comparison outputs. The constraint "do NOT make the LLM the
classifier" is enforced throughout. The distinction between the existing deterministic
comparison tables (unchanged), the new deterministic health label (new), and the
optional AI explanation (unchanged) is clear throughout the plan.

---

## 2. Core Architecture

**Assessment: Correct. Three-stage pipeline is the right design.**

The pipeline stages are precisely defined:

1. `runDiff.js` comparators — unchanged, source of truth
2. `runHealth.js` classifier — new, reads from stage 1 output
3. `AnomalySummary` — unchanged, additive, user-triggered

The five-point rationale for deterministic classification over LLM classification
(reproducibility, auditability, testability, no hallucination, latency) is all
correct. Notably, the latency argument is significant: the health badge appears
synchronously as soon as comparison data loads. The AI panel requires user
interaction and 3–15s of inference time. Having an immediate authoritative label
is a material UX improvement.

---

## 3. Health Model

**Assessment: Correct. Five states are the right set.**

The plan justifies 5 states over 3 (loses Healthy/Unknown granularity) and
correctly notes that Unknown must not be conflated with Stable.

**Severity ordering (Critical > Warning > Stable > Healthy > Unknown):**

The plan assigns:
- Unknown: 0
- Healthy: 1
- Stable: 2
- Warning: 3
- Critical: 4

This ordering is sound. Unknown (0) below Healthy (1) is correct — Unknown means
"I cannot judge," not "things are good." Healthy (1) < Stable (2) is intentional:
"things improved" is less urgent for attention than "no change" is less urgent than
"things degraded."

**Aggregation rule (max severity wins):**

Correct. If failures decreased (Healthy) AND a new failure type appeared (Warning),
the result is Warning. Conservative, safety-first. This is the right default.

---

## 4. Input Contract

**Assessment: Correct. The public API (`classifyRunHealth(comparisons)`) is clean.**

Accepting the raw `comparisons` array from RunCompare and hiding normalization
inside `buildHealthInput()` is the right call. The caller (RunCompare.jsx) already
has `comparisons` in state — no new data fetching, no new props, minimal change.

The normalized internal shape is clearly documented. The `hasUsableData` flag
avoids ambiguity between "rules fired but found stable" vs "no data to evaluate."

---

## 5. Classification Rules

**Assessment: Correct. Seven rules are well-chosen for Phase 1.**

The rule set covers the key signal categories:
- Failure magnitude changes (4 summary rules)
- New failure category emergence (2 set-diff rules)
- Data quality issues (1 artifact error rule)

**Note 1 — Rule ordering and double-counting between summary and set-diff:**

`WARNING_NEW_FAILURE_TYPE` and `CRITICAL_MANY_NEW_FAILURE_TYPES` both examine the
`added` array. When `added.length >= 3`, both rules will trigger simultaneously.
The final classification will be Critical (correct — max severity wins), but
`triggered_rules` will contain both IDs and `reasons` will contain two entries for
the same event. This is potentially confusing in the UI.

**Recommendation:** Make the two rules mutually exclusive:
- `CRITICAL_MANY_NEW_FAILURE_TYPES`: triggers only when `added.length >= 3`
- `WARNING_NEW_FAILURE_TYPE`: triggers only when `added.length >= 1 AND added.length < 3`

This produces exactly one reason per event rather than two overlapping ones.
The implementor should apply this exclusion logic.

**Threshold values:**

The thresholds are reasonable starting points:
- 25% increase → Warning (catches meaningful spikes without being too sensitive)
- 100% increase → Critical (doubled = significant)
- 20% reduction → Healthy (meaningful improvement)
- 3 new failure types → Critical (significant scope expansion)

These are opinionated starting values. They are appropriate for Phase 1 with the
understanding that Phase 2 will introduce dashboard-specific overrides.

**Field name pattern (`"failure"` substring):**

Matching failure fields by name containing `"failure"` is correct for the current
dashboards (`failures_last_24h`, `failures_last_7d`). The plan correctly
notes this is explicit and matches known schemas. No concern.

**`WARNING_FAILURES_APPEARED` (base = 0 → target > 0):**

Correct and necessary. Ratio-based rules cannot handle a zero baseline. This rule
ensures the case isn't silently ignored.

**Unknown fallback (post-evaluation check):**

Correct. Checking `hasUsableData` after all rules run avoids the scenario where
no rules fire but `Stable` is returned even though no data was available to evaluate.

---

## 6. Output Contract

**Assessment: Correct. Four fields are sufficient for Phase 1.**

`classification`, `severity`, `reasons[]`, `triggered_rules[]` cover:
- Display (classification, severity for color coding)
- Explanation (reasons for humans)
- Programmatic use (triggered_rules for future filtering/alerting)

The guarantee that `classification` is never null is important — the badge must
always render something.

---

## 7. UI Integration

**Assessment: Correct. Run Comparison header badge is the minimal Phase 1 UI.**

The reasoning for restricting Phase 1 to RunCompare is sound: the comparison data
is already loaded, the classification is synchronous, no additional data fetching
is needed. Run History integration would require loading comparison data per row —
a different (and larger) feature.

**`HealthBadge.jsx` as a separate component:**

Correct. Even though it's a single `<span>`, extracting it as a reusable component:
1. Makes the RunCompare header JSX readable
2. Enables Phase 2 Run History integration without duplicating badge styles
3. Centralizes the theme token → classification mapping

The color mapping to existing theme tokens is correct:
- Critical → errorBg/errorText
- Warning → warningBg/warningText
- Stable → divider/textSecondary
- Healthy → successBg/successText
- Unknown → background/textMuted

---

## 8. Relationship to AI Summary

**Assessment: Correct. Clean separation of concerns.**

The plan correctly specifies that the AI panel cannot override the health label.
The layout (header badge → comparison tables → AI panel) maintains the correct
visual hierarchy: deterministic results are prominent, AI output is supplementary.

The Phase 2 opportunity (passing `triggered_rules` to the AI prompt) is a clean
extension path — the AI could explain why a rule triggered without being the one
deciding whether to trigger it.

---

## 9. Failure / Unknown Handling

**Assessment: Correct. All edge cases are covered.**

The edge case table is thorough. Particularly important:
- `delta === null` → rule skips the field (one side missing value)
- `base === 0, target === 0` → no rule fires (correct — no change)
- Unknown is not an error state (important for UX — comparison tables still show)

**Note 2 — `WARNING_ARTIFACT_ERROR` vs. `diffError`:**

The plan mentions treating `diffError` (compare function threw) the same as a fetch
error, triggering `WARNING_ARTIFACT_ERROR`. This is correct behavior, but the
implementation should check `c.diffError` as a separate condition from `c.bFetchError`
and `c.tFetchError` when building `artifactErrors`. The reason string should distinguish
between "fetch failed" and "comparison failed" for debugging clarity:

- bFetchError/tFetchError: `"Artifact fetch failed for: ${types}"`
- diffError: `"Comparison failed for: ${types}"`

Or combine them both under `WARNING_ARTIFACT_ERROR` with the artifact type listed
and let the raw error be available for debugging via the comparison table (which
already shows fetch errors inline).

Either approach is acceptable; the plan should be explicit about which is chosen.
The simplest Phase 1 choice: combine them both under a single reason string.

---

## 10. Files to Create / Modify

**Assessment: Minimal. Three new files, one modification.**

| File | Assessment |
|------|-----------|
| `portal/src/utils/runHealth.js` | Correct placement — utility, no React |
| `portal/src/utils/runHealth.test.js` | Pure function tests; no mocking needed |
| `portal/src/components/HealthBadge.jsx` | Small, reusable, correct placement |
| `portal/src/pages/RunCompare.jsx` | Minimal: compute `health` from `comparisons` after state loads; render badge |

No publisher changes. No new routes. No new artifact types. Correct.

---

## 11. Verification Plan

**Assessment: Adequate. 12 test cases cover all code paths.**

The test cases include:
- All 5 health states ✓
- Max severity aggregation (Warning wins over Healthy) ✓
- base = 0 edge cases ✓
- null delta skipping ✓
- artifact error handling ✓
- Unknown fallback ✓

**Note 3 — Missing test for `CRITICAL_MANY_NEW_FAILURE_TYPES` mutual exclusivity:**

Per Note 1, the plan recommends making the two new-failure-type rules mutually
exclusive. A test should verify that when `added.length >= 3`, only
`CRITICAL_MANY_NEW_FAILURE_TYPES` appears in `triggered_rules` (not both rules).
This test is straightforward to add and should be included.

---

## 12. Summary Assessment

| Section | Status |
|---------|--------|
| Feature framing | ✓ Deterministic interpretation layer; LLM excluded |
| Three-stage pipeline | ✓ Comparison → classification → AI (unchanged) |
| Health model (5 states) | ✓ Justified; Unknown distinct from Stable |
| Input contract | ✓ Takes raw comparisons; internal normalization |
| Classification rules (7) | ✓ Sound; note on mutual exclusivity of failure-type rules |
| Threshold constants | ✓ Reasonable; exported; Phase 2 configurable |
| Output contract | ✓ Four fields; classification always populated |
| UI integration | ✓ RunCompare header badge; HealthBadge.jsx reusable |
| AI relationship | ✓ Health is source of truth; AI is supplementary |
| Failure/Unknown handling | ✓ All edge cases addressed |
| Files to modify | ✓ Three new files, one modification |
| Verification plan | ✓ 12 test cases; all code paths covered |
| Non-goals | ✓ Well-bounded |

**Recommendation: APPROVED WITH THREE NOTES**

1. **Rule mutual exclusivity:** `WARNING_NEW_FAILURE_TYPE` should only trigger when
   `added.length >= 1 AND added.length < 3` to avoid double-reporting the same event
   when `CRITICAL_MANY_NEW_FAILURE_TYPES` fires. Add a corresponding test.

2. **`diffError` vs. fetch error distinction:** The implementation should consistently
   handle `diffError` (comparison function threw) the same as artifact errors. Choose
   one approach and document it: either combine with `WARNING_ARTIFACT_ERROR` (simpler)
   or add a separate `WARNING_COMPARISON_ERROR` rule (more precise). Phase 1 preference:
   combine for simplicity.

3. **Mutual exclusivity test:** Add an explicit test that verifies `triggered_rules`
   contains only `CRITICAL_MANY_NEW_FAILURE_TYPES` (not both failure-type rules) when
   `added.length >= 3`.
