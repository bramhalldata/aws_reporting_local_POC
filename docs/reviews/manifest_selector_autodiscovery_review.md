# Manifest-Driven Selector Auto-Discovery — Plan Review

**Feature:** Manifest-Driven Selector Auto-Discovery
**Plan artifact:** `docs/plans/manifest_selector_autodiscovery_plan.md`
**Date:** 2026-03-10
**Reviewer:** Claude Code
**Recommendation:** APPROVED WITH TWO NOTES

---

## 1. Feature Summary

**Assessment: Correct and well-motivated.**

The plan correctly identifies the gap: `scopes.js` is a static list that drifts from
actual platform state. The fix is direct — fetch `/platform-manifest.json`, which the
publisher already generates after every `run()`. The scope list stays correct
automatically with no developer intervention.

---

## 2. Hook Design: `usePlatformManifest`

**Assessment: Correct. Follows established patterns.**

The hook follows `useArtifactPath.js` in structure: single purpose, React state,
`useEffect` with no dependencies (fetch once on mount). The return shape `{ scopes,
loading, error }` is clear.

**Content-type guard:**

```js
const ct = res.headers.get("content-type") ?? "";
if (!res.ok || !ct.includes("application/json"))
  throw new Error("platform-manifest.json not available");
```

This is the correct Vite SPA fallback guard — identical to the pattern in
`RunHistory.jsx`, `RunDetail.jsx`, `DlqOperations.jsx`, and `PipelineHealth.jsx`.
Consistent. No concern.

**`manifest.clients ?? []` guard:**

Correct. Defensive against a malformed or empty manifest. The selector degrades
gracefully to the URL-derived fallback.

**`scopes === null` as loading sentinel:**

Correct. Distinguishes three states:
- `null` = not yet resolved (loading)
- `[]` = resolved, no clients bootstrapped
- `[...]` = resolved, clients present

An empty array `[]` is a valid state (newly initialized platform). The fallback
`scopes ?? [{ client, envs: [env] }]` handles both `null` and eventual empty array
consistently (though on empty array, `effectiveScopes` will be `[]` and the
`currentEntry ?? { client, envs: [env] }` guard applies).

**Note 1 — Empty manifest edge case:**

When `scopes` resolves to `[]` (no bootstrapped scopes), `effectiveScopes` becomes
`[]`, `clients` becomes `[]`, and both `<select>` elements render with zero options.
This is technically valid but produces an empty dropdown — visually confusing.

The current URL still has valid `client` and `env` values (from a previous session),
so `currentEntry` falls back to `{ client, envs: [env] }`. But this fallback is never
reached because `effectiveScopes.find()` on an empty array returns `undefined` — and
the guard `?? { client, envs: [env] }` catches it. So `envs` is populated.

However, `clients` is empty, so the client `<select>` has no `<option>` elements.
The `value={client}` on a select with no options renders the current value as text
in most browsers, but it is a degenerate state.

**Mitigation (recommend):** Replace the `effectiveScopes` fallback to always include
the current scope if not already present:

```js
// Instead of:
const effectiveScopes = scopes ?? [{ client, envs: [env] }];

// Use:
const resolved = scopes ?? [];
const effectiveScopes = resolved.some(s => s.client === client)
  ? resolved
  : [{ client, envs: [env] }, ...resolved];
```

This ensures the current scope always appears in the dropdown, even when the manifest
is empty or the current client is not yet in the manifest. The `currentEntry` guard
becomes redundant but harmless.

This is a one-line logic change. The implementor should apply it.

---

## 3. `ClientEnvSelector.jsx` Changes

**Assessment: Correct. Minimal impact.**

The plan correctly identifies that `handleClientChange` and `handleEnvChange` are
unchanged — they call `resolveEnv()` and `targetUrl()` which accept the same
`[{ client, envs }]` shape. The component structure and styles are unchanged.

The `dashboardIds` derivation from `dashboardMeta` is correctly identified as
unchanged.

**No concern on the component changes.**

---

## 4. Deletion of `scopes.js`

**Assessment: Correct. No references remain after the change.**

`scopes.js` is only imported in `ClientEnvSelector.jsx`. After the import is removed,
the file is dead. Deleting it prevents future confusion.

**Verify with grep:**

```bash
grep -r "scopes.js" portal/src/
# Expected: no output
```

The plan includes this verification step. Correct.

---

## 5. Loading / Error Fallback Strategy

**Assessment: Correct. Consistent with existing error handling philosophy.**

The platform already uses a "show current state, degrade gracefully" pattern:
- Dashboard components show loading text while fetching artifacts
- `ScopeEmptyState` appears when a scope has no artifacts

The selector fallback (current scope only, no crash) is consistent with this philosophy.
The `console.warn` is appropriate — this is a developer-facing portal.

---

## 6. `selectorNav.js` and Tests

**Assessment: Correct. Zero changes needed.**

`selectorNav.js` accepts scopes as function arguments — it has no import from
`scopes.js`. The 15 existing unit tests pass scopes inline. All 15 tests remain
valid after this change.

The plan correctly notes this as an unchanged area.

---

## 7. Files to Modify

**Assessment: Minimal. Three files (create, modify, delete).**

Adding `usePlatformManifest.js` to `hooks/` and modifying `ClientEnvSelector.jsx`
is the correct minimal approach. No new module structure, no new test files required
for Phase 1.

---

## 8. Verification Plan

**Assessment: Adequate. Covers the key cases.**

The plan covers:
- Existing tests pass ✓
- Build exits 0 ✓
- Selector auto-populates from manifest ✓
- New scope auto-discovery ✓
- Fallback when manifest is missing ✓
- No import errors (grep for scopes.js) ✓

**Note 2 — Test the selector switch behavior after manifest loads:**

The existing `selectorNav.test.js` tests cover the pure URL computation logic.
There is no browser-level test that exercises the selector with manifest data.
The verification plan should include manually switching the client dropdown after
the manifest has loaded (not just checking that the dropdown appears) — confirm
that the URL changes correctly and the new page loads. This is a manual verification
step, not a unit test gap.

---

## 9. Summary Assessment

| Section | Status |
|---------|--------|
| Feature motivation | ✓ Correct; eliminates manual config maintenance |
| Hook design | ✓ Follows established patterns; content-type guard correct |
| Loading/fallback states | ✓ Graceful; consistent with existing error philosophy |
| Component changes | ✓ Minimal; navigation logic unchanged |
| `scopes.js` deletion | ✓ Clean removal; no remaining references |
| `selectorNav.js` tests | ✓ Unaffected; pure utility |
| Verification plan | ✓ Adequate; manual switch test recommended |
| Files to change | ✓ Three files; zero architectural changes |
| Non-goals | ✓ Well-bounded |

**Recommendation: APPROVED WITH TWO NOTES**

1. **Empty manifest edge case:** Replace the simple `?? [{ client, envs: [env] }]`
   fallback with a guard that ensures the current scope always appears even when
   `scopes` resolves to `[]` (empty platform or current client not yet bootstrapped).
   See Section 2 for the recommended one-line fix.

2. **Manual switch verification:** The verification plan should explicitly include
   switching the client dropdown after the manifest loads and confirming the URL
   and page update correctly — not just that the dropdown renders.
