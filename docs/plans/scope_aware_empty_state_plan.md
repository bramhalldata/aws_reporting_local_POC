# Scope-Aware Empty-State Polish — Implementation Plan

**Feature:** Scope-Aware Empty-State Polish
**Output artifact:** `docs/plans/scope_aware_empty_state_plan.md`
**Date:** 2026-03-10
**Status:** Draft — pending review

---

## Context

The client/environment selector lets users navigate to any configured scope. A
configured scope may not yet have artifacts (the scope exists in `SCOPES` config
but `publisher bootstrap` has not been run for it). Currently all pages show a
generic red error box with developer-oriented messages such as:

```
Error: run_history.json not found. Run the publisher first: python src/publisher/main.py
```

or for dashboard pages:

```
Error: manifest.json not found (HTTP 404). Run the publisher first:
publisher run --env local --dashboard dlq_operations
```

These messages are:
- Hardcoded env/client (not scope-aware)
- Developer-facing, not operator-facing
- Visually identical to real errors (network failure, malformed JSON)
- Missing the `bootstrap` command introduced in the previous feature

---

## 1. Feature Summary

Replace the generic "file not found" error condition on all scoped pages with a
distinct, scope-aware empty-state block that:

- names the current client/env from `useParams()`
- explains that no artifacts exist yet for this scope
- provides the exact bootstrap command to fix it

All other error types (malformed JSON, run not found, network failure) continue
to display the existing generic error box.

---

## 2. UX Goals

| Goal | Behavior |
|------|---------|
| Clear explanation | "No artifacts found for `contexture / local`" — not a raw file path |
| Scope-aware | Client and env are pulled from `useParams()` — not hardcoded |
| Actionable | Shows exact `publisher bootstrap --client <client> --env <env>` command |
| Non-scary | Visually distinct from error (neutral/muted, not red) |
| Architecturally transparent | Selector and NavBar remain visible — user can switch scope without refresh |
| Minimal | Does not change routing, artifact contracts, or selector logic |

---

## 3. Detection Strategy

### The key signal: first-fetch failure

All scoped pages follow the same two-phase load pattern:

1. **Fetch a primary file** — `run_history.json` (history/detail/compare) or
   `manifest.json` (dashboard pages)
2. Validate it is real JSON (content-type + HTTP status check)

The Vite SPA fallback returns `index.html` with HTTP 200 and `content-type: text/html`
for any missing static file. In production (CloudFront), missing files return HTTP 404.
The existing check in every page already catches both:

```js
if (!res.ok || !contentType.includes("application/json")) {
  // file is missing — either 404 in prod or 200+text/html in Vite dev
}
```

**The scope-empty condition is exactly this first-fetch failure.** No new network
request, no new inference, no new state is needed beyond a boolean flag.

### Distinguishing empty-scope from other errors

| Condition | Signal | Response |
|-----------|--------|---------|
| Primary file not found (404 or SPA fallback) | First fetch: not OK or not JSON | `isEmptyScope = true` → `ScopeEmptyState` |
| Primary file malformed | Fetch OK, JSON parse fails or missing required fields | Generic `error` state → red error box |
| Run not found in valid history | History loaded OK, run_id not in `data.runs` | Generic `error` state → red error box |
| Base/target run not found in valid history | History loaded OK | Generic `error` state → red error box |
| Payload artifact fetch failure | Secondary fetch fails | Existing per-artifact handling (RunCompare keeps `renderMissingNote`) |
| Network failure | Fetch throws | Generic `error` state → red error box |

The empty-scope state is a **subset of the existing "first fetch fails" branch**
in each page. No new detection logic is required — only the state variable and
rendering path change.

---

## 4. Pages in Scope

### All five pages in Phase 1

| Page | Primary fetch | Scope-empty trigger |
|------|--------------|---------------------|
| `RunHistory.jsx` | `run_history.json` | Content-type or HTTP check fails |
| `RunDetail.jsx` | `run_history.json` | Content-type or HTTP check fails |
| `RunCompare.jsx` | `run_history.json` | Content-type or HTTP check fails |
| `DlqOperations.jsx` | `manifest.json` | `!manifestRes.ok` |
| `PipelineHealth.jsx` | `manifest.json` | `!manifestRes.ok` |

**Why include dashboard pages in Phase 1:**

After switching scope via the selector, users may land on any page — the current
tab in NavBar is preserved by the route preservation logic. If a user is on the
DLQ dashboard and switches to `contexture/local`, they will see the dashboard
page's error, not the history page's error. Showing a polished empty state on
history/detail/compare but a raw error on dashboard pages is inconsistent and
confusing.

