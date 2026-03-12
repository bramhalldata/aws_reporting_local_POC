# Review: Dashboard Registry Plan (Feature 9)

**Plan artifact:** docs/plans/dashboard_registry_plan.md
**Reviewer role:** Staff-level architecture reviewer
**Review date:** 2026-03-11

---

## 1. Review Summary

The plan is correct, minimal, and well-scoped.  Collapsing two manually-synced exports
into a single `dashboardRegistry` array is the right structural fix.  The entry shape,
consumer updates, and verification steps are all appropriate.

Two concerns are raised:

- **P2 — `component` field creates eager import coupling**: Every entry in
  `dashboardRegistry` holds a direct component reference, meaning all dashboard
  components are always eagerly imported.  This is the current behavior and fine at two
  dashboards; it becomes a bundle-size concern at larger scale.  Worth documenting as a
  known trade-off.
- **P2 — JSDoc typedef lives in `index.js` rather than a shared types file**: For a
  project this size, inline JSDoc is appropriate.  If the typedef is needed by multiple
  consumers in the future, it should be extracted to a shared location.

Neither concern blocks implementation.

The plan is approved as written.

---

## 2. Strengths of the Plan

**Eliminates the only structural sync risk in the current codebase.**
The "keep ids in sync" comment and DEV-only `console.warn` in `NavBar.jsx` are both
defensive patches around a structural problem.  Replacing the two-export pattern with
a single array removes the need for both.

**Scope is precisely bounded.**
Three files change: `dashboards/index.js`, `App.jsx`, `NavBar.jsx`.  All dashboard
view components, hooks, definition files, and publisher files are untouched.  This is
the correct minimum change set.

**Array order is the right choice over object key order.**
JavaScript object key order is an implementation detail that happens to be stable for
string keys in V8 — but it is not a language guarantee.  An explicit array is the
correct way to express ordered tab display.

**Entry shape is extensible without touching consumers.**
Adding `icon`, `description`, or `definitionPath` fields to a registry entry does not
require any changes to `App.jsx` or `NavBar.jsx`.  This is the key property that makes
the registry feel like a platform primitive rather than a list.

**Verification smoke test is concrete and meaningful.**
The "add a third dummy dashboard and confirm it appears without touching App.jsx or
NavBar.jsx" test directly validates the feature's stated goal.

---

## 3. Architectural Concerns

### 3.1 `component` field creates eager import coupling (P2)

Every `dashboardRegistry` entry holds a direct component reference:

```js
import DlqOperations  from "./dlq_operations/DlqOperations.jsx";
import PipelineHealth from "./pipeline_health/PipelineHealth.jsx";

export const dashboardRegistry = [
  { id: "dlq_operations", component: DlqOperations, ... },
  ...
];
```

This means all dashboard components are imported at bundle load time, regardless of
which route the user navigates to.  At two dashboards this is immaterial.  At ten or
twenty dashboards with complex component trees, it increases initial bundle size.

The alternative — lazy entries using `() => import(...)` — would require `React.lazy`
wrapping in `App.jsx` and a `<Suspense>` boundary.  That is out of scope for this
feature.

**No action required for Feature 9.**  The current eager-import pattern is inherited
from the existing `dashboards/index.js` and not made worse by this plan.  Document it
as a known trade-off for future consideration.

---

### 3.2 Typedef in `index.js` vs. shared types file (P2)

The plan adds a `@typedef {Object} DashboardRegistryEntry` JSDoc comment in
`dashboards/index.js`.  For a project this size, this is appropriate.  If the type is
referenced in multiple files (e.g. a future `DashboardPicker` component), it should be
moved to a shared location such as `portal/src/types.js`.

**No action required now.**  This is a future housekeeping note.

---

## 4. Scalability Assessment

**Adding dashboards:** One object literal in `dashboardRegistry` plus one import.  No
other files touched.  This is the correct end state for dashboard registration.

**Tab order changes:** Reorder the array — no other changes needed.

**Future per-entry metadata:** Add fields to the entry object.  Consumers access what
they need; unused fields are ignored.

**Code splitting at scale:** When bundle size becomes a concern, the entry's `component`
field can be replaced with a lazy factory without changing the array shape.  `App.jsx`
would wrap the component in `React.lazy`.  This migration path is clear and contained.

---

## 5. Missing Design Decisions

| Decision | Required Before Implementation? | Notes |
|----------|----------------------------------|-------|
| Eager vs. lazy component imports | No — document as known trade-off | Lazy loading is a future optimization |
| Typedef location | No — inline is fine at current scale | Extract later if needed by multiple consumers |

---

## 6. Recommended Improvements

**P2 — Non-blocking:**

1. Add a brief comment to `dashboardRegistry` noting that components are eagerly
   imported and that lazy loading is the path forward if bundle size becomes a concern.

---

## 7. Implementation Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Import name mismatch (`dashboards`/`dashboardMeta` still referenced) | Low | Build error — caught immediately | Update both `App.jsx` and `NavBar.jsx` import lines |
| DEV sync check removal causes missed sync bugs | None | None | Single source of truth eliminates the need for the check |
| Tab order changes unintentionally | Very Low | Low | Array order is explicit; matches current key order |

---

## 8. Approval Recommendation

```
APPROVED
```

The plan is correct, minimal, and solves the stated problem cleanly.  No revisions
required.  Implementation may proceed.
