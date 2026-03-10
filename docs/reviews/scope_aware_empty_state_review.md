# Scope-Aware Empty-State Polish — Plan Review

**Feature:** Scope-Aware Empty-State Polish
**Plan artifact:** `docs/plans/scope_aware_empty_state_plan.md`
**Date:** 2026-03-10
**Reviewer:** Claude Code
**Recommendation:** APPROVED WITH TWO NOTES

---

## 1. Feature Summary

**Assessment: Correct and well-scoped.**

The plan correctly identifies the problem: the existing "file not found" error
branch produces developer-facing messages with hardcoded values. The fix is a
narrow UX polish: change one branch in each page's fetch function, add one
reusable component. No architectural change.

---

## 2. Detection Strategy

**Assessment: Correct. Uses existing detection without adding new requests.**

The existing check in all pages already correctly identifies "scope has no
artifacts yet":

```js
// run_history.json pages
if (!res.ok || !contentType.includes("application/json")) { ... }

// dashboard pages
if (!manifestRes.ok) { ... }
```

The Vite SPA fallback (index.html as HTTP 200 + text/html) and production 404
are both caught by this check. No new network request, no filesystem inference,
no new detection logic is required.

**The `isEmptyScope` boolean approach is correct:** it splits the existing single
`error` catch-all into two output paths:
1. `isEmptyScope = true` → `ScopeEmptyState` (neutral, instructional)
2. `error = "..."` → existing red error box (all other errors)

This is the minimal change needed.

---

## 3. Pages in Scope — All Five in Phase 1

**Assessment: Correct recommendation.**

Including all five pages in Phase 1 is justified:
- Cost per page: ~6–10 lines (one boolean state, one import, one early return)
- Benefit: symmetric experience regardless of which tab is active when the
  user switches to an empty scope
- Detection is already isolated in all pages — no new detection complexity

The argument for deferring dashboard pages is weak: the code change is nearly
identical to the history pages, and the inconsistency would be user-visible.

**No concerns.**

---

## 4. Reusable `ScopeEmptyState` Component

**Assessment: Correct choice. One implementation note.**

A shared component is the right call — five pages, same content, same style.
Props `{ client, env }` passed from `useParams()` in each page is clean.

**Note 1 — `useParams()` in dashboard pages:**

The plan correctly identifies that `DlqOperations.jsx` and `PipelineHealth.jsx`
currently do not directly call `useParams()` — they use `useArtifactPath()` which
calls it internally. Implementation must add:

```js
const { client, env } = useParams();
```

to each dashboard component. This is a one-line addition. The hook is already
imported or co-located in the component tree. No concern, but implementors should
verify the import (`from "react-router-dom"`) is present or added.

---

## 5. Empty-State Message Design

**Assessment: Correct tone and content.**

The message template:
```
No artifacts found for  contexture / local

This scope has not been bootstrapped yet.
Run the following command to initialize it:

  publisher bootstrap --client contexture --env local
```

- Scope-aware: client/env from `useParams()`
- Actionable: exact `publisher bootstrap` command (correct Phase 1 onboarding path)
- Non-scary: neutral visual style (not red)
- Does not reference `python src/publisher/main.py` or per-dashboard `publisher run`
  (correctly points to bootstrap as the onboarding command)

**No concerns.**

---

## 6. Detection Rules by Page Type

**Assessment: Correct for all five pages. One clarification for RunDetail.**

**RunHistory:** Correct. The empty state fires on first-fetch failure; the
"no runs yet" case (valid JSON, `runs.length === 0`) is explicitly preserved as
the existing empty-state — this distinction is important and the plan gets it right.

**RunDetail:** Correct. `isEmptyScope` fires on `run_history.json` not-found.
"Run not found" (valid history, run not in list) correctly falls through to the
generic error. The plan preserves the back link above the empty state — good UX.

