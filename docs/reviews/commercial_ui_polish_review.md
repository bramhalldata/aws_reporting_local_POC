# Feature Review: Commercial UI Polish

**Feature:** Commercial UI Polish
**Plan artifact:** docs/plans/commercial_ui_polish_plan.md
**Reviewer:** Self-review (pre-implementation)
**Date:** 2026-03-15

---

## Summary

The plan is well-scoped: eight targeted improvements across six shared files, all CSS and JSX
changes, zero new dependencies, zero contract changes.  The Tier 1 items (A–F) are
straightforwardly implementable.  The sparkline (G) is correctly deferred to render-only with
a clear data-wiring note.  The improvement priority order is correct — delta color coding and
NavBar hover state are the highest-leverage per line of code; area fill is the most visually
impactful single change.

---

## Findings

### P2 — Specify the `HoverableTab` approach to avoid over-engineering

**Location:** §3 item B — NavBar hover state

"A thin `HoverableTab` wrapper component" is mentioned but not specified.  Without
specification, implementation could drift toward a CSS class strategy (which would require
a `<style>` block and a class naming convention) or a per-tab `useState` that recreates
identical logic N times.

**Recommendation:** Implement as a single `HoverableTab` internal function component within
`NavBar.jsx` — not exported, not a separate file.  It accepts `to`, `children`, and style
props; manages its own `hovered` state; and renders a `NavLink` wrapped in a `span`.  This
keeps the change self-contained in one file.

---

### P2 — Skeleton implementation must not use a global `<style>` tag injected into the body

**Location:** §3 item E — Loading state pulse animation

"Inject via a `<style>` tag in the component" is listed as an option.  If that `<style>` tag
is appended to `document.head` on each render (a common naive implementation), it will
accumulate duplicate rules.

**Recommendation:** Use a single module-level `<style>` tag rendered once as part of
`DashboardRenderer`'s JSX output (not imperatively injected), or use an inline `animation`
property with a predefined `@keyframes` string appended once with a guard.  The simplest safe
approach: define the `@keyframes kpi-pulse` rule in `portal/public/index.html` or the
existing global CSS file, then reference `animation: "kpi-pulse 1.4s ease-in-out infinite"`
inline.  If no global CSS file exists, a single `<style>` JSX element inside the component
tree (not imperative DOM injection) is acceptable.

---

### P3 — Gradient definition for area fill and sparkline should be consistent

**Location:** §3 items C and G

The TrendChart area fill and the KpiCard sparkline both call for a `primaryBlue` gradient.
If each defines its own `<linearGradient>` with its own `id` (e.g. `trendAreaGradient` vs
`sparklineGradient`), this is fine and expected — SVG gradient IDs are scoped to the SVG.
But if both use the same id string in the same DOM tree, the second definition will silently
shadow the first.

**Recommendation:** Use distinct, unique `id` values for each gradient definition:
`id="trendAreaFill"` in TrendChart and `id="sparklineAreaFill"` in KpiCard.

---

### P3 — `valueFontSize` override on KpiCard should be verified as unaffected by sparkline

**Location:** §3 item G — KpiCard sparkline

When `sparklineData` is present, the card gains ~52px of height (44px chart + 8px padding).
If `valueFontSize` is overridden to a larger size AND sparkline is present, the card may
visually overflow its grid cell.

**Recommendation:** Add a verification checklist item: confirm KpiCard renders without
overflow at `valueFontSize: "2.75rem"` (default) and `valueFontSize: "1.4rem"` (override)
with `sparklineData` present.  No code change needed — the fix would only apply if overflow
is observed.

---

## Scope Confirmation

| Non-goal | Confirmed excluded? |
|----------|-------------------|
| Complete redesign | Yes — six files, all shared components, no layout changes |
| Route changes | Yes — no routing files touched |
| Artifact contract changes | Yes — no JSON schema, no artifact fields |
| Framework migration | Yes — no new dependencies; Recharts already installed |

---

## Files to Create / Modify

| File | Action | Confirmed in plan? |
|------|--------|--------------------|
| `portal/src/theme/cashmereTheme.js` | Add elevation + transition tokens | Yes |
| `portal/src/components/KpiCard.jsx` | Delta color, token refs, sparkline | Yes |
| `portal/src/components/NavBar.jsx` | HoverableTab wrapper, hover state | Yes |
| `portal/src/components/TrendChart.jsx` | AreaChart fill, token refs | Yes |
| `portal/src/components/DashboardRenderer.jsx` | Section accent, skeleton | Yes |
| `portal/src/components/HealthBanner.jsx` | Layout cleanup | Yes |

---

## Verdict

**APPROVED — P2 items (HoverableTab specification, skeleton `<style>` safety) and P3 items
(distinct gradient IDs, sparkline overflow verification) are all includable in implementation
scope.**

Implementation may proceed.
