# Review: Dashboard Layout Persistence Plan (Feature 8)

**Plan artifact:** docs/plans/dashboard_layout_persistence_plan.md
**Reviewer role:** Staff-level architecture reviewer
**Review date:** 2026-03-11

---

## 1. Review Summary

The plan is architecturally sound and well-scoped.  The hook extraction approach is
correct: all storage concerns are encapsulated in `useDashboardLayout`, `DashboardRenderer`
remains unaware of the persistence mechanism, and the hook's public API
(`sectionLayouts`, `updateSectionLayout`, `resetLayouts`) is stable across a future
server-API migration.

Four concerns are raised:

- **P2 — `saveLayouts` wiring is underspecified**: The plan lists `saveLayouts` as an
  internal function but does not specify whether it is called via a `setState` callback or
  a `useEffect`.  The two options have different implications in React StrictMode.
  Recommend `useEffect` as the idiomatic choice.
- **P2 — High-frequency localStorage writes during drag**: `react-grid-layout` fires
  `onLayoutChange` on every drag-position update, not just on drop.  The plan's
  "persist on every `onLayoutChange` call" means `localStorage.setItem` is called many
  times per second during a drag.  Acceptable at POC scale; implementer should be aware.
- **P2 — localStorage error handling is absent**: `localStorage.setItem` throws
  `QuotaExceededError` when storage is full and `SecurityError` in private-browsing
  contexts.  The plan does not require a try/catch fallback.  Without one, a storage
  error will surface as an unhandled exception in the hook.
- **P2 — `float: right` on Reset button**: The header container is a plain block div.
  `float: right` on the button can cause unexpected height collapse.
  `marginLeft: "auto"` on a flex child is more reliable.

None of these concerns block implementation.  The plan is approved as written.

---

## 2. Strengths of the Plan

**Hook extraction is the right abstraction boundary.**
Pulling layout state and persistence into `useDashboardLayout` reduces `DashboardRenderer`
to a pure consumer.  The replacement — three hook calls for the current `useState` /
`setSectionLayouts` block — is minimal and legible.  DashboardGrid, KpiCard, and all
definition files are correctly left unchanged.

**Merge logic covers all widget lifecycle cases correctly.**
`defaultItems.map(d => savedItems.find(s => s.i === d.i) ?? d)` handles addition
(new widget gets default), removal (silently dropped because it is not iterated), and
persistence (saved position wins) in a single pass with no edge cases.

**localStorage key format is safe and scoped.**
`portal:layout:{dashboardId}` is namespace-prefixed, per-dashboard, and human-readable
in DevTools.  The value shape `{ [sectionId]: [{ i, x, y, w, h }] }` is directly
JSON-serialisable and matches the existing Phase 7 `sectionLayouts` state shape exactly —
no transformation needed.

**Future migration path is credible.**
The plan's claim that replacing the three `localStorage.*` calls inside the hook is
sufficient for a server-API migration is accurate.  `DashboardRenderer` and `DashboardGrid`
need no changes because they interact only through the hook's stable public API.

**Scope is tightly bounded.**
No definition files, no publisher files, no DashboardGrid, no KpiCard.  The only
consumer-visible change is the Reset button, which is correctly gated on `hasGridSections`.

---

## 3. Architectural Concerns

### 3.1 `saveLayouts` wiring is underspecified (P2)

The plan lists `saveLayouts` as an internal function of the hook but does not specify
how it is invoked after a state change.  There are two viable patterns:

**Option A — Side effect inside `setState` callback:**
```js
function updateSectionLayout(sectionId, newLayout) {
  setSectionLayouts((prev) => {
    const next = { ...prev, [sectionId]: newLayout };
    saveLayouts(definition.id, next);  // side effect inside setState
    return next;
  });
}
```
This works, but React StrictMode calls `setState` callbacks twice (in development) to
detect impure reducers.  `saveLayouts` would write to localStorage twice per update in
development, which is harmless but surprising when inspecting storage.

**Option B — `useEffect` to persist (recommended):**
```js
useEffect(() => {
  saveLayouts(definition.id, sectionLayouts);
}, [sectionLayouts, definition.id]);
```
`updateSectionLayout` becomes a pure state setter.  Persistence is a side-effect of
state changing, declared explicitly.  No StrictMode concern.

Note: Option B also writes defaults to localStorage on initial mount (the first effect
fires with the loaded/default layout).  This is correct behaviour — it is equivalent to
the "first save after drag" path described in §3.3 below.

**Recommendation:** Specify Option B in the plan or as an implementer note.  Not a
blocker; either option produces correct results in production.

---

### 3.2 High-frequency localStorage writes during drag (P2)

`react-grid-layout` fires `onLayoutChange` on every mouse-move event during a drag,
not only on drop.  The plan's instruction to persist on every `onLayoutChange` means
`localStorage.setItem` is called on each mouse-move update — potentially 30–60 times
per second during a drag.

At POC scale (3 widgets, ~100 bytes per entry), this is not a performance issue.
`localStorage.setItem` for a small string is synchronous and fast.

**No action required for Phase 8.**  The implementer should be aware so they are not
surprised when they observe frequent storage writes in DevTools.  If this becomes a
concern at larger scale, a debounce on `saveLayouts` (e.g. 200 ms) would reduce it to
one write per drag gesture.

