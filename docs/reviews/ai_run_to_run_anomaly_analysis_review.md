# AI Run-to-Run Anomaly Analysis — Plan Review

**Feature:** AI Run-to-Run Anomaly Analysis
**Plan artifact:** `docs/plans/ai_run_to_run_anomaly_analysis_plan.md`
**Date:** 2026-03-10
**Reviewer:** Claude Code
**Recommendation:** APPROVED WITH FOUR NOTES

---

## 1. Feature Summary

**Assessment: Correct and well-bounded.**

The plan correctly frames the feature as an explanation layer, not a replacement for
deterministic comparison. The explicit statement "deterministic diff first, LLM
explanation second" is the correct architectural requirement and is carried consistently
through every section of the plan.

The non-goals list is comprehensive and correctly excludes free-form chat, cross-scope
comparison, and autonomous scanning. This prevents scope creep before implementation begins.

---

## 2. Core Architecture

**Assessment: Correct. Two-stage pipeline is the right design.**

The pipeline description is precise:

1. `runDiff.js` comparators produce structured diff objects (existing, unchanged)
2. `buildAnomalyPayload()` normalizes the diff into a compact LLM input (new, pure function)
3. `ollamaClient.js` calls Ollama, handles errors (new, isolated)
4. `AnomalySummary.jsx` renders the result (new, additive)

The key architectural insight is correct: the payload the LLM receives contains
**already-computed deltas**, not raw artifact data. The LLM cannot alter the numbers
shown in the comparison tables. This is the right safety invariant.

**The five rationale points for this design (Section 2) are all valid:**
- Token budget — correct; raw artifacts are O(KB), payload is O(dozens of fields)
- Determinism preserved — correct; LLM sees the same numbers the user sees
- Prompt stability — correct; bounded schema → more consistent output
- No hallucination of metrics — correct; numbers are pre-computed
- Testability — correct; `buildAnomalyPayload()` is a pure function

---

## 3. Scope of Phase 1

**Assessment: Correct. Appropriately minimal.**

The Phase 1 table is well-drawn. The most important constraints are:
- Same dashboard/client/env (existing URL and query param enforcement)
- Whitelisted artifact types only (existing `COMPARE_WHITELIST`)
- On-demand trigger (user clicks button)
- Local Ollama only

**Note 1 — trend_30d exclusion:**

