# Review: Cross-Dashboard Widget Reuse Plan (Feature 11)

**Plan artifact:** docs/plans/widget_reuse_plan.md
**Reviewer role:** Staff-level architecture reviewer
**Review date:** 2026-03-11

---

## 1. Review Summary

The plan is well-scoped and selects the right abstraction level.  Introducing an
optional `"preset"` field in `definition.json` with shallow-merge resolution in a new
utility is the minimal change that enables reuse without changing the JSON schema in a
breaking way or introducing complexity into `WidgetRenderer`, `DashboardGrid`, or any
other rendering component.

Three concerns are raised:

- **P2 — `resolveWidgets` is called from `DashboardRenderer` but is not tested**: The
  utility is pure (no React, no side effects) and should have dedicated unit tests.
  The plan's verification checklist covers browser-visible outcomes but does not include
  a test file.
- **P2 — `definition.json` stays JSON but now depends on an external JS file**: The
  `"preset"` field is a forward reference into `widgetPresets.js`.  A developer reading
  only the JSON cannot know what the preset resolves to without opening the second file.
  The `add-dashboard.md` guide should be updated to document presets.
- **P3 — No validation that a preset reference is valid at definition load time**: An
  unknown preset ID is silently passed through to `WidgetRenderer` where it renders a
  warning.  This is acceptable but a console warning at resolve time would surface the
  issue earlier.

None of these concerns block implementation.

The plan is approved as written.

---

## 2. Strengths of the Plan

**Correct abstraction level.**
The plan reuses only what is genuinely shared: the binding of `type + metric +
data_source` for widgets that appear across multiple dashboards.  It explicitly does
not attempt to share section structure, layout positions, or title text — those remain
dashboard-specific.  This is the right boundary.

**Backward compatibility is complete.**
Widgets without a `"preset"` field pass through `resolveWidgets` unchanged.  Existing
`definition.json` files require no migration.  `pipeline_health/definition.json` is
correctly left unmodified.

**Resolution location is correct.**
Presets are resolved once in `DashboardRenderer` before any widget reaches
`WidgetRenderer` or `DashboardGrid`.  Neither downstream component needs to know about
presets.  This is a clean layering decision.

**`resolveWidgets` is pure and isolated.**
The utility has no React imports, no side effects, and no dependencies other than the
presets map.  It is fully testable without a browser or component harness.

**Merge semantics are clear and simple.**
Shallow merge (`{ ...preset, ...localFields }`) is predictable.  A developer overriding
`layout` gets exactly what they wrote — no partial deep-merge surprises.  The plan
documents this explicitly in the Presets vs. Local Overrides table.

**Unknown preset degrades gracefully.**
Passing through an unresolved widget means `WidgetRenderer`'s existing unknown-type
warning covers the failure case.  No new error boundary is needed.

**`dlq_operations` demonstration is valuable.**
Updating the existing dashboard to use presets validates the feature against real
artifact data rather than hypothetical test fixtures.  The two-widget conversion is
small enough to be safe.

---

## 3. Architectural Concerns

### 3.1 `resolveWidgets` needs unit tests (P2)

The plan's verification checklist covers only browser-visible outcomes.  `resolveWidgets`
is a pure function with well-defined inputs and outputs — it should have a dedicated
test file.

Minimum cases to cover:

```
resolveWidgets([{ id: "w1", preset: "p1" }], { p1: { type: "kpi_card", metric: "x", ... } })
→ [{ id: "w1", type: "kpi_card", metric: "x", ... }]  // preset fields applied, id preserved

resolveWidgets([{ id: "w1", preset: "p1", layout: { col: 0, row: 0, w: 4, h: 2 } }], presets)
→ layout from local, not from preset  // override wins

resolveWidgets([{ id: "w1" }], presets)
→ [{ id: "w1" }]  // no-preset widget passes through unchanged

resolveWidgets([{ id: "w1", preset: "nonexistent" }], presets)
→ [{ id: "w1" }]  // unknown preset: local-only (no crash)
```

**Recommended improvement:** Add `portal/src/dashboards/__tests__/resolveWidgets.test.js`
to the Files to Create section.

---