The fix is identical for all pages: one boolean state, one early return. Including
all pages in Phase 1 adds four lines of JSX per page and costs essentially nothing
in complexity.

---

## 5. Empty-State Message Design

### Visual style

The empty-state block uses a **neutral/informational** style (not red, not green):
- Background: `theme.background` (`#F8FAFC`)
- Border: `theme.border` (`#CBD5E1`)
- Text: `theme.textSecondary` for body, `theme.textPrimary` for the command

This makes it visually distinct from the red `errorBox` used for real errors.

### Message template

```
No artifacts found for  contexture / local

This scope has not been bootstrapped yet.
Run the following command to initialize it:

  publisher bootstrap --client contexture --env local
```

- Client and env are dynamic from `useParams()`
- `publisher bootstrap` is the canonical command
- No mention of individual `publisher run` commands (bootstrap is the correct
  onboarding path)

---

## 6. Reusable UI vs Inline Handling

**Recommendation: one small reusable `ScopeEmptyState` component.**

All five pages need the same content, layout, and style. Without a shared component:
- The message and command template would be duplicated 5 times
- A wording change would require 5 edits

The component is small (~30 lines including styles). It takes `client` and `env`
as props (both already available via `useParams()` in every page).

```jsx
// portal/src/components/ScopeEmptyState.jsx
export default function ScopeEmptyState({ client, env }) { ... }
```

No prop drilling required — each page calls `useParams()` independently and passes
`{ client, env }` to the component.

---

## 7. Detection Rules by Page Type

### History (`RunHistory.jsx`)

**Scope-empty:** `run_history.json` fetch fails (not OK or not JSON)
→ `isEmptyScope = true`; render `<ScopeEmptyState client={client} env={env} />`

**Other errors:** valid JSON but bad structure, network throw
→ `error` state; render existing red error box

**Empty runs list:** `data.runs.length === 0` — scope exists but no runs yet
→ existing "No runs recorded yet" empty-state (unchanged — this is a different case)

### Run Detail (`RunDetail.jsx`)

**Scope-empty:** `run_history.json` fetch fails (not OK or not JSON)
→ `isEmptyScope = true`; render `<ScopeEmptyState>` inside the existing `<div style={styles.page}>` wrapper (back link preserved above it)

**Malformed history:** JSON loads but `runs` is missing/not an array
→ `error` state; existing red error box

