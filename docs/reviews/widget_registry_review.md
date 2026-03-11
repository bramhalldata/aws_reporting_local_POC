# Review: Widget Registry Plan

**Plan artifact:** docs/plans/widget_registry_plan.md
**Review date:** 2026-03-11
**Reviewer:** External architecture review (staff-level)

---

## 1. Review Summary

The plan correctly identifies that Phase 2 already delivered the registry mechanism and avoids re-implementing it. Phase 3 is scoped to three incremental improvements: extracting `WidgetRenderer` as a standalone component, formalizing the registry with a JSDoc contract, and documenting the type catalog.

This is an appropriately small, low-risk phase. The scope is honest and the changes are additive with no behavioral modification to any existing dashboard.

**Recommendation: APPROVED**

---

## 2. Strengths of the Plan

### Correct diagnosis of what Phase 2 delivered
The plan starts from "here is what already exists" and derives work from genuine gaps rather than redefining finished work. This is disciplined scope management.

### WidgetRenderer extraction has real value
A private function inside a 194-line component file is not reusable. Extracting it creates a testable unit with a clear, stable interface: `{ widget, artifacts }` in, rendered React element out. Future consumers (history diff view, widget preview panel) can import it directly.

### No `registerWidget()` function
The plan explicitly defers dynamic registration to Phase 9. Adding a `registerWidget()` API now would create the illusion of a plugin system without actually delivering one, and would require all future plugin-loading logic to be backward-compatible with the Phase 3 API shape. Keeping the registry as a plain object is the right call for this stage.

### Planned types documented as comments, not stubs
Stub components for `bar_chart`, `text_block`, `alert_panel` would add dead code that must be maintained. Comment-only documentation communicates intent without creating maintenance burden. Correct choice.

### UnknownWidget co-located with WidgetRenderer
`UnknownWidget` is only used by `WidgetRenderer`. Moving it with the extraction keeps related code together and prevents `DashboardRenderer.jsx` from having display-layer responsibilities it doesn't own.

---

## 3. Architectural Concerns

### Concern 1 — JSDoc typedef provides no enforcement (minor, acknowledged)
The plan acknowledges that `WidgetRegistryEntry` as a JSDoc typedef has no runtime enforcement. This is acceptable for a JS-only codebase. However, a contributor who accidentally provides `propsMapper` instead of `propsAdapter` in a new registry entry would not receive any error until runtime.

**Recommendation:** Add a single-line runtime validation comment near the registry export:
```javascript
// Each entry must have: { component: ReactComponent, propsAdapter: function }
// Incorrect entry shape will fail silently at render time — verify by loading the dashboard.
```
This sets developer expectations without adding runtime overhead.

---

### Concern 2 — `DashboardRenderer.jsx` import path assumes flat component structure (minor)
The plan specifies `import WidgetRenderer from "./WidgetRenderer.jsx"` inside `DashboardRenderer.jsx`. Both files live in `portal/src/components/`, so this is a sibling import. This is correct and consistent with how other components are structured. No issue — noting it for confirmation during implementation.

---

### Concern 3 — Type naming convention table could drift from implementation (minor)
The plan includes a type catalog table in the plan document. If the registry is updated in future phases without updating the plan, the table becomes stale. The **registry file itself** is the canonical source of truth — the plan table is documentation only.

**Recommendation:** The comment block in `widgetRegistry.js` should be the living type catalog. The plan's table is for review reference; the implementation should keep the registry file authoritative.

---

## 4. Scalability Assessment

### Registry scales to dozens of types without structural change
A plain object lookup is O(1). The registry can hold 50 widget types with no performance concern. The pattern does not require changes to `DashboardRenderer` or `WidgetRenderer` as types are added.

### WidgetRenderer is stable regardless of registry size
Because resolution is a single `widgetRegistry[widget.type]` lookup, adding new types never modifies `WidgetRenderer.jsx`. The component is closed to modification and open to extension — correct OCP behavior.

### Planned type documentation prevents naming conflicts
By reserving `bar_chart`, `text_block`, `alert_panel` in the catalog, future contributors won't accidentally register a competing type under a different name (e.g., `barchart` vs `bar_chart`). The comment-level reservation is a lightweight form of API governance.

---

## 5. Missing Design Decisions

None that block implementation. Phase 3 is well-defined and incremental.

One forward-looking note: When Phase 4 (Reusable KPI Card Contract) introduces delta/sparkline/status-tone props to KPI cards, the `kpi_card` propsAdapter in `widgetRegistry.js` will need to be updated. This is expected and does not require plan revision now.

---

## 6. Recommended Improvements

1. Add a short runtime-expectation comment to `widgetRegistry.js` describing the required entry shape (see Concern 1)
2. Keep the type catalog living in `widgetRegistry.js` comments — not in the plan document — as the authoritative source going forward
3. After extraction, run a quick visual check of `pipeline_health` in the browser to confirm `WidgetRenderer` renders identically after the refactor

---

## 7. Implementation Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Circular import introduced by extraction | Very low | `WidgetRenderer.jsx` only imports `widgetRegistry` and `theme` — no cycle possible |
| `DashboardRenderer.jsx` breaks after removing inline definitions | Low | Straightforward find-and-replace with an import; build will catch any mistake |
| Planned type comments accidentally treated as registered types | Low | Use unambiguous comment syntax: `// PLANNED (not registered):` |
| Phase 4 KPI card changes break existing `kpi_card` propsAdapter | Expected, future | Out of scope for Phase 3; handle in Phase 4 |

---

## 8. Approval Recommendation

**APPROVED**

Implementation may proceed without revision. The three recommended improvements are minor and can be addressed inline. No blocking issues.