### 3.2 `add-dashboard.md` should document preset usage (P2)

The guide written in Feature 10 covers inline widget definitions only.  After this
feature, a developer can also write preset-based widgets.  Without a guide update, the
`"preset"` field is undiscoverable.

The guide needs a short new section:
- What a preset is and when to use one (widget binding reused across ≥ 2 dashboards)
- How to reference a preset (`"preset": "<preset_id>"`)
- How to override a field locally (local field wins)
- Where to find existing presets (`portal/src/dashboards/widgetPresets.js`)
- When to add a new preset (≥ 2 dashboards need the same binding)

**Recommended improvement:** Add `portal/src/dashboards/docs/guides/add-dashboard.md`
(update, not create) to the Files to Modify section.

---

### 3.3 No early warning for unknown preset IDs (P3)

Currently, `resolveWidgets` silently returns an unresolved widget for unknown preset
IDs.  `WidgetRenderer` then renders a warning when it cannot find a type in
`widgetRegistry`.  This means the diagnostic is one layer removed from the actual
problem.

**Recommended improvement (non-blocking):** In `resolveWidgets`, add a `console.warn`
when a preset ID is not found:

```js
if (!presets[widget.preset]) {
  console.warn(`[resolveWidgets] Unknown preset: "${widget.preset}". Widget "${widget.id}" not resolved.`);
}
```

This does not change behavior but improves developer experience without coupling the
utility to any framework.

---

## 4. Completeness Assessment

| Plan section | Covered? | Complete? |
|--------------|---------|-----------|
| Feature overview and motivation | Yes | Yes |
| Current duplication — concrete examples | Yes | Yes — failures_24h and failures_7d named |
| What is already reused (and should not change) | Yes | Yes — metricCatalog, widgetRegistry, DashboardRenderer |
| Proposed mechanism | Yes | Yes — preset field + shallow merge |
| Merge semantics table | Yes | Yes — field-by-field override behavior documented |
| Files to create (widgetPresets.js, resolveWidgets.js) | Yes | Yes |
| Files to modify (DashboardRenderer, dlq_operations definition) | Yes | Yes — change count specified |
| Files NOT modified | Yes | Yes — complete list |
| Unit tests for resolveWidgets | No | P2 — add to Files to Create |
| Guide update | No | P2 — add to Files to Modify |
| Risks / tradeoffs | Yes | Yes |
| Verification checklist | Yes | Mostly — lacks test file execution step |

---

## 5. Scalability Assessment

**Adding a new preset:** One entry in `widgetPresets.js`.  No other files change.

**Using a preset in a new dashboard:** One `"preset"` field in the widget definition.
The existing inline pattern remains valid for dashboard-specific widgets.

**Retiring a preset:** Remove the entry from `widgetPresets.js`; any dashboards using
it will render a WidgetRenderer warning — the failure is visible and contained.

**Group presets (future):** The plan correctly defers named widget groups to a future
feature.  The current model is a foundation, not a ceiling.

---

## 6. Missing Design Decisions

| Decision | Required Before Implementation? | Notes |
|----------|----------------------------------|-------|
| Deep vs. shallow merge for nested fields | Decided — shallow; documented | Correct choice for simplicity |
| Preset ID naming convention | Not addressed | Recommend `<metric_id>_kpi` for KPI presets; document in widgetPresets.js |
| Who owns preset additions (any developer vs. platform team) | Not required now | Low risk at current scale |

---

## 7. Implementation Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `definition.widgets` reference missed in DashboardRenderer | Low | KPI cards render from raw (unresolved) definition | Plan specifies all 3 reference sites to replace |
| Preset shadowing a metric — override pattern misused | Low | Wrong metric rendered | Merge semantics table documents override behavior clearly |
| `resolveWidgets` import path incorrect | Low | Build error — caught immediately | `../dashboards/resolveWidgets.js` from DashboardRenderer |

---

## 8. Approval Recommendation

```
APPROVED — with P2 improvements incorporated during implementation
```

Both P2 items (unit test file + guide update) should be added to the implementation
scope — they are small enough not to require plan revision.  The P3 console.warn can
be included at the implementer's discretion.
