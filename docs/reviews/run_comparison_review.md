# Run Comparison — Plan Review

**Feature:** Run Comparison
**Plan artifact:** `docs/plans/run_comparison_plan.md`
**Date:** 2026-03-09
**Reviewer:** Claude Code
**Recommendation:** APPROVED WITH MINOR NOTES

---

## 1. Feature Framing

The plan correctly identifies the gap: users can view individual run details but cannot
compare two runs side-by-side. The proposed feature is well-scoped — it answers specific,
actionable questions (did failures go up? which sites changed?) without attempting to become
a general-purpose diff tool.

The framing is honest about what Phase 1 is and is not.

---

## 2. Core Design Trick — Type-Specific Comparators

**Assessment: Sound. This is the right approach.**

The whitelist-of-comparators design is explicitly justified and the justification is correct:

- Each artifact type has a stable, validated schema (`src/publisher/validators/`)
- A generic diff would still require type-specific rendering anyway
- The whitelist is a forcing function: new comparators are added deliberately, with a
  clear schema contract, rather than discovered at runtime
- Failing gracefully for non-whitelisted types (raw file links) is the right default

The exclusion of `trend_30d` from Phase 1 is correct. A 30-day daily array comparison
produces noise (did day 14 change?) rather than signal. A meaningful trend comparison
requires chart overlay, which is a Phase 2 concern.

**No concerns.**

---

## 3. Route Design

**Assessment: Good. One implementation note.**

`/:client/:env/history/compare` with query parameters `?dashboard=&base=&target=` is the
right shape. Query parameters are semantically clearer than additional path segments for
two run IDs, and they produce bookmarkable, shareable URLs.

**React Router v6 rank-based matching:** The plan correctly notes that literal segment
`compare` outranks dynamic segment `:runId`. This should be verified during implementation
by confirming the route renders correctly when navigating to `/history/compare?...` — the
existing `history/:runId/:dashboardId` route must not intercept it.

**Minor note:** The plan shows route order as:
```jsx
<Route path="history/compare" element={<RunCompare />} />
<Route path="history/:runId/:dashboardId" element={<RunDetail />} />
<Route path="history" element={<RunHistory />} />
```
React Router v6 rank-based matching makes the explicit order non-critical, but preserving
this order in the implementation is a useful readability signal for future contributors.

**No blocking concerns.**

---

## 4. Data Flow

**Assessment: Correct and complete.**

The two-phase loading approach (first `run_history.json`, then artifact files in parallel
via `Promise.allSettled`) is the right pattern:

- `run_history.json` is the canonical source of artifact metadata — consistent with how
  `RunHistory` and `RunDetail` both use it
- `Promise.allSettled` prevents a single failed artifact fetch from blocking the entire
  page — graceful degradation per artifact
- Artifact paths are taken from `artifact.path` (publisher-owned) — consistent with the
  portal guardrail that the portal never constructs artifact paths

**One concern:** The plan fetches artifacts directly from `artifact.path` for historical
run artifacts (under `runs/`). This is correct for comparison purposes — both the base and
target artifacts are historical. The `useArtifactPath` hook (which points to `current/`)
is correctly excluded.

---

## 5. Comparator Designs

**Assessment: Appropriate for Phase 1. One schema clarification needed.**

### `summary` comparator

Comparing numeric fields with explicit field lists per dashboard (`failures_last_24h`,
`failures_last_7d` for `dlq_operations`; `total_documents`, `total_failures`, `failure_rate`,
`sites_affected` for `pipeline_health`) is the right approach.

**Implementation concern:** The comparator in `runDiff.js` needs to handle the case where
a field is present in one summary but not the other (schema drift over time, or comparing
runs from different schema versions). The plan implies numeric comparison but does not
address this edge case explicitly. Implementation should guard: skip fields not present
in both objects.

### `top_sites` / `exceptions` / `failure_types` comparators

The set-diff pattern (added, removed, changed, unchanged) is correct and reusable across
all three types. The plan's output structure is clear and implementable.

**Schema verification needed:** The exact key field for each type (e.g., `site` for
`top_sites`, the exception type key for `exceptions`) should be confirmed against the
actual validator schemas (`src/publisher/validators/`) during implementation. These are
not defined in the plan — implementor must check.

---

## 6. UI Structure

**Assessment: Appropriate. Consistent with existing pages.**

The card-based layout, theme color conventions (errorText for increases, successText for
decreases, warningBg for new items), and back link to RunHistory are all consistent with
`RunDetail.jsx` patterns.

**One design note:** The plan proposes a "ARTIFACTS NOT COMPARED" section for non-whitelisted
types. This is the correct default. However, `trend_30d` is a first-class artifact that
users may want to view — the raw file links in this section should make that accessible.
The plan already specifies "links to both raw files (if available)" — this is sufficient.

