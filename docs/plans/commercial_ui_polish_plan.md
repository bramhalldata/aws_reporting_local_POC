# Feature Plan: Commercial UI Polish

**Feature:** Commercial UI Polish
**Stage:** Plan
**Date:** 2026-03-15

---

## 1. Feature Overview

The platform architecture is complete — widget registry, metric catalog, presets, plugin system,
filter bar, widget state model, and developer guides are all in place.  The UI is functional and
consistent but reads as a prototype: flat loading states, no hover feedback on navigation tabs,
no trend context alongside KPI values, and a bare line chart that undersells the data.

This feature delivers targeted visual polish across the shared component layer without touching
routing, artifact contracts, or the widget registration system.  All changes are CSS and JSX
only.  No new dependencies.  No schema or contract changes.

---

## 2. Current UI Observations

### KpiCard

- Box-shadow elevation transition on hover exists (`0.15s ease`) — good foundation
- `sparklineData` prop is wired and reserved but **not rendered** (Phase 5/6 stub)
- Delta line renders in flat `textSecondary` gray regardless of direction —
  `"↑ 12% vs last week"` and `"↓ 12% vs last week"` look identical
- No `cursor: pointer` style — card hover doesn't signal interactivity

### NavBar

- No hover state on inactive tabs — no visual feedback until click
- No transition on the active bottom-border indicator or font-weight change —
  switching tabs snaps between states with no smoothing
- Tab `fontWeight` jumps from 400 → 600 on activation (abrupt)

### TrendChart

- Renders a bare line with no area fill — minimal visual weight
- Card `boxShadow` is very subtle (`0 1px 3px rgba(0,0,0,.06)`) — undersells the card
- `Tooltip` has no custom border or background styling — uses Recharts default
- Chart padding-left `0` forces the Y-axis labels to sit flush against the card edge

### DashboardRenderer

- Loading state is plain `<p>Loading...</p>` text — no animation or skeleton
- Section headers have no visual accent — `sectionTitle` at `1.1rem / textSecondary` is easily
  overlooked; sections blend into one another
- `resetButton` (layout reset control) has no hover state

### HealthBanner

- `bannerField` spacing relies on `paddingRight: "2rem"` rather than `gap` — inconsistent with
  the rest of the layout system
- `bannerValue` uses `fontFamily: monospace` which is appropriate for timestamps but renders
  at system default monospace size — visually inconsistent with surrounding proportional text

### cashmereTheme.js

- Box-shadow values are hardcoded in KpiCard (`0 2px 8px rgba(...)`, `0 4px 16px rgba(...)`)
  and TrendChart — no shared elevation tokens
- Transition values are hardcoded as `"0.15s ease"` in KpiCard — no shared transition token
- No `shadowCard` / `shadowCardHover` / `transitionFast` tokens

---

## 3. Recommended Polish Improvements

Ranked by visual leverage, smallest blast radius first.

### A — Delta color coding in KpiCard  [Tier 1 — pure JSX]

**What:** Derive `deltaStyle.color` from the delta string prefix:
- Starts with `↑` → `theme.accentTeal` (positive)
- Starts with `↓` → `theme.error` (negative)
- Otherwise → `theme.textSecondary` (neutral / unknown)

**Why:** An up-arrow in gray and a down-arrow in gray convey no tone.  An up-arrow in teal and a
down-arrow in red immediately communicate direction without reading the text.

**Impact:** 3-line change in `KpiCard.jsx`.  No prop changes.  No contract changes.

---

### B — NavBar tab hover state and transitions  [Tier 1 — pure JSX]

**What:** Add a subtle hover background to inactive tabs:
- Hover: `background: theme.background` (`#F8FAFC`)
- Add `transition: "background 0.1s ease, color 0.1s ease"` to the tab style function
- Add `cursor: "pointer"` to tab style

**Implementation note:** `NavLink`'s style function only receives `{ isActive }` — hover state
requires a thin `HoverableTab` wrapper component (a `div` or `span` with `useState` hover
tracking) or a global `<style>` block.  The wrapper approach is preferred to keep the NavLink's
routing behaviour intact.

