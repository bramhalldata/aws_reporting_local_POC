# Review: Layout Abstraction Plan

**Plan artifact:** docs/plans/layout_abstraction_plan.md
**Reviewer role:** Staff-level architecture reviewer
**Review date:** 2026-03-11

---

## 1. Review Summary

The plan is well-scoped and architecturally sound. It correctly targets the documented
`isKpiRow` heuristic debt and replaces it with a clean config-driven model.  The two-tier
approach — section `layout.type` for current rendering, widget `layout.col/row/w/h` as
a pre-populated contract for Phase 7 — is the right incremental strategy.

The DashboardRenderer change is minimal (one lookup replaces a loop), backward compatibility
is guaranteed by default, and no files outside the portal are touched.

Two concerns are raised that should inform Phase 7 planning, but neither blocks Phase 6
implementation.

---

## 2. Strengths of the Plan

**Fulfils an explicit documented debt.**
The `isKpiRow` heuristic is marked `// Replace with explicit layout hints in Phase 6`
in two places in DashboardRenderer.  This plan discharges that debt directly.

**Minimal and focused change surface.**
Three files modified.  The DashboardRenderer change is a single-line lookup replacing a
5-line loop.  No new imports, no new state, no component restructuring.

**Backward compatible by default.**
`section.layout?.type ?? "stack"` means any definition file without a `layout` block
continues to render correctly.  Zero breakage risk on deploy.

**Widget coordinates pre-populated for Phase 7.**
All widgets in both definitions will carry `col/row/w/h` after this feature, giving Phase 7
(drag-and-drop grid) real initial positions to work from without a second pass over every
definition file.

**12-column grid is the right convention.**
Supports halves (w: 6), thirds (w: 4), and full-width (w: 12).  Matches react-grid-layout
defaults.  No custom grid math required.

**Unchanged components list is complete and explicit.**
Publisher, SQL, artifact files, and all portal components except DashboardRenderer are
correctly excluded.

---

## 3. Architectural Concerns

### 3.1 `row` is relative to section — semantics unclear for Phase 7

The plan defines `row` as "0-based row start within the section."  This means every
first widget in every section has `row: 0`.  This is correct for a model where each
section renders its own independent grid instance.

However, react-grid-layout's standard model uses a **single grid per page** with absolute
`y` positions.  If Phase 7 adopts a per-page grid rather than per-section grids, all
widget `row` values will need to be recalculated as absolute page positions — effectively
requiring a second migration over all definition files.

**Recommendation:** Add a note to the plan clarifying the intended Phase 7 grid model:
- Option A: One grid per section (current `row` semantics work as-is)
- Option B: One grid per dashboard (current `row: 0` on every widget is placeholder;
  absolute values assigned in Phase 7)

Either approach is valid.  The ambiguity should be resolved before Phase 7 planning so
definition authors understand what `row` means.  Not a Phase 6 blocker.

---

### 3.2 No `"grid"` type defined — Phase 7 will need to add one

The plan introduces `"flex_row"` and `"stack"`.  Neither maps to "render using a grid
library."  Phase 7 will almost certainly need a `"grid"` section type that tells
DashboardRenderer to hand widget positioning off to react-grid-layout.

Without pre-defining `"grid"`, Phase 7 must:
1. Add a new `layout.type` value
2. Update DashboardRenderer's rendering switch
3. Update all relevant section definitions

This is fine work for Phase 7, but noting the expected type now prevents the Phase 7
planner from having to rediscover the gap.

**Recommendation:** Add `"grid"` to the list of documented `layout.type` values in the
plan, with a note that `DashboardRenderer` does not implement it yet.  One line to add.
Not a blocker.

---

### 3.3 Section `layout.type` and per-widget coordinates will diverge at Phase 7

There is a latent design tension: `"flex_row"` sections currently render with CSS flexbox
(no coordinates used), while `"grid"` sections (Phase 7) will render using coordinate
metadata.  This means in Phase 7:

- `"flex_row"` sections: `widget.layout.col/row/w/h` are unused
- `"grid"` sections: `widget.layout.col/row/w/h` drive positioning

The transition path is: when a section's `layout.type` is changed from `"flex_row"` to
`"grid"`, its widget coordinates immediately become active.  This is a clean migration
path — no data loss, no schema change.

**Recommendation:** Document this transition path in the Future Compatibility section of
the plan so Phase 7 planners understand the relationship.  Not a blocker.

---

## 4. Scalability Assessment

**More dashboards:** Adding layout config to new definition files is trivial.  No central
registry or renderer changes needed.

**More widget types:** The layout contract is widget-type-agnostic.  A future `bar_chart`
or `gauge` widget uses the same `layout` fields.

**More clients:** Per-client layout is not addressed (correctly noted as future).  The
design supports it via `layout_overrides` in client config without touching base definitions.

**Phase 7 readiness:** react-grid-layout needs `{ i, x, y, w, h }` per item.  The plan's
`{ col, row, w, h }` maps directly (`i` = widget `id`, `x` = `col`, `y` = `row`).
One-to-one mapping; no schema redesign needed for Phase 7.

---

## 5. Missing Design Decisions

| Decision | Required Before Phase 6? | Notes |
|----------|--------------------------|-------|
| Is `row` relative to section or absolute page position? | No | Must resolve before Phase 7 planning |
| Will Phase 7 use one grid per section or one per page? | No | Drives `row` semantics above |
| What is the `"grid"` layout type value? | No | Should be documented now as planned |
| Should `h` have a documented default (e.g. 2 for KPI, 4 for tables)? | No | Convention useful for future authors |

---

## 6. Recommended Improvements

**P2 — Recommended (non-blocking):**

1. Add `"grid"` to the `layout.type` value table as "planned, Phase 7" so future
   definition authors know it is coming.

2. Clarify in §3.2 whether `row` is relative to section or absolute to page.  Even a
   one-sentence clarification eliminates ambiguity for Phase 7 planners.

3. Update the `styles.kpiRow` comment in DashboardRenderer to say what it now means
   (e.g. `// Layout type "flex_row" — horizontal flex wrap`).  The plan mentions
   updating this comment but does not specify the replacement text.

---

## 7. Implementation Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `isKpiRow` removal breaks visual layout | Low | Medium | Definitions must have `layout.type` set before DashboardRenderer change deploys; plan updates both together |
| `section.layout?.type` reads `undefined` on old definition | Low | None | `?? "stack"` fallback handles it |
| Widget `row: 0` semantics must change for Phase 7 | Medium | Low in Phase 6 (unused) | Document expectation; address in Phase 7 plan |
| New dashboard added without `layout` on a section | Medium | Low | Falls back to `"stack"`; worst case is a flex section renders as stack |

---

## 8. Approval Recommendation

```
APPROVED
```

The plan is architecturally sound, tightly scoped, and directly retires the documented
Phase 6 debt.  No required revisions.

All concerns are noted as non-blocking guidance for Phase 7 planning:
- Clarify `row` semantics (relative vs. absolute) before Phase 7 begins
- Document `"grid"` as a planned `layout.type` value
- Note the `"flex_row"` → `"grid"` transition path

Implementation may proceed.