**RunCompare:** Correct. `isEmptyScope` fires on `run_history.json` not-found.
Per-artifact `renderMissingNote()` handling is unchanged — it fires only after a
valid history is loaded, so it doesn't conflict with the empty-scope path.

**Note 2 — RunCompare query param validation:**

`RunCompare.jsx` currently checks for missing required query params (`dashboard`,
`base`, `target`) before fetching `run_history.json`. This check must remain
before the `isEmptyScope` path. If params are missing, the page should show the
existing "Missing required query parameters" error, not `ScopeEmptyState`. The
plan implies this ordering is preserved (it doesn't change the param check), but
implementors should verify the ordering: param check → fetch → empty-scope check.

**Dashboard pages:** Correct. `isEmptyScope` fires on `!manifestRes.ok` (first
fetch). Secondary errors (publisher failure, missing artifact, payload not found)
fall through to the generic error as before.

---

## 7. Visual Style

**Assessment: Correct approach — neutral, not red.**

Using `theme.background` / `theme.border` / `theme.textSecondary` for the empty
state is the right call. It signals "expected state" rather than "unexpected error".
The existing `errorBox` (red background, red border) is preserved for genuine errors.

---

## 8. Bootstrap Command Integration

**Assessment: Correct. Instructional only, no interactive behavior.**

Showing `publisher bootstrap --client <client> --env <env>` as a static code
block is the right approach for this platform. No button, no backend call, no
clipboard API. The portal is read-only.

---

## 9. Files to Create / Modify

**Assessment: Minimal and correct.**

| File | Status |
|------|--------|
| `portal/src/components/ScopeEmptyState.jsx` | New — correct |
| 5 modified pages/dashboards | Each is a minimal change to one branch |
| Routing, artifact contracts, publisher | Unchanged — correct |

---

## 10. Verification Plan

**Assessment: Adequate.**

The 8 manual test cases cover:
- Valid scope (no regression)
- Empty scope on all affected page types
- Scope bootstrapped → page renders normally
- Run not found inside valid scope (does NOT show ScopeEmptyState)
- Compare with bad params inside valid scope (does NOT show ScopeEmptyState)

These are the critical distinctions. The build and test checks are correct.

**One gap:** The verification plan does not test the case where the user switches
scope via the selector while on a dashboard page and lands on the empty state, then
uses the selector to switch back to a valid scope. This is the primary UX flow the
feature is designed to support. It should be verified manually but is not blocking
— the routing and selector are unchanged, and if the empty-state renders correctly
the back-navigation will work by definition.

---

## Summary Assessment

| Section | Status |
|---------|--------|
| Feature framing | ✓ Correct — UX polish, not architecture change |
| Detection strategy | ✓ Reuses existing checks; no new requests |
| Pages in scope | ✓ All five in Phase 1; justified |
| Reusable component | ✓ `ScopeEmptyState` with `{ client, env }` props |
| Message design | ✓ Scope-aware; references `publisher bootstrap` |
| Detection rules by page | ✓ Correct; empty-scope vs other errors clearly separated |
| Visual style | ✓ Neutral, not red |
| Bootstrap integration | ✓ Instructional only |
| Files to modify | ✓ Minimal (1 new + 5 modified) |
| Verification | ✓ Adequate; one gap (selector → empty → back navigation) |
| Non-goals | ✓ Well-bounded |

**Recommendation: APPROVED WITH TWO NOTES**

The plan is sound, minimal, and architecturally correct. Proceed to implementation
with these notes:

1. **`useParams()` in dashboard pages:** Add `const { client, env } = useParams()`
   explicitly to `DlqOperations.jsx` and `PipelineHealth.jsx`. Verify
   `react-router-dom` import is present in both files.

2. **RunCompare query param check ordering:** Ensure the existing "missing required
   params" check executes before the `run_history.json` fetch and the `isEmptyScope`
   path. The empty-scope state must not fire if query params are missing — that is
   a different error class.