**Why:** Inactive tabs currently have zero feedback on hover.  Any analytics product in
production shows hover feedback on navigation.

**Impact:** ~25-line addition to `NavBar.jsx`.  No routing changes.

---

### C — TrendChart area fill gradient  [Tier 1 — pure JSX/Recharts]

**What:** Switch `<LineChart>` to `<AreaChart>` with a soft gradient fill:
```
gradient: primaryBlue at 18% → primaryBlue at 0% (bottom)
```
Keep the existing line stroke (`primaryBlue`, `strokeWidth: 2`, `dot: false`).  Add a
`<defs><linearGradient>` and `<Area>` component.  Recharts is already installed.

**Why:** A bare line chart on a white card reads as a wireframe.  A gradient area fill adds
visual weight and immediately reads as a commercial data product.

**Impact:** ~15-line change to `TrendChart.jsx`.  No prop changes.  No data shape changes.

---

### D — Section header left-accent border in DashboardRenderer  [Tier 1 — pure CSS]

**What:** Add `borderLeft: "3px solid ${theme.primaryBlue}"` and `paddingLeft: "0.75rem"` to
`sectionTitle` in `DashboardRenderer`.

**Why:** Currently sections blend together — the section heading at `1.1rem / textSecondary`
weight is understated and easy to miss when scanning.  A left-accent border creates clear visual
grouping without adding new elements.

**Impact:** 2-line style change in `DashboardRenderer.jsx`.

---

### E — Loading state pulse animation  [Tier 1 — pure CSS]

**What:** Replace the plain `<p>Loading...</p>` in `DashboardRenderer` with a pulsing skeleton
placeholder:
- A `<div>` block at card height with `background: theme.divider`, `borderRadius: 8`, and a
  CSS `@keyframes` opacity pulse (`1.0 → 0.4 → 1.0`, `1.4s infinite ease-in-out`)
- Inject via a `<style>` tag in the component or use inline animation properties

**Why:** A static "Loading..." text is a prototype UX.  A pulsing skeleton is the standard for
analytics dashboards and communicates that data is in-flight.

**Impact:** ~20-line change to `DashboardRenderer.jsx`.

---

### F — Theme elevation and transition tokens  [Tier 1 — cleanup/foundation]

**What:** Add to `cashmereTheme.js`:
```js
// Elevation
shadowCard:      "0 2px 8px rgba(0,0,0,.07), 0 1px 3px rgba(0,0,0,.04)",
shadowCardHover: "0 4px 16px rgba(0,0,0,.12), 0 2px 6px rgba(0,0,0,.08)",
shadowSubtle:    "0 1px 3px rgba(0,0,0,.06)",

// Motion
transitionFast:  "0.1s ease",
transitionBase:  "0.15s ease",
```
Update `KpiCard.jsx` and `TrendChart.jsx` to reference these tokens instead of magic strings.

**Why:** Centralising elevation values enables consistent depth across all card-style components
and makes future adjustments one-edit.

**Impact:** 5 additions to `cashmereTheme.js`; 4 token substitutions across 2 components.

---

### G — KpiCard sparkline micro-chart  [Tier 2 — render-only, data wiring out of scope]

**What:** When `sparklineData` prop is a non-empty array, render a small Recharts
`<AreaChart>` (height ~44px) at the bottom of the KPI card using the existing `sparklineData`
prop that is already accepted by the component.  When absent, card renders exactly as today.

**Sparkline style:**
- No axes, no labels, no tooltip, no grid
- Same area gradient as the TrendChart improvement (item C)
- `margin: { top: 4, right: 0, bottom: 0, left: 0 }`
- `dot={false}`, `strokeWidth={1.5}`

**Data wiring note:** Populating `sparklineData` via the widget registry propsAdapter requires
access to a secondary artifact or a compound data_source — this is **out of scope** for this
feature.  The sparkline renders only when data is provided by a future publisher step or passed
manually via `kpi_config`.  Zero regression if prop is absent.

