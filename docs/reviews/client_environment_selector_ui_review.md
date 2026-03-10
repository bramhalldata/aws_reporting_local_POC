# Client / Environment Selector UI — Plan Review

**Feature:** Client / Environment Selector UI
**Plan artifact:** `docs/plans/client_environment_selector_ui_plan.md`
**Date:** 2026-03-10
**Reviewer:** Claude Code
**Recommendation:** APPROVED WITH ONE NOTE

---

## 1. Feature Framing

The plan correctly identifies the problem: the URL-first architecture works, but users
must hand-edit URLs to switch scope. The selector adds a convenience layer without
compromising the architecture. The framing is accurate and appropriately scoped.

---

## 2. Core Design Principle — URL as Source of Truth

**Assessment: Correct and well-articulated.**

The anti-pattern table is particularly useful — it names the specific failure mode for
each rejected approach (back/forward breaks, private browsing issues, CloudFront
conflicts). The controlled-component model (`value={client}` from `useParams()`, no
local state for selection) is exactly right.

One additional validation: because the selector calls `navigate()` on change, React
Router's history stack is updated correctly. Browser back returns to the previous scope.
This is the expected behavior and is verified in the verification plan.

**No concerns.**

---

## 3. Placement in the Identity Bar

**Assessment: Correct choice.**

The identity bar already owns the client/env display. Elevating it to an interactive
control is a natural, minimal evolution. The NavBar is the right place for navigation
tabs; the identity bar is the right place for scope controls.

The proposed layout (`[default ▾] / [local ▾]`) is clear and compact. Native `<select>`
elements are accessible by default and require no additional styling libraries.

**No concerns.**

---

## 4. Route Preservation Rules

**Assessment: The rules are correct. One implementation detail to verify.**

The four cases are well-reasoned:

| Case | Rule | Assessment |
|------|------|------------|
| Dashboard page | Preserve dashboardId | Correct — dashboard route is defined by the portal, not by artifact availability |
| History list | Preserve /history suffix | Correct — every scope has its own history |
| Run detail | Reset to /history | Correct — runId is scope-specific |
| Compare page | Reset to /history | Correct — base/target are scope-specific |

**The `suffix` detection approach:**

```js
const suffix = location.pathname.slice(`/${client}/${env}`.length);
```

This is reliable given that all routes in scope follow `/:client/:env/...`. However,
implementors should verify the edge case where `location.pathname` has a trailing slash
or URL encoding. In practice this is unlikely in a Vite SPA, but worth a quick check
during implementation.

**Dashboard detection:**

```js
const isDashboard = dashboardMeta.some(d => suffix === `/${d.id}`);
```

This correctly uses `dashboardMeta` as the registry (consistent with NavBar). Any
dashboard added to the registry is automatically handled.

**Note for run detail detection:** The suffix for run detail is `/history/<runId>/<dashboardId>`.
The plan's logic correctly falls through to the "reset to /history" default since
`suffix === "/history"` is false and `isDashboard` is false. This is correct behavior.

---

## 5. Available Client/Env Source

**Assessment: Hardcoded config is the right Phase 1 choice.**

The comparison of three options is fair. The key insight is correct: a static config
file requires zero new infrastructure and zero publisher changes. The Phase 2 path
(publisher-written `scopes.json`) is noted without over-engineering Phase 1.

**The env-preservation-on-client-switch logic:**

```js
const newEnv = newClientEntry?.envs.includes(env) ? env : newClientEntry?.envs[0] ?? env;
```

This is the right behavior: if `contexture` supports `local` and the user is on `local`,
stay on `local`. If `contexture` only has `prod`, switch to `prod`.

**One note:** The config structure `{ client, envs[] }` is correct. However, the plan
should specify that `envs` must be non-empty for every scope entry — an empty `envs`
array would cause `newClientEntry?.envs[0]` to return `undefined`, producing a broken
URL like `/contexture/undefined/dlq_operations`. Implementation should guard:

```js
if (!newClientEntry || newClientEntry.envs.length === 0) return; // no-op or warn
```

This is minor but should be caught in implementation.

---

## 6. UI State Model

**Assessment: Correct. Native `<select>` is the right call.**

Zero local state for the selection value — the `value` prop is always `useParams().client`
or `useParams().env`. This is a textbook controlled component pattern.

Using native `<select>` avoids implementing dropdown open/close state, keyboard
navigation, ARIA roles, and click-outside detection. All of these are provided by the
browser for free with `<select>`. For a demo/internal tool, native controls are the right
default.

**No concerns.**

---

## 7. Routing / Navigation Behavior

**Assessment: Correct. Push navigation is the right default.**

Using `navigate(url)` (push) rather than `navigate(url, { replace: true })` means scope
switches are in the history stack. Browser back undoes a scope switch. This matches
user expectation and is verified in the test plan.

The client-switching logic preserves env when the new client supports it and falls back
to the first available env otherwise. This is the correct behavior.

---

## 8. Error / Missing Scope Handling

**Assessment: Correct approach — delegate to existing error states.**

The plan correctly relies on existing component guards (content-type check + `res.ok`
in all data-loading functions). No new error handling is needed in the selector itself.

The "out-of-range scope" case (URL contains a client/env not in SCOPES) is handled
acceptably: the select may display a blank or raw value. For Phase 1, this is fine.
Manual URLs still work; the selector just doesn't list the custom scope.

---

## 9. Files to Create / Modify

**Assessment: Minimal and correct.**

Three files: one new config, one new component, one modified shell. This is the smallest
footprint possible for this feature.

The explicit list of unchanged files is important: it confirms that dashboard components,
pages, publisher, routing, and NavBar are all untouched.

---

## 10. Verification Plan

**Assessment: Adequate. All key scenarios are covered.**

The 11 functional test cases cover the critical paths including scope switching on every
page type, browser back, bookmarking, missing artifacts, and out-of-SCOPES URLs.

**Missing test:** The verification plan does not explicitly test switching from a scope
that uses a non-default env (e.g., `contexture/prod`) to a client that does not support
`prod` (e.g., `default` which only has `local`). This is the "env preservation failure"
case that triggers the fallback to `envs[0]`. Recommended addition:

```
On /contexture/prod/dlq_operations, change client to "default" (which only has "local")
→ Expected: navigates to /default/local/dlq_operations (env preserved if available, else fallback)
```

This is not blocking, but should be verified during implementation.

---

## 11. Non-Goals

**Assessment: Appropriate boundaries.**

The six excluded items are correct. localStorage as source of truth is explicitly
rejected with clear reasoning. Dynamic backend API and tenant permissions are out of
scope for a POC. Native `<select>` avoids custom dropdown complexity.

---

## Summary Assessment

| Section | Status |
|---------|--------|
| Feature framing | ✓ Correct |
| URL-first design principle | ✓ Correct and well-argued |
| Identity bar placement | ✓ Correct |
| Route preservation rules | ✓ Correct; verify trailing slash edge case |
| Config file approach | ✓ Correct; guard empty `envs` array |
| UI state model | ✓ Correct — zero owned state |
| Navigation behavior | ✓ Correct — push mode |
| Error handling | ✓ Correct — delegate to page components |
| Files to modify | ✓ Minimal (3 files) |
| Verification | ✓ with note: add env-fallback switching test |
| Non-goals | ✓ Well-bounded |

**Recommendation: APPROVED WITH ONE NOTE**

The plan is sound, minimal, and architecturally correct. Proceed to implementation with
these two notes carried forward:

1. Guard against empty `envs` array in scopes config during selector mount/change handling
2. Add a test case for env-fallback when switching to a client that doesn't support the current env
