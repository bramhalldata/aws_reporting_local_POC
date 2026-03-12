# Review: Filter Bar Contract Plan (Feature 13)

**Plan artifact:** docs/plans/filter_bar_contract_plan.md
**Reviewer role:** Staff-level architecture reviewer
**Review date:** 2026-03-11

---

## 1. Review Summary

The plan correctly identifies the gap: `definition.json` declares filters but the
rendering pipeline ignores them.  The proposed hook + prop-threading approach is the
right solution — it formalizes the contract without adding React context, global state,
or a query engine.

Three concerns are raised:

- **P2 — `DashboardGrid` currently has no knowledge of `filterState`**: The plan
  correctly identifies that `DashboardGrid` must be updated to accept and forward
  `filterState`.  This is the most error-prone part of the implementation — it is easy
  to thread it through the stack branch but forget the grid branch.  The plan should
  explicitly list `DashboardGrid.jsx` in its "Files to Modify" section with the same
  clarity as the other files.  *(It does appear in §6 but the DashboardGrid section
  is embedded inside the DashboardRenderer section rather than standing alone — easy
  to miss during implementation.)*
- **P2 — `useSearchParams` requires the component to be inside a React Router
  `<Router>`**: The test for `useFilterState` cannot call the hook directly without a
  Router wrapper.  The plan mentions a test file but does not address the testing
  approach.  Tests should use `MemoryRouter` from `react-router-dom` or mock
  `useParams`/`useSearchParams` to avoid mounting a full Router.
- **P3 — `filterState` is not passed to `DashboardGrid`'s internal `WidgetRenderer`
  calls in the current code**: Verify during implementation that `DashboardGrid` does
  in fact render `WidgetRenderer` — if so, it must receive `filterState`.  If
  `DashboardGrid` renders widgets via a different path, the plan needs revision.

None of these concerns block implementation.

The plan is approved as written.

---

## 2. Strengths of the Plan

**Activates declared-but-unused metadata.**
The `filters` array has always been in the schema.  Formalizing its role via
`useFilterState` makes the declaration load-bearing without changing the JSON format.

**URL as filter persistence layer is architecturally correct.**
Filter state derived from URL params is bookmarkable, shareable, and consistent with
the platform's stateless artifact model.  Storing filter state in React state would
create transient, non-shareable filter combinations — wrong for a reporting platform.

**Path params + query params in one hook is clean.**
Checking `useParams()` first (for `:client` and `:env`) and `useSearchParams()` second
(for `?date_range=7d`) means both filter sources are handled uniformly by the same
mechanism.  Callers only see `filterState[filterId]` and don't need to know the source.

**propsAdapter third-argument extension is fully backward-compatible.**
JavaScript ignores extra function arguments.  All existing propsAdapters continue to
work unchanged.  The change is purely additive and the only new contract is the JSDoc.

**`useDashboardArtifacts` correctly not modified.**
The hook needs `client` and `env` for artifact path construction — a different concern
from display filter state.  Keeping them separate avoids coupling the data-loading
layer to the filter presentation layer.

**`default` field is appropriately minimal.**
A single optional `default` string covers the vast majority of filter default use cases
without introducing a complex default expression language.

---

## 3. Architectural Concerns

### 3.1 `DashboardGrid` threading must be explicit (P2)

The plan correctly notes that `DashboardGrid` renders `WidgetRenderer` internally and
must forward `filterState`.  However, `DashboardGrid.jsx` is listed as a sub-section
inside the DashboardRenderer section rather than as a standalone Files to Modify entry.

This is a real implementation risk: a developer following the plan might update
`DashboardRenderer` and `WidgetRenderer` and miss `DashboardGrid`.  The result would
be that grid-section widgets receive `filterState = undefined` while stack-section
widgets receive the correct value — a subtle, hard-to-diagnose inconsistency.

**Recommended improvement:** Move `DashboardGrid.jsx` to its own explicit section in
the Files to Modify list, co-equal with `DashboardRenderer.jsx` and `WidgetRenderer.jsx`.

---

### 3.2 `useFilterState` test requires Router context (P2)

`useFilterState` calls both `useParams()` and `useSearchParams()` from `react-router-dom`.
Both hooks throw if called outside a Router context.  The plan lists a test file but
does not address how to satisfy this requirement.

Two viable approaches:

**Option A — Mock both hooks at the module level (simpler):**
```js
vi.mock("react-router-dom", () => ({
  useParams: () => ({ client: "acme", env: "prod" }),
  useSearchParams: () => [new URLSearchParams("date_range=7d")],
}));
```

**Option B — Wrap in `MemoryRouter` with `<Routes>` and render a test component:**
More verbose but tests the real hook interactions.

Option A is appropriate for a unit test focused on `useFilterState` logic.  Option B
is better suited for integration tests.  The plan should specify Option A for the
`useFilterState.test.js` file.

---

### 3.3 Verify `DashboardGrid` renders `WidgetRenderer` (P3)

The plan assumes `DashboardGrid` renders `WidgetRenderer` internally.  Before
implementing, confirm that `DashboardGrid.jsx` does in fact call `WidgetRenderer`.  If
`DashboardGrid` only renders the grid layout scaffold and `WidgetRenderer` is called
from `DashboardRenderer` with pre-resolved widget positions, the threading path is
different.

**No action required now** — verify during implementation and adjust the
`DashboardGrid` section if the assumption is wrong.

---

## 4. Completeness Assessment

| Plan section | Covered? | Complete? |
|--------------|---------|-----------|
| Feature overview — why filters are currently ignored | Yes | Yes |
| Filter definition shape + `default` field | Yes | Yes |
| `useFilterState` hook design | Yes | Yes — path + query param lookup, memoized |
| Widget subscription via propsAdapter third arg | Yes | Yes — backward-compatible |
| Default value handling | Yes | Yes — URL-first, default-fallback, null otherwise |
| `DashboardRenderer` changes | Yes | Yes |
| `WidgetRenderer` changes | Yes | Yes |
| `DashboardGrid` changes | Yes (embedded) | P2 — needs standalone section |
| `widgetRegistry.js` JSDoc update | Yes | Yes |
| `useFilterState` test approach | Listed only | P2 — mock strategy not specified |
| Guide update | Yes | Yes |
| Verification of path vs query param precedence | Yes | Yes |

---

## 5. Missing Design Decisions

| Decision | Required Before Implementation? | Notes |
|----------|----------------------------------|-------|
| Mock strategy for `useFilterState.test.js` | Yes (P2) | Use vi.mock for useParams and useSearchParams |
| `DashboardGrid` standalone in Files to Modify | Yes (P2) | Prevents implementation miss |
| Whether `useDashboardArtifacts` comment is added | No (P3) | Low cost; include at discretion |

---

## 6. Implementation Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Grid branch widgets receive undefined filterState | Medium | Silent — widgets render but can't use filters | Confirm DashboardGrid threading in implementation |
| `useFilterState` test fails due to missing Router context | High without mocking | Test suite failure | Use vi.mock for both Router hooks |
| Path param lookup shadows query param of same name | Very low | Client/env can't be overridden via query string | By design — path params win |
| `searchParams.get()` returns `null` not `undefined` for absent params | Low | Nullish coalescing `??` handles both | `null ?? filter.default` works correctly |

---

## 7. Approval Recommendation

```
APPROVED — P2 items incorporated during implementation
```

Both P2 items (explicit `DashboardGrid` section in Files to Modify; `vi.mock` strategy
for tests) should be applied during implementation.  No plan revision required.
