# Demo Hardening Pass and Demo Scenario Guide — Plan Review

**Feature:** Demo Hardening Pass and Demo Scenario Guide
**Plan artifact:** `docs/plans/demo_hardening_and_scenarios_plan.md`
**Date:** 2026-03-10
**Reviewer:** Claude Code
**Recommendation:** APPROVED WITH ONE NOTE

---

## 1. Hardening Goals

**Assessment: Correct and well-categorized.**

The four hardening categories (Correctness, UI coherence, Repeatability, No regressions)
cover all meaningful failure modes. The no-regressions category is particularly
important — the generator clears `contexture/local/runs/` but must not touch
`default/local/`. The plan correctly calls this out.

The "no stale cache issues in dev" item under Repeatability is a practical concern
with Vite's dev server: artifact JSON is served as static files and may be cached
in the browser. The fix (hard-refresh) is documented in the troubleshooting section
of the demo guide. No code change is needed.

---

## 2. Demo Validation Checklist

**Assessment: Correct and executable. All 10 checks are well-defined.**

Each check has a specific URL, expected state, and measurable pass criteria. A person
with no prior context can execute this checklist in approximately 10 minutes.

**URL accuracy verification:**

The plan uses the following compare URL format:
```
/{client}/{env}/history/compare?dashboard={dashboardId}&base={baseRunId}&target={targetRunId}
```

This matches the route defined in `App.jsx` (`history/compare`) and the `compareUrl()`
function in `RunHistory.jsx` which builds:
```js
`/${client}/${env}/history/compare?${params.toString()}`
// params: { dashboard, base, target }
```
The URLs in Checks 3, 4, and 5 are correct. ✓

**Health badge predictions verification:**

- Check 3 (baseline→sustained_peak, dlq_operations): failures_24h 8→89, ratio=10.1 > 1.0 → `CRITICAL_FAILURE_SPIKE` → **Critical** ✓
- Check 4 (peak→remediation, dlq_operations): failures_24h 89→11, ratio=−0.876 < −0.20 → `HEALTHY_FAILURE_REDUCTION` → **Healthy** ✓
- Check 5 (MRN degradation→remediation): `total_documents_last_24h` and `active_sites_last_24h` do not contain "failure" → summary rules skip them; `failure_types` diff shows items *removed*, not added → no warning rules fire → **Stable** ✓

**Check 6 (AI analysis graceful failure):**
The plan correctly requires that "Ollama not running" produces a graceful error state,
not a crash. This is verified by the `OllamaError` type system in `ollamaClient.js`.
The check implicitly validates the error boundary behavior.

**Check 8 (empty state for unknown scope):**
This is an important regression check. The portal's `usePlatformManifest` hook and
scope-aware empty states should handle an unknown scope without a JS exception.
The check is correctly included.

**One minor gap:** There is no explicit check that verifies Run Detail for a
`pipeline_health` run (only the `dlq_operations` Run Detail is checked in Check 2).
This is acceptable for a first demo pass — the failure risk is low since both
dashboards use the same Run Detail page component with the same artifact-fetch pattern.
A thorough hardening pass would add it, but it is not a blocking gap for Phase 1.

---

## 3. Demo Scenario Guide

**Assessment: Correct and appropriately complete for a demo guide.**

The planned contents of `docs/demo/demo-scenarios.md` are well-structured for
the intended audience (developer, PM, or client-facing presenter). The key elements:

**Story framing:** Providing a one-sentence narrative per scenario ("A new source
organization deploys with a CCD template variant...") is essential for a live demo.
The presenter needs to know what the story is, not just the numbers.

**Run progression tables:** The 4-column table (run ID, label, date, key metrics)
gives the presenter an at-a-glance reference. Including the story column in the table
is the right design — the presenter can narrate directly from it.

**Recommended comparisons with direct URLs:** Pre-computed direct URLs eliminate
navigation errors during a live demo. A presenter who types the wrong run ID live
creates an awkward pause. The URLs in the plan are verified correct (see Section 2).

**Health badge predictions in the comparisons table:** Correct and verified. The
presenter knows what badge to expect before clicking, which prevents a "why does
it say Stable?" moment.

**Note 1 — MRN health badge explanation for presenter:**

The plan correctly notes that `pipeline_health` comparisons will show `[Stable]` for
summary-level health because `total_documents_last_24h` and `active_sites_last_24h`
are not failure-named fields. This is an important talking point: the demo guide
explains this as a Phase 1 limitation and frames it as a "dashboard-specific rule
overrides in Phase 2" opportunity.

This explanation must appear clearly in `docs/demo/demo-scenarios.md` — not as a
footnote, but as a clearly-labeled "Presenter note" callout. The plan identifies
this correctly.

**AI summary click path:** The plan specifies which comparison to use (baseline vs
sustained_peak) and what the expected output mentions (XPath failures, Castle Valley,
spike). This is correct — this comparison produces the richest AI signal (large delta
in failures, 4+ new exception types, named provider organizations). The AI section
also correctly handles the "Ollama not running" case.

**Troubleshooting table:** All five troubleshooting items are practical and correct.
The `OLLAMA_ORIGINS=* ollama serve` command for the CORS workaround is accurate.

---

## 4. Files to Create / Modify

**Assessment: Minimal and correct.**

Three files: two plan/review artifacts (already written) and one new guide document.
No portal changes. The creation of `docs/demo/` as a new directory is correct —
the demo guide is documentation, not code.

---

## 5. Non-Goals

**Assessment: Well-bounded.**

All exclusions are appropriate. The explicit exclusion of "portal code changes"
deserves a small clarification: if the hardening checklist reveals a bug (e.g., a
blank state where there should be data, or a health badge color mismatch), fixing
that bug is within scope even though the plan says "no portal code changes." The
non-goal correctly says the hardening pass *may surface bugs* and fixing them is
tracked separately *unless trivial*. This is the right framing.

---

## 6. Verification

**Assessment: Clear exit criterion.**

The four-point verification criterion is correct. "Readable by a non-developer
presenter in under 5 minutes" is an appropriate quality gate for a demo guide — it
ensures the document is actionable, not just technically complete.

---

## Summary Assessment

| Section | Status |
|---------|--------|
| Hardening goals | ✓ Four categories; no regressions check included |
| Validation checklist | ✓ 10 checks; URLs verified correct; badge predictions verified |
| Demo scenario guide contents | ✓ Story framing, run tables, direct URLs, AI path, troubleshooting |
| Files to create | ✓ Three files; no portal changes |
| Non-goals | ✓ Well-bounded; portal bug fix caveat correctly scoped |
| Verification | ✓ Clear exit criterion |

**Recommendation: APPROVED WITH ONE NOTE**

1. **MRN health badge explanation must be a prominent presenter callout** in
   `docs/demo/demo-scenarios.md`, not a footnote. The `[Stable]` badge for
   `pipeline_health` comparisons is technically correct behavior, but a presenter
   who expects a `[Warning]` badge will be confused without a clear explanation.
   The guide should include a clearly-labeled block (e.g., **Presenter note:** or
   **Why Stable?**) explaining the Phase 1 failure-field heuristic and framing
   Phase 2 dashboard-specific overrides as the roadmap item.
