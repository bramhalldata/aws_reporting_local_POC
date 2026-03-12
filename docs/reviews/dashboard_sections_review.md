# Review: Dashboard Sections Plan (Feature 12)

**Plan artifact:** docs/plans/dashboard_sections_plan.md
**Reviewer role:** Staff-level architecture reviewer
**Review date:** 2026-03-11

---

## 1. Review Summary

The plan is minimal and correct.  It correctly identifies that `label` already exists
in the schema but is unused, and that the fix is to render it — not to redesign the
schema.  The only schema addition is an optional `description` field, which is
backward-compatible.  Rendering changes are confined to `DashboardRenderer.jsx`.

Two concerns are raised:

- **P2 — Grid branch wrapper `<div>` moves the `key` prop**: The plan correctly
  identifies this but does not specify the wrapper's style.  The grid branch currently
  returns `<DashboardGrid key={section.id} ...>` directly.  Wrapping in a `<div>`
  without the `section` margin style may cause inconsistent spacing compared to the
  stack branch.  The wrapper `<div>` should carry the same `styles.section` margin
  as the stack branch.
- **P3 — `label` rendered as h2 has no visual separator from the previous section's
  widgets**: On dashboards with many sections (e.g., DLQ Operations has five), section
  headings will visually blur together without sufficient margin above.  A `marginTop`
  on `sectionHeader` (or `section` style) would separate sections clearly.

Neither concern blocks implementation.

The plan is approved as written.

---

## 2. Strengths of the Plan

**Activates existing dead metadata.**
The `label` field has always been in the schema; it was just never consumed.  Rendering
it is the minimal correct action — no new schema primitives are needed.

**Additive schema change.**
`description` is optional and omitting it produces no visual difference.  Existing
`definition.json` files that lack `description` continue to render correctly.

**Heading suppression by omission.**
A section without a `label` renders no heading and no empty container.  This is the
right default — no boolean flag needed.

**Heading is outside the grid container.**
Placing the section header above `DashboardGrid` (not inside it) means the heading is
never draggable, never part of the grid coordinate system, and never affected by layout
persistence.  This is architecturally correct.

**Scope is precisely bounded.**
Four files are modified: `DashboardRenderer.jsx`, two definition files, and the guide.
`DashboardGrid`, `WidgetRenderer`, all hooks, and all registry files are untouched.

---

## 3. Architectural Concerns

### 3.1 Grid branch wrapper needs a style (P2)

The plan's grid branch wraps `DashboardGrid` in a `<div key={section.id}>` to allow
placement of the section header.  The plan does not specify a style on this wrapper.

The stack branch currently renders `<div style={styles.section}>` which provides
`marginBottom: "2rem"`.  If the grid branch wrapper has no style, the spacing after a
grid section will be inconsistent with the spacing after a stack section.

**Recommended fix:** Apply `styles.section` to the grid branch wrapper div as well:

```jsx
<div key={section.id} style={styles.section}>
  {section.label && (...)}
  <DashboardGrid ... />
</div>
```

This is a one-property addition to the plan's JSX; no style entry changes are needed.

---

### 3.2 No top margin between consecutive sections (P3)

Sections currently have `marginBottom: "2rem"` (from `styles.section`).  The section
heading for the next section immediately follows, creating tight visual proximity
between the previous section's last widget and the next section's heading.

**Recommended fix:** Add `paddingTop: "0.5rem"` or `marginTop: "1rem"` to
`sectionHeader`, or increase the `marginBottom` on the existing `section` style.
Either approach adds visible separation without a redesign.

This is a polish improvement; it does not block implementation.

---

## 4. Completeness Assessment

| Plan section | Covered? | Complete? |
|--------------|---------|-----------|
| Feature overview | Yes | Yes |
| Current limitation | Yes | Yes — `label` identified as dead metadata |
| Schema addition | Yes | Yes — `description` optional, backward-compatible |
| Rendering approach | Yes | Mostly — P2 wrapper style gap noted |
| Grid branch DOM change | Yes | Yes — wrapper div and key migration noted |
| Stack branch heading placement | Yes | Yes |
| definition.json updates (demo) | Yes | Yes — two dashboards, concrete examples |
| Guide update | Yes | Yes |
| Files NOT modified | Yes | Yes — complete list |
| Section spacing between sections | No | P3 — top margin on sectionHeader |
| Verification checklist | Yes | Yes — grid drag regression and Reset button included |

---

## 5. Missing Design Decisions

| Decision | Required Before Implementation? | Notes |
|----------|----------------------------------|-------|
| Wrapper div style for grid branch | Yes (P2) | Apply `styles.section` to wrapper; prevents spacing regression |
| Top margin / section separation | No (P3) | Implement at discretion; improves readability at no cost |

---

## 6. Implementation Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Grid branch `key` moved from DashboardGrid to wrapper `<div>` | Low | React warning or double-mount in StrictMode | Move `key` to outer `<div>`; DashboardGrid receives no `key` prop |
| `DashboardGrid` receives extra wrapper causing layout shift | Very Low | Cosmetic | Verify drag-and-drop at localhost after implementation |
| `section.description` undefined check missing | None | Plan uses conditional rendering `{section.description && <p>...}` correctly | No action needed |

---

## 7. Approval Recommendation

```
APPROVED — P2 wrapper style fix incorporated during implementation
```

The P2 item (wrapper `<div>` style for grid branch) should be applied during
implementation.  The P3 spacing polish can be included at the implementer's discretion.
No plan revision required.
