# Review: Blank Screen Troubleshooting Plan

**Plan artifact:** docs/plans/blank_screen_troubleshooting_plan.md
**Reviewer role:** Staff-level architecture reviewer
**Review date:** 2026-03-11

---

## 1. Review Summary

The plan correctly identifies the root cause of the blank white screen: `WidthProvider`
is not exported from `react-grid-layout` v2's main ESM entry (`dist/index.mjs`) but the
import in `DashboardGrid.jsx` assumes it is.  The fix is a single-line import path
change.

The plan is thorough, evidence-based, and correctly scoped.  It avoids speculative edits
and provides a clear isolation path for verifying the diagnosis before applying the fix.

Two observations are added below that the plan does not explicitly cover:

- **P1 — The fix is single-line and should be applied immediately**: Root cause is
  fully confirmed by static analysis.  The isolation steps in Section 3 are good
  documentation but are not required before applying the fix — the evidence is
  conclusive.
- **P2 — Architecture divergence note is important but understated**: The plan's §9
  notes that `DlqOperations` is hand-composed and diverged from its definition.json.
  This should be tracked as a follow-up task, not just an architecture note.

The plan is approved.  Implementation of the single-line fix may proceed immediately.

---

## 2. Strengths of the Plan

**Root cause is identified with evidence, not guesswork.**
The plan traces the failure from `DashboardGrid.jsx:6` through the entire eager import
chain to `main.jsx`.  It references the actual package dist file (`dist/index.mjs`) and
confirms that `WidthProvider` is only exported from `dist/legacy.mjs` (via the
`./legacy` subpath).  This is not speculation — it is verifiable by inspection.

**Impact analysis is correct.**
The cascade — DashboardGrid → DashboardRenderer → PipelineHealth → dashboards/index.js
→ App.jsx → main.jsx — is accurate.  Because `dashboards/index.js` eagerly imports
both dashboard components, a module-load failure in any transitive dependency prevents
React from mounting.  The blank screen (rather than a React error boundary) is
explained correctly.

**Isolation path is minimal and reversible.**
The three diagnostic steps (console check → comment out DashboardGrid import → reduce
to one dashboard) are ordered from fastest to most invasive.  All edits are explicitly
marked as reversible.

**Fix is one line.**
Changing the import from `"react-grid-layout"` to `"react-grid-layout/legacy"` is the
correct resolution.  The legacy subpath exports exactly the same `WidthProvider` and
`GridLayout` API that the plan was using.

**Checklist coverage is complete.**
All recently modified components and hooks are covered in the debug checklist.
The signal table in §7 correctly distinguishes module-load failures (blank screen) from
render failures (error boundary) from data failures (ScopeEmptyState).

---

## 3. Architectural Concerns

### 3.1 Recommended: Apply the fix immediately (P1)

The plan presents isolation steps as if root cause confirmation is needed before
applying the fix.  In this case, the evidence is conclusive without running the
diagnostic steps:

- `react-grid-layout` v2 ESM entry confirmed not to export `WidthProvider`
- `WidthProvider` confirmed in `dist/legacy.mjs` only
- Module-level `const ResponsiveGridLayout = WidthProvider(GridLayout)` executes at
  load time — an undefined call throws synchronously
- Import chain confirmed to reach `main.jsx`

The diagnostic steps in §3 and §6 remain useful as documentation and verification
after the fix.  But they are not required before applying the fix.

**Recommendation:** Apply the single-line fix and verify with browser + test suite.

---

### 3.2 DlqOperations architecture divergence should be a tracked follow-up (P2)

The plan's §9 correctly notes that `DlqOperations.jsx` is hand-composed and does not
use `DashboardRenderer` or `definition.json`.  This means:

- `dlq_operations/definition.json` is diverged: it has metric references, grid section
  type, and widget layout coordinates that are never read by the actual view component
- `DlqOperations.jsx` duplicates artifact fetching and component composition that
  `DashboardRenderer` + `WidgetRenderer` + `widgetRegistry` already handle generically
- Any future platform feature (e.g. Phase N server-backed layout) will not apply to
  `dlq_operations` until it is migrated

This divergence was inherited from the pre-platform era and is not introduced by the
current bug.  It does not affect the blank screen fix.

**Recommendation:** Log this as a follow-up task (`feat: migrate dlq_operations to
DashboardRenderer`) to be planned after the blank screen fix is confirmed.  It is out
of scope for this troubleshooting fix.

---

### 3.3 Test suite does not cover module-load failures (observation)

All 82 tests pass despite the broken import because the test files do not import
`DashboardGrid.jsx`.  Vitest evaluates only the modules transitively imported by each
test file.  Since no test renders a grid section, the `WidthProvider` import is never
evaluated in the test environment.

This class of failure — a third-party API change breaking a module-level side-effect —
is not caught by unit tests.  A `vite build` in CI would have caught it (Vite would
fail to bundle the import).

**Recommendation (non-blocking):** Add `vite build` to the CI check list so that
module-level import failures are caught before they reach the browser.  This is a
CI-level improvement, not part of the current fix.

---

## 4. Scalability Assessment

**Fix scope is minimal.**  One file, one line.  No API surface changes.

**`react-grid-layout` v2 legacy subpath stability.**  The `./legacy` subpath is
explicitly declared in the package's `exports` field and includes the full legacy API
including `WidthProvider`, the default `GridLayout`, `Responsive`, and `WidthProvider`.
It is a stable, supported subpath — not an internal implementation detail.

**Migration to v2 native API.**  The v2 native API replaces `WidthProvider` with the
`useContainerWidth` hook and `GridLayout` component directly.  Migrating to the v2 API
would remove the legacy dependency but requires changing `DashboardGrid.jsx` more
substantially.  This is a deferred improvement, not required for the fix.

---

## 5. Missing Design Decisions

| Decision | Required Before Fix? | Notes |
|----------|---------------------|-------|
| Apply fix before or after isolation steps | Recommended to apply immediately | Evidence is conclusive; isolation not required |
| Track DlqOperations migration as follow-up | No | Out of scope for this fix |
| Add `vite build` to CI | No | Longer-term improvement |
| Migrate to react-grid-layout v2 native API | No | Deferred; legacy API is stable |

---

## 6. Verification Checklist

After applying the single-line fix:

- [ ] App loads at `http://localhost:5173/` without blank screen
- [ ] Browser console shows no module-load errors
- [ ] `/default/local/dlq_operations` renders (hand-composed view, unaffected by fix)
- [ ] `/default/local/pipeline_health` renders with grid KPI section
- [ ] KPI cards are draggable and reposition correctly
- [ ] Reload restores saved layout positions
- [ ] "Reset layout" button returns cards to definition defaults
- [ ] `npm test` in `portal/` — 82/82 tests pass

---

## 7. Implementation Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `react-grid-layout/legacy` subpath removed in future version | Very Low | Low | Subpath is in package `exports` map; upgrade-time issue only |
| Fix reveals a secondary failure in DashboardRenderer or useDashboardLayout | Low | Medium | Run full verification checklist after fix |
| DlqOperations hand-composed view breaks independently | Very Low | Low | Not modified by this fix; separate code path |

---

## 8. Approval Recommendation

```
APPROVED
```

Root cause is confirmed by static analysis.  The fix is a single-line import path
change with no architectural implications.  Apply immediately and verify with the
browser checklist and test suite.