`trend_30d` is correctly excluded from the `COMPARE_WHITELIST` already (per
`runDiff.js` comment: "comparing daily time-series arrays row-by-row produces noise
rather than signal"). The anomaly payload correctly inherits this exclusion by
deriving its structure from the whitelist comparators. No special handling needed.

---

## 4. Input Contract to the LLM

**Assessment: Correct. Compact and well-structured.**

The payload schema is minimal and appropriate. Key design decisions are sound:

- `missing_artifacts` field communicates data gaps honestly — LLM should not hallucinate
  about artifacts that weren't available for comparison
- `unchanged` items from `compareByKeyCount` could be trimmed from the payload (they
  add token cost with no interpretive value). The plan's text mentions "unchanged items
  trimmed from context" but the schema example doesn't show this explicitly. Implementors
  should exclude the `unchanged` array from each diff section before sending.
- Field order is logical (summary first, then per-artifact diffs)

**No concern on the input contract.**

---

## 5. Output Contract from the LLM

**Assessment: Correct. Four-field structure is appropriate.**

The four-field JSON output (`summary`, `notable_changes`, `likely_anomalies`, `caveats`)
is well-chosen:
- Short enough for the model to produce reliably
- Rich enough to be useful to the user
- `caveats` field enforces honest labeling of AI output

**`format: "json"` and structured output:**

Ollama's `format: "json"` parameter instructs the model to return valid JSON syntax.
This is a syntax constraint, not a schema constraint — the model may return valid JSON
that doesn't match the expected four fields. The plan correctly addresses this: if
`JSON.parse` succeeds but the fields are missing or malformed, `AnomalySummary.jsx`
should handle missing fields gracefully (show "N/A" or omit the section) rather than
crashing.

**Note 2 — Schema validation on LLM output:**

The plan recommends a `JSON.parse` fallback for malformed output, but does not
explicitly handle the case where JSON parses successfully but fields are wrong types
or missing. `AnomalySummary.jsx` should guard each field individually:

```js
const summary         = typeof result.summary === "string" ? result.summary : null;
const notableChanges  = Array.isArray(result.notable_changes) ? result.notable_changes : [];
const likelyAnomalies = Array.isArray(result.likely_anomalies) ? result.likely_anomalies : [];
const caveats         = typeof result.caveats === "string" ? result.caveats : null;
```

This ensures graceful rendering even when the model partially follows the schema.
The implementor should add these guards.

---

## 6. Ollama Integration Strategy

**Assessment: Correct. Browser → Ollama localhost is the right Phase 1 approach.**

The CORS analysis is correct: Ollama allows same-machine localhost requests by default
(CORS origin `*` or explicit localhost allowlist depending on version). A Vite dev
server fetch from `localhost:5173` to `localhost:11434` works without a proxy.

**Comparison table (Section 6) is accurate and well-reasoned.** The recommendation
to use local Ollama for Phase 1 is correct given:
- Data privacy (analytics data stays local)
- No cost
- No dependencies on external services during development
- Already installed on the developer machine

**`temperature: 0.1` is correct** for structured JSON summarization. Low temperature
produces more consistent output and reduces hallucination risk.

**`format: "json"` usage is correct** — this is the standard Ollama parameter for
constraining output to valid JSON syntax.

**Note 3 — Ollama CORS configuration:**

Some Ollama versions or system configurations may require explicit CORS configuration
for cross-origin browser requests. The default allows localhost, but if the developer
encounters CORS errors, they may need to set `OLLAMA_ORIGINS=*` environment variable
before starting Ollama. The plan should note this as a known setup variation:

```bash
# If browser receives CORS error from Ollama:
OLLAMA_ORIGINS=* ollama serve
```

This is a one-line troubleshooting note, not a design change.

---

## 7. Trigger Model

**Assessment: Correct. On-demand button is the right Phase 1 trigger.**

The rationale is sound. Precomputed inference would:
- Add 5–15s to every publisher run (unacceptable for interactive development)
- Generate analyses for run pairs no one ever views
- Require publisher → Ollama dependency (violates static platform principle)

On-demand inference:
- User gets analysis only when wanted
- No publisher changes needed
- No latency impact on comparison page load

**UI flow description is clear and implementable.**

---

## 8. UI Integration

**Assessment: Correct. Bottom-of-page panel is the minimal, non-disruptive integration.**

Placing `AnomalySummary` after all comparison tables is correct:
- Deterministic comparison is always visible immediately on page load
- AI panel is clearly secondary — rendered below the primary content
- "Re-analyze" button allows the user to re-run if they want a second opinion

The wireframe mockups in Section 8 are clear and sufficient for implementation.

The plan correctly specifies reusing existing `card`, `cardTitle`, and `theme` styles
— no new styling infrastructure needed.

---

## 9. Failure Handling

**Assessment: Correct. All expected failure modes are covered.**

The failure table covers:
- Ollama not running (network error) ✓
- Model not pulled (HTTP error from Ollama) ✓
- Inference timeout (AbortController) ✓
- Malformed JSON output (JSON.parse catch → raw text fallback) ✓
- Empty response ✓
- Deterministic comparison failure (AI panel never mounts) ✓

**Note 4 — Timeout value:**

The plan specifies 30s timeout. For a 3B model (llama3.2), 30s is generous on modern
hardware (typical: 2–5s). For a 7B model on slower hardware, 30s may be insufficient.

Recommendation: use 45s as the default timeout, and document it as a configurable
constant in `ollamaClient.js` alongside `OLLAMA_MODEL`. Users with fast hardware
can reduce it; users with slow hardware can increase it.

---

## 10. Privacy / Safety / Reliability

**Assessment: Correct. The privacy argument for local inference is well-made.**

The "deterministic comparison remains source of truth" invariant is correctly described
and is enforced by architecture (LLM sees computed deltas, not raw data). The plan
correctly requires the `caveats` field to always be displayed.

The guidance to set `temperature: 0.1` and include "do not speculate about root causes"
in the prompt is appropriate for this use case.

---

## 11. Files to Create / Modify

**Assessment: Minimal. Four files total (3 new, 1 modified).**

| File | Assessment |
|------|-----------|
| `portal/src/utils/anomalyPayload.js` | Correct placement — pure utility, testable |
| `portal/src/utils/ollamaClient.js` | Correct isolation — all Ollama specifics in one file |
| `portal/src/components/AnomalySummary.jsx` | Correct — component owns its state |
| `portal/src/pages/RunCompare.jsx` | Minimal modification — add one component at bottom |

No publisher changes in Phase 1. No new routes. No new artifact types. Correct.

---

## 12. Verification Plan

**Assessment: Adequate. Covers all required cases.**

The unit test plan for `anomalyPayload.test.js` is correct: pure function tests
can run without any Ollama dependency.

The manual test plan covers:
- Deterministic comparison without Ollama ✓
- Successful analysis with Ollama ✓
- Malformed output fallback ✓
- Timeout fallback ✓
- Scope enforcement ✓

One addition: the verification plan should include explicitly testing the
**partial schema** case (LLM returns valid JSON but missing one or more expected
fields). This validates the per-field guards recommended in Note 2.

---

## 13. Summary Assessment

| Section | Status |
|---------|--------|
| Feature framing | ✓ Explanation layer; not source of truth |
| Two-stage pipeline | ✓ Deterministic diff → LLM explanation |
| Phase 1 scope | ✓ Minimal; bounded; correct exclusions |
| Input contract | ✓ Compact, derived from existing comparators |
| Output contract | ✓ Four-field JSON; fallback for malformed output |
| Ollama strategy | ✓ Browser → localhost; no backend needed |
| Trigger model | ✓ On-demand button; no precompute |
| UI integration | ✓ Bottom-of-page panel; reuses existing styles |
| Failure handling | ✓ All failure modes covered; comparison unaffected |
| Privacy / safety | ✓ Local inference; determinism preserved; labeled AI output |
| Files to modify | ✓ Four files; no publisher changes |
| Verification | ✓ Unit tests + manual cases |
| Non-goals | ✓ Well-bounded |

**Recommendation: APPROVED WITH FOUR NOTES**

Proceed with these notes addressed during implementation:

1. **trend_30d exclusion:** Confirmed correct; `unchanged` arrays should be trimmed
   from the payload before sending to reduce token count.

2. **Per-field output guards:** `AnomalySummary.jsx` should guard each field of the
   LLM JSON response individually (not just `JSON.parse`) to handle partial schema
   compliance gracefully.

3. **Ollama CORS note:** Document `OLLAMA_ORIGINS=*` as a known setup variation in
   a comment near the `ollamaClient.js` fetch call.

4. **Timeout constant:** Use 45s as the default timeout; make it a named constant in
   `ollamaClient.js` alongside `OLLAMA_MODEL`.
