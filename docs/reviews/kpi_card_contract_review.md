# Review: Reusable KPI Card Contract Plan

**Plan artifact:** docs/plans/kpi_card_contract_plan.md
**Review date:** 2026-03-11
**Reviewer:** External architecture review (staff-level)

---

## 1. Review Summary

The plan is well-structured and appropriately scoped. It correctly identifies what the current `KpiCard` lacks, defines a clean optional-props extension, enforces UX guardrails, and provides a clear data flow trace from `definition.json` through the renderer to the component.

The decision to make all new props optional — preserving exact backward compatibility — is architecturally correct. The forward alignment with Phase 5 (Metric Catalog) is thoughtfully addressed.

Two implementation concerns are noted: one around the hover implementation (minor) and one around the `kpi_config` spread approach (worth flagging). Neither blocks implementation.

**Recommendation: APPROVED WITH REVISIONS** — proceed; address the two noted items inline.

---

## 2. Strengths of the Plan

### UX guardrails are explicit and enforceable
The plan does not just describe desired aesthetics — it maps guardrails directly to implementation decisions: primary value stays `textPrimary` (dark) with no color override, tone is only in the 3px top border, delta and footnote are size-constrained. This gives implementers clear constraints that prevent drift.

### Null guard on `value` is the right call
The current component calls `value.toLocaleString()` unconditionally. The plan adds a nullish guard that renders `"—"`. This prevents a class of silent runtime errors when an artifact field is missing or the publisher produced null for a metric.

### propsAdapter spread pattern is elegant
`...(widget.kpi_config ?? {})` means the adapter is future-proof: adding `delta`, `sparklineData`, or `icon` to `kpi_config` in a definition file automatically passes it through to the component without touching the adapter again. This is clean.

### Phase 5 alignment is well-reasoned
The plan identifies exactly which props will be overridden by the metric catalog (`label` ← catalog name, `tone` ← threshold rules) and correctly notes that `KpiCard` itself will remain unchanged. This is the right level of future-proofing — enough to avoid rework without implementing Phase 5 early.

### Hover state scoped correctly
The interaction pattern explicitly states: hover is purely visual, no data fetch, no routing. This keeps the component stateless for its data while adding the expected interactive feel. The scope is right.

---

## 3. Architectural Concerns

### Concern 1 — `kpi_config` spread is too permissive (minor, should address)

The propsAdapter uses:
```javascript
...(widget.kpi_config ?? {})
```

This passes **any key** in `kpi_config` as a prop to `KpiCard`. Today that's safe. But if a definition author writes:

```json
"kpi_config": { "tone": "positive", "style": "bold" }
```

...then `style="bold"` will be passed as a string prop to a React element. React will forward unknown string props to the DOM, generating a console warning. More critically, if a future `kpi_config` field name collides with a native HTML attribute (`id`, `class`, `type`), it would silently interfere.

**Recommendation:** In the propsAdapter, destructure only known keys instead of using a full spread:
```javascript
propsAdapter: (widget, data) => {
  const { tone, footnote, delta, sparklineData } = widget.kpi_config ?? {};
  return { label: widget.title, value: data, tone, footnote, delta, sparklineData };
}
```
This is slightly more verbose but prevents any unknown key from reaching the component or the DOM.

---

### Concern 2 — Hover implementation needs clarity (minor)

The plan specifies hover state via `useState(hovered)` with box-shadow increase. This is the correct pattern for inline CSS hover effects in React. However, the plan does not specify:
- What the default shadow is: `0 2px 8px rgba(0,0,0,.07), 0 1px 3px rgba(0,0,0,.04)` (from current styles)
- What the hovered shadow should be (a stronger variant)

Without this, the implementer must guess. Suggest specifying the hover shadow value in the plan, or deferring hover entirely to the visual polish phase (since the plan states visual polish is explicitly out of scope).

**Recommendation:** Either specify the hover shadow value explicitly, or defer hover to Phase visual polish and remove it from Phase 4 scope. A half-implemented hover that requires guessing values is worse than no hover.

---

## 4. Scalability Assessment

### Adding new optional props in future phases
Because all Phase 4 props are optional with defaults, adding `icon`, `deltaSign`, or `sparklineData` rendering in future phases requires only:
1. Adding the prop to `KpiCard` with a default of `undefined`/`null`
2. Rendering it conditionally
3. Adding the field to `kpi_config` in definitions that need it

No cascading changes to the registry, renderer, or other components. The architecture scales cleanly.

### Supporting multiple metric types
The `value` prop accepts both numbers and strings. The null guard adds a third case. This covers:
- Count metrics (integer): `1,234`
- Percentage metrics (number): `98.5` → `"98.5"` (toLocaleString on a float)
- Timestamp metrics (string): `"2026-03-07 06:52:55"`
- Missing data (null): `"—"`

The only gap is formatted percentages (`0.985` should show as `"98.5%"`) — but that belongs in Phase 5 (Metric Catalog formatter rules), not Phase 4.

---

## 5. Missing Design Decisions

### What text color for `delta`?
The plan says delta is always `textSecondary` in Phase 4. This is stated in the UX guardrails section but not made explicit in the props table or rendering behavior section. Confirm in implementation that `delta` has no conditional coloring logic — plain `textSecondary` always.

### Does `footnote` truncate or wrap?
The plan says "single line; truncates with ellipsis if overlong." The implementation must set `overflow: hidden; text-overflow: ellipsis; white-space: nowrap` on the footnote style. This should be explicit in the component — an accidentally wrapping footnote violates the "no multi-line explanations" guardrail.

---

## 6. Recommended Improvements

1. **Replace `...widget.kpi_config` spread** with explicit destructuring of known keys in the propsAdapter (see Concern 1)
2. **Clarify or defer hover** — either specify the exact hovered shadow value, or move hover to visual polish (see Concern 2)
3. **Footnote style** must include `white-space: nowrap; overflow: hidden; text-overflow: ellipsis` to enforce single-line constraint
4. **Delta text color** — confirm implementation uses `theme.textSecondary` with no conditional logic in Phase 4

---

## 7. Implementation Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| `kpi_config` spread passes unexpected props to DOM | Medium if spread is used | Replace with explicit destructuring per Concern 1 |
| Hover shadow value guessed incorrectly | High without specification | Specify or defer hover |
| Footnote wraps instead of truncating | Medium if style not specified | Explicit `white-space: nowrap` in footnote style |
| `DlqOperations.jsx` callers unaffected by new props | Expected, not a risk | Those cards use hard-coded props — note in implementation comments |
| `tone="unknown"` silently fallbacks — no dev warning | Low | Acceptable; add a console.warn in development mode optionally |

---

## 8. Approval Recommendation

**APPROVED WITH REVISIONS**

Implementation may proceed. Address before marking complete:

1. Replace `...widget.kpi_config` spread with explicit destructuring of `{ tone, footnote, delta, sparklineData }`
2. Make a decision on hover: specify the shadow delta value explicitly, or defer to visual polish phase
3. Add `white-space: nowrap; overflow: hidden; text-overflow: ellipsis` to footnote style
