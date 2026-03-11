# Review: Drag-and-Drop Dashboard Editing Plan

**Plan artifact:** docs/plans/dashboard_drag_layout_plan.md
**Reviewer role:** Staff-level architecture reviewer
**Review date:** 2026-03-11

---

## 1. Review Summary

The plan is architecturally sound and well-scoped.  Library choice, integration model,
layout state flow, and component decoupling are all correct.

Two concerns from an earlier draft review (widget component height filling, section label
loss) were based on assumptions that do not hold when the actual component code is
inspected.  Both are retracted below.

Two genuine concerns are raised: grid item compaction behaviour is unspecified, and
KpiCard does not fill the full grid cell height.  Both are P2 — they affect visual
quality but not functional correctness.  Neither blocks implementation.

The plan is approved as written.

---

## 2. Strengths of the Plan

**Library choice is correct and well-evidenced.**
`react-grid-layout` is the right tool.  The alternatives table correctly dismisses
`dnd-kit` (too low-level) and `react-beautiful-dnd` (no resize).  The direct mapping
from Phase 6 `{ col, row, w, h }` to react-grid-layout `{ x, y, w, h }` requires zero
coordinate recalculation — this was designed correctly in Phase 6.

**Widget components remain fully decoupled.**
`DashboardGrid` wraps `WidgetRenderer` inside grid items.  `KpiCard`, `WidgetRenderer`,
`TrendChart`, and all other components are correctly listed as unchanged.  Drag logic is
entirely contained in `DashboardGrid` and `DashboardRenderer`.

**Layout state model is clean and Phase 8-ready.**
`{ [sectionId]: Layout[] }` is directly serialisable to localStorage.  The lazy
`useState` initialiser correctly reads from definition coordinates on every mount.

**`"grid"` type slots into the Phase 6 system exactly as the Phase 6 review requested.**
The Phase 6 review explicitly asked for `"grid"` to be documented as a planned type.
This plan delivers it.

**Scope is correctly bounded.**
No persistence, no permissions, no multi-user features.  Session-only layout state is
the right call for Phase 7.

---

## 3. Architectural Concerns

### 3.1 RETRACTED — Widget component height concern does not apply

An earlier draft review required that `TrendChart`, `TopSitesTable`, and
`ExceptionsTable` be added to "Files to Modify" for height-fill fixes.

**This is incorrect.**  Reading the actual definition files:

- `dlq_operations` `kpis` section: `failures_24h`, `failures_7d` — both `kpi_card`
- `pipeline_health` `kpis` section: `docs_processed_24h`, `active_sites_24h`,
  `latest_event` — all `kpi_card`

The plan converts **only `kpis` sections** to `"grid"` type.  `TrendChart`,
`TopSitesTable`, and `ExceptionsTable` live in `"stack"` sections that are not touched.
They are never placed inside a grid cell in Phase 7.

The concern is retracted.  No changes to those components are needed.

---

### 3.2 RETRACTED — Section label loss is not a regression

An earlier draft review required that section label rendering be added above
`DashboardGrid`, claiming labels would be lost.

**This is incorrect.**  Reading `DashboardRenderer.jsx` (current state, post Phase 6):

```jsx
{definition.layout.sections.map((section) => {
  const layoutType = section.layout?.type ?? "stack";
  return (
    <div key={section.id} style={...}>
      {section.widget_ids.map(...)}
    </div>
  );
})}
```

Section `label` fields are **never rendered** by DashboardRenderer.  There are no
visible section headers to lose.  Converting a section to `"grid"` type causes no
regression.

The concern is retracted.  No section label changes are needed.

---

### 3.3 Grid compaction behaviour is unspecified

`react-grid-layout` defaults to `compactType="vertical"` — items compact upward when
space opens.  For a horizontal KPI row (2–3 cards side by side), this means:

- Dragging one card upward may cause other cards to snap to row 0 unexpectedly
- The compaction algorithm may rearrange the row in ways the user did not intend