**Run not found:** History loaded OK; `runId`/`dashboardId` not in `data.runs`
→ `error` state; existing red error box (this means the scope exists — the run
just doesn't exist, which is a different failure mode)

### Compare (`RunCompare.jsx`)

**Scope-empty:** `run_history.json` fetch fails (not OK or not JSON)
→ `isEmptyScope = true`; render `<ScopeEmptyState>` inside `<div style={styles.page}>` (back link preserved)

**Base/target not found:** History loaded OK; `baseId` or `targetId` not in `data.runs`
→ `error` state; existing red error box

**Artifact fetch failures:** Already handled by `renderMissingNote()` per artifact
→ unchanged

### Dashboard pages (`DlqOperations.jsx`, `PipelineHealth.jsx`)

**Scope-empty:** `manifest.json` fetch returns non-OK HTTP status
→ `isEmptyScope = true`; render `<ScopeEmptyState client={client} env={env} />`
inside `<div style={styles.page}>`

**Note on `useParams()` in dashboard pages:** Dashboard components currently call
`useArtifactPath()` which internally calls `useParams()`. Both `client` and `env`
are available to pass to `ScopeEmptyState`. Dashboard pages will need to explicitly
call `useParams()` to extract them (or extract them from the path helper).
The cleanest approach: add `const { client, env } = useParams()` to each dashboard
component (it is already used implicitly via `useArtifactPath`).

**Publisher failure:** Manifest loads OK but `manifest.status !== "SUCCESS"`
→ `error` state; existing red error box

**Missing artifact in manifest / payload not found:** Secondary errors
→ `error` state; existing red error box

---

## 8. Bootstrap Command Integration

The empty-state block shows the command as a monospaced code block:

```
publisher bootstrap --client <client> --env <env>
```

where `<client>` and `<env>` are substituted from `useParams()`.

This is **instructional only** — no button, no automatic execution, no backend
call. The user copies and runs the command in their terminal.

This matches the platform's operational model: the portal is read-only; the
publisher CLI is the write side. The empty state bridges the two by making the
correct CLI invocation obvious without requiring the user to consult documentation.

---

## 9. Files to Create / Modify

### Create

| File | Purpose |
|------|---------|
| `portal/src/components/ScopeEmptyState.jsx` | Reusable scope-aware empty-state block |

### Modify

| File | Change |
|------|--------|
| `portal/src/pages/RunHistory.jsx` | Add `isEmptyScope` state; set on `run_history.json` not-found; render `<ScopeEmptyState>` |
| `portal/src/pages/RunDetail.jsx` | Same |
| `portal/src/pages/RunCompare.jsx` | Same |
| `portal/src/dashboards/dlq_operations/DlqOperations.jsx` | Add `isEmptyScope` state; set on manifest not-found; add `useParams()` call; render `<ScopeEmptyState>` |
| `portal/src/dashboards/pipeline_health/PipelineHealth.jsx` | Same |

### Unchanged

- `portal/src/AppShell.jsx` — no change
- `portal/src/components/ClientEnvSelector.jsx` — no change
- `portal/src/hooks/useArtifactPath.js` — no change
- All publisher files — no change
- Artifact schemas — no change
- `portal/src/App.jsx` — routing unchanged

---

## 10. Verification Plan

### Manual verification

```
# Prerequisite: portal running locally (npm run dev)
# Prerequisite: default/local scope has artifacts; contexture/local does NOT
```

| Scenario | Expected result |
|----------|----------------|
| Navigate to `/default/local/history` (has artifacts) | Existing run list renders normally |
| Navigate to `/contexture/local/history` (no artifacts) | ScopeEmptyState: "No artifacts found for `contexture / local`" with bootstrap command |
| Navigate to `/contexture/local/dlq_operations` (no artifacts) | ScopeEmptyState with bootstrap command |
| Navigate to `/contexture/local/pipeline_health` (no artifacts) | ScopeEmptyState with bootstrap command |
| Navigate to `/contexture/local/history/20260309T120000Z/dlq_operations` (no artifacts) | ScopeEmptyState with bootstrap command |
| Run `publisher bootstrap --client contexture --env local`, then reload `/contexture/local/history` | Run list renders normally |
| Navigate to `/default/local/history/badRunId/dlq_operations` (valid scope, bad run) | Existing red error: "Run not found" (not ScopeEmptyState) |
| Navigate to `/default/local/history/compare?dashboard=dlq_operations&base=bad&target=bad` (valid scope, bad params) | Existing red error (not ScopeEmptyState) |

### Build verification

```bash
cd portal && npm run build
# Must exit 0
```

### Test suite

```bash
cd portal && npm test
# Existing 32 tests must still pass
# No new unit tests required in Phase 1: ScopeEmptyState is pure rendering;
# the detection logic is a one-line condition already tested by the existing
# page fetch logic
```

---

## 11. Non-Goals

| Excluded | Reason |
|----------|--------|
| Dynamic scope discovery | Selector config is static in Phase 1 |
| Selector logic changes | Selector is a navigation convenience; empty state is a page-level concern |
| Backend APIs | No server-side scope existence check |
| Bootstrap command changes | Publisher is unchanged |
| Auto-retry or "bootstrap now" button | Portal is read-only; commands run in terminal |
| Permissions / auth | No auth model in this POC |
| Route changes | All routes are unchanged |
| Redirect on empty scope | The URL is correct; the scope just isn't bootstrapped. A redirect would be surprising and would break direct navigation. |

---

## 12. Recommended Phase 1 Scope

**Include all five pages (RunHistory, RunDetail, RunCompare, DlqOperations, PipelineHealth).**

**Justification:**

1. **User experience is symmetric:** The selector preserves the active tab when
   switching scope. Users may land on any page. Showing polished empty state on
   history but a raw error on the dashboard page creates an inconsistent experience.

2. **Implementation cost is identical across page types:** One boolean state
   variable, one early-return branch, one import. The total diff per page is
   6–10 lines.

3. **Detection is already correct in all pages:** The existing `!res.ok || !isJson`
   check (history/detail/compare) and `!manifestRes.ok` check (dashboard pages)
   already isolate the scope-empty condition. No new detection logic is added.

4. **Shared component reduces maintenance:** A single `ScopeEmptyState` component
   serves all five pages. Future wording changes require editing one file.

The only reason to defer dashboard pages would be if their implementation were
significantly more complex, but it is not.