---

### 3.3 localStorage error handling is absent (P2)

`localStorage` is not always available.  Two failure modes matter:

- **Private-browsing mode (some browsers):** `localStorage.setItem` throws
  `SecurityError` — access is denied even though `localStorage` appears defined.
- **Storage full:** `localStorage.setItem` throws `QuotaExceededError` when the 5 MB
  quota is exceeded.

The plan does not require a try/catch around `localStorage` calls.  Without one, either
failure will surface as an unhandled exception that breaks the hook's state update and
may crash the dashboard.

**Recommendation:** Wrap `saveLayouts` in try/catch.  On error, log a warning and
continue — the in-memory `sectionLayouts` state is still valid even if the write fails:

```js
function saveLayouts(dashboardId, sectionLayouts) {
  try {
    localStorage.setItem(storageKey(dashboardId), JSON.stringify(sectionLayouts));
  } catch {
    // Storage unavailable or full — layout persists in memory only for this session
  }
}
```

Similarly, `loadLayouts` should catch malformed JSON from `JSON.parse`.

This is a one-function change.  Treat as a required addition during implementation.

---

### 3.4 `float: right` on Reset button (P2)

`styles.header` (inspected in `DashboardRenderer.jsx`) is a plain block div — no flex
display.  The plan places the `h1` first in JSX and the button second, with
`float: "right"` on the button.

Float on a block-flow child works in common cases but can cause:
- Header height collapse if the `h1` renders at zero height (unlikely but possible
  during loading states)
- Unexpected stacking when the title wraps to two lines

**Recommendation:** Change `styles.header` to a flex container and use
`marginLeft: "auto"` on the Reset button:

```js
header: {
  // existing styles preserved...
  display: "flex",
  alignItems: "baseline",
},
resetButton: {
  marginLeft: "auto",
  // remove float: "right"
  background: "none",
  border: "none",
  cursor: "pointer",
  fontSize: "0.8rem",
  color: theme.textMuted,
  padding: "0.25rem 0",
},
```

One-line change to header style; removes float entirely.

---

## 4. Scalability Assessment

**More dashboards:** Each gets its own `portal:layout:{id}` key.  Zero code changes.

**More grid sections per dashboard:** The `{ [sectionId]: Layout[] }` shape is already
section-keyed.  The merge loop iterates all grid sections; additional sections are
handled automatically.

**localStorage quota:** At POC scale (~3 widgets × 2 dashboards), total storage is
under 1 KB.  Even at 20 widgets × 10 dashboards the total is ~6 KB — well within the
5 MB quota.  Not a concern.

**Phase N server persistence:** The plan's migration path is accurate.  Replace three
`localStorage.*` calls in the hook; the hook's return signature and all callers are
unchanged.  If the `useEffect` approach (§3.1) is used, a server-API version would
swap `saveLayouts` for an async `fetch`, with the effect handling the async call.

---

## 5. Missing Design Decisions

| Decision | Required Before Implementation? | Notes |
|----------|----------------------------------|-------|
| `saveLayouts` wiring: `setState` callback vs `useEffect` | Recommended | `useEffect` is more idiomatic; avoids StrictMode double-call |
| localStorage error handling (try/catch) | Yes — recommended as required | Prevents crash on `SecurityError` / `QuotaExceededError` |
| `float: right` vs flex layout on header | Recommended | Flex is more predictable |
| Debounce on `saveLayouts` | No — POC scale | Can be added later if needed |

---

## 6. Recommended Improvements

**P2 — Recommended non-blocking:**

1. **Specify `useEffect` for persistence wiring** in `useDashboardLayout`.  Avoids
   side effects inside `setState` callbacks; more idiomatic React.

2. **Add try/catch to `saveLayouts` and `loadLayouts`** to handle `SecurityError`,
   `QuotaExceededError`, and malformed JSON gracefully.  Fall back to the in-memory
   state on write failure; fall back to definition defaults on read failure.  Treat as
   a required addition during implementation.

3. **Change header to flex and use `marginLeft: "auto"` on the Reset button** instead
   of `float: "right"`.

---

## 7. Implementation Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `saveLayouts` side effect called twice in StrictMode (if using setState callback) | Medium | Low | Use `useEffect` approach instead |
| `localStorage.setItem` throws in private browsing | Low | High | Wrap in try/catch; fall back silently |
| High-frequency writes during drag cause noticeable lag | Very Low | Low | Acceptable at POC scale; debounce later if needed |
| `float: right` causes header height collapse | Low | Low | Use flex layout as recommended |
| `JSON.parse` throws on corrupted localStorage entry | Very Low | Medium | Wrap in try/catch; fall back to defaults |
| Stale layout on route reuse (no `key` at router call site) | Low | Low | Already noted in Phase 7; unchanged |

---

## 8. Approval Recommendation

```
APPROVED
```

The plan is architecturally sound, correctly scoped, and ready to implement.

The localStorage error handling (§3.3) should be treated as a required addition during
implementation — it prevents crashes on `SecurityError` and malformed JSON — but does
not require revising the plan document.

The remaining P2 items (`useEffect` wiring, flex header layout) are non-blocking
implementation refinements.