For a horizontal KPI row `compactType="horizontal"` or `compactType={null}` (free
placement, no auto-compaction) is likely more natural.

**Recommendation:** Specify `compactType` in `DashboardGrid`.  Evaluate visually during
implementation and default to whichever feels right for KPI rows.  Not a blocker, but
the untuned default will likely be the first thing to fix after first render.

---

### 3.4 KpiCard does not fill grid cell height

`KpiCard`'s root element uses `flex: "1 1 200px"` — a flex child shorthand.  Inside a
react-grid-layout grid item (a positioned block), the card renders at its natural
intrinsic height (~130–150px).

With `rowHeight: 80` and `h: 2`, each grid cell is 160px.  The ~10–30px gap at the
bottom of each card is a cosmetic issue — the card is not broken, but it does not fill
the cell.

**Options:**
- Add `height: "100%"` to `KpiCard`'s root `div` style — one-line change; fills the
  cell at any height
- Accept the gap for Phase 7 and polish in Phase 8

This is a visual refinement, not a functional requirement.  The plan does not need to
list `KpiCard.jsx` as a file to modify, but the implementer should be aware of the gap
and can fix it in the same PR.

---

### 3.5 `useState` lazy initialiser captures `definition` at mount

The `useState(() => {...})` initialiser captures `definition` once, at mount.  If
`DashboardRenderer` is ever reused across route changes without unmounting, layout state
will be stale.

Currently React Router unmounts the component on navigation, so this is safe in
practice.  Adding `key={definition.id}` at the `DashboardRenderer` call site in the
router is a one-line defensive safeguard.

---

## 4. Scalability Assessment

**More sections in grid mode:** Any section opts in by changing `layout.type`.  No
code changes needed.

**More dashboards:** Same — definition-driven, no code changes.

**Phase 8 persistence:** `sectionLayouts` maps directly to what localStorage or an
API endpoint stores.  No migration needed.

**Many widgets per grid section:** react-grid-layout handles this at POC scale without
performance concern.

---

## 5. Missing Design Decisions

| Decision | Required Before Implementation? | Notes |
|----------|----------------------------------|-------|
| `compactType` for grid sections | Recommended | Default `"vertical"` may feel wrong for horizontal KPI rows |
| KpiCard `height: 100%` fill | Recommended | Minor visual improvement; one-line change |
| `key={definition.id}` at router call site | No | Defensive safeguard |
| Are all grid items draggable? | No | All-draggable is correct for Phase 7 |

---

## 6. Recommended Improvements

**P2 — Recommended (non-blocking):**

1. Specify `compactType` in `DashboardGrid`.  `"horizontal"` or `null` is likely
   a better default than `"vertical"` for side-by-side KPI card rows.

2. Add `height: "100%"` to `KpiCard`'s root `div` style during implementation so cards
   visually fill the grid cell.  One-line change; treat as part of the same PR.

3. Add `key={definition.id}` at the `DashboardRenderer` router call site as a
   defensive guard against stale layout state.

---

## 7. Implementation Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Default compaction causes unexpected widget jumps | Medium | Low | Tune `compactType` on first render |
| KpiCard visual gap at bottom of grid cell | High | Low | Add `height: 100%` to KpiCard root |
| `WidthProvider` renders width=0 briefly on mount | Low | Low | Known behaviour; acceptable for Phase 7 |
| `react-resizable` CSS import not found | Low | Low | Installed as transitive dep; import path is valid |
| Layout state stale on route reuse | Low | Low | `key={definition.id}` safeguard |

---

## 8. Approval Recommendation

```
APPROVED
```

The plan is architecturally sound, correctly scoped, and ready to implement.

The two P1 items from an earlier draft review are retracted after inspecting the actual
component code — the widget height issue and section label issue do not apply.

The remaining concerns (compaction behaviour, KpiCard height fill) are P2 visual polish
items that can be addressed during implementation without revising the plan.