**No blocking concerns.**

---

## 7. Missing Artifact Handling

**Assessment: Comprehensive. All seven cases are covered.**

Cases 1–7 cover the full matrix of missing/failed artifact scenarios. `Promise.allSettled`
as the fetch strategy (Case 5) correctly handles network failures without blocking other
sections.

Case 7 (dashboard param doesn't match either run's dashboard_id) being treated as "run not
found" is correct and conservative — it avoids silently rendering a comparison with
mismatched dashboard context.

---

## 8. Multi-Client / Multi-Environment Scope

**Assessment: Correct. No scope leakage possible.**

`useParams()` for client/env and `useSearchParams()` for comparison params is the right
split. All fetches are scoped to the URL client/env. The design correctly notes that
mixing runs from different scopes is impossible — both base and target must be found in
the same `run_history.json`.

This is consistent with the routing guardrails in `docs/architecture/portal-routing.md`.

---

## 9. Entry Points

**Assessment: Good. RunHistory is the primary entry point.**

The plan specifies entry points in both `RunHistory` (row-level comparison affordance) and
`RunDetail` (compare with another run). The exact UI for the RunHistory entry point is
deferred to implementation — a checkbox-select flow or a "Compare with..." dropdown are
both viable. The plan correctly does not over-specify this.

**One note:** The RunDetail "compare with another run" entry point is slightly ambiguous —
how does the user select the second run? The plan says "prompts for target" but doesn't
specify the mechanism. Acceptable to defer this detail to implementation, but the simplest
approach is to navigate to `/:client/:env/history` with the current run pre-selected as
base, allowing the user to pick target from the list.

---

## 10. Files to Create / Modify

**Assessment: Minimal and correct.**

| File | Assessment |
|------|------------|
| `RunCompare.jsx` | New file — appropriate |
| `runDiff.js` | New utils file — appropriate; no utils directory exists yet, will be created |
| `App.jsx` | One route addition — minimal change |
| `RunHistory.jsx` | Entry point addition — small, contained |
| `RunDetail.jsx` | Entry point addition — small, contained |

All dashboard components, hooks, and publisher files are correctly listed as unchanged.

---

## 11. Verification Plan

**Assessment: Adequate for Phase 1.**

The 11 manual test scenarios cover the key functional paths including error states,
deep-linking, and edge cases (same run compared to itself, missing params). The build
test is the minimal CI check. Schema contract test is a useful sanity check.

**Gap:** No automated unit tests for `runDiff.js` comparator functions are specified.
The comparators are pure functions (input → output, no side effects) and are ideal for
unit testing. Recommended addition:

```bash
# vitest or jest — test comparators with known fixture inputs
# e.g., compareSummary({ failures_last_24h: 18 }, { failures_last_24h: 22 }) → delta: +4
```

This is not blocking for Phase 1, but should be noted for implementation.

---

## 12. Non-Goals

**Assessment: Correct and well-reasoned.**

The six excluded items are the right boundaries for Phase 1:
- Generic recursive diff — correctly excluded
- Cross-dashboard comparison — incompatible schemas
- Cross-scope comparison — isolated run_history.json files make this undefined
- `trend_30d` — deferred, not removed
- AI insights — correct layer separation (would be an artifact, not portal logic)
- Multi-run comparison — complexity/value ratio too high for Phase 1

---

## Summary Assessment

| Section | Status |
|---------|--------|
| Feature framing | ✓ Clear and well-motivated |
| Design trick (type whitelist) | ✓ Correct approach, well-justified |
| Route design | ✓ Good; verify RR6 rank matching in implementation |
| Data flow | ✓ Correct; `Promise.allSettled` is right pattern |
| Comparator designs | ✓ with note: verify exact schema key fields against validators |
| UI structure | ✓ Consistent with existing pages |
| Missing artifact handling | ✓ All seven cases covered |
| Multi-client/env scope | ✓ No scope leakage |
| Entry points | ✓ Both specified; RunDetail mechanism can be clarified at implementation |
| Files to modify | ✓ Minimal and correct |
| Verification | ✓ with note: add unit tests for `runDiff.js` comparators |
| Non-goals | ✓ Well-bounded |

**Recommendation: APPROVED WITH MINOR NOTES**

Implementation may proceed. Notes to carry forward:
1. Guard `summary` comparator against fields missing from one or both objects
2. Verify exact key field names for `top_sites`, `exceptions`, `failure_types` against validators before coding comparators
3. Add unit tests for `runDiff.js` pure functions
4. Clarify RunDetail entry point UX at implementation time (simplest: link to history with current run pre-selected as base)