**Why:** Even without data wiring, making the sparkline render-capable unblocks the publisher
team to provide trend data without a separate portal deployment.

**Impact:** ~30-line addition to `KpiCard.jsx`.  Prop signature unchanged.  Recharts already
installed.

---

### H — HealthBanner layout cleanup  [Tier 2 — minor]

**What:** Replace `gap: "0"` + `paddingRight: "2rem"` pattern with `gap: "0"` on
`bannerBase` + `columnGap: "2rem"` using a CSS flex layout.  No visual change — this normalises
the spacing model to match the rest of the component layer.

**Impact:** 2-line change to `HealthBanner.jsx`.  No visual regression.

---

## 4. Shared Components Likely Affected

| Component | Improvements | Change type |
|-----------|-------------|-------------|
| `portal/src/theme/cashmereTheme.js` | F — elevation + transition tokens | Additive |
| `portal/src/components/KpiCard.jsx` | A (delta color), F (token refs), G (sparkline) | CSS + conditional render |
| `portal/src/components/NavBar.jsx` | B — hover state + transition | Wrapper + CSS |
| `portal/src/components/TrendChart.jsx` | C (area fill), F (token refs) | Recharts + CSS |
| `portal/src/components/DashboardRenderer.jsx` | D (section accent), E (skeleton) | CSS |
| `portal/src/components/HealthBanner.jsx` | H — layout cleanup | CSS |

---

## 5. Risks / Tradeoffs

| Risk | Mitigation |
|------|-----------|
| Area fill (item C) may mask low-count days by filling the baseline | Gradient fades to 0% opacity at bottom — spikes and drops remain readable; test with sparse data |
| Delta color coding (item A) relies on string prefix — non-standard delta strings won't color | Neutral fallback (`textSecondary`) for unrecognised prefix — no regression |
| Sparkline without data looks like a bug | Sparkline renders only when `sparklineData` is a non-empty array; absent prop is invisible |
| CSS `@keyframes` skeleton may conflict with other global styles | Inject with a component-scoped class name or use a named animation unlikely to clash (`kpi-pulse`) |
| NavBar `HoverableTab` adds an extra DOM element per tab | Wrapper is a `<span>` with `display: flex`; no layout impact |
| Shadow token refactor (item F) is cosmetically identical but touches KpiCard and TrendChart | Verify in visual regression that card appearance is pixel-identical after token swap |
| Gratuitous animation risk | No page-level animations. Skeleton pulse: 1.4s ease, slow and subtle. Chart area: Recharts default entrance animation (0.5s, already present on Line). NavBar: 0.1s hover. All justified by UX value. |

---

## 6. Verification Checklist

### Architecture and contracts unchanged
- [ ] No files outside `portal/src/components/`, `portal/src/theme/` are modified
- [ ] No `definition.json` schemas change
- [ ] No artifact fields added or removed
- [ ] No route changes
- [ ] No new npm dependencies introduced

### Visual quality
- [ ] KpiCard delta: `↑ ...` renders in `accentTeal`; `↓ ...` renders in error red; unrecognised prefix renders in `textSecondary`
- [ ] KpiCard: box-shadow transition still works on hover
- [ ] NavBar: inactive tab shows background highlight on hover; active tab is visually unchanged
- [ ] TrendChart: area gradient fill is visible; line stroke and tooltip unchanged; sparse data (1–3 days) renders without distortion
- [ ] Section headers: left-accent border visible; section content is unaffected
- [ ] Loading state: skeleton block pulses; replaces "Loading..." text only; does not affect error or empty states
- [ ] Theme tokens: KpiCard and TrendChart shadow / transition values are visually identical after token substitution

### UX quality
- [ ] Dashboard feels more dynamic than before — KPI cards have tone on delta, nav responds to hover
- [ ] No animations are distracting — skeleton is slow/subtle; hover transitions are ≤ 0.15s
- [ ] Dashboard clarity is improved, not reduced — section headers are easier to scan
- [ ] KpiCard with `sparklineData: null` or absent: no sparkline, no visual gap
- [ ] `npm test` in `portal/` passes
