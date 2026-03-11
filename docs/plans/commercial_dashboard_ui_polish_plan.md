# Commercial Dashboard UI Polish — Implementation Plan

**Feature:** Commercial Dashboard UI Polish (Datadog / Stripe Style)
**Plan artifact:** `docs/plans/commercial_dashboard_ui_polish_plan.md`
**Review artifact:** `docs/reviews/commercial_dashboard_ui_polish_review.md`
**Date:** 2026-03-10
**Status:** Draft — pending review

---

## 1. Feature Overview

The platform is functionally complete with a realistic demo scope. The UI is clean
but reads as a developer prototype rather than a commercial analytics product.

Three targeted visual improvements — each requiring only small CSS and component
edits — eliminate the prototype feel and produce styling consistent with production
observability dashboards (Datadog, Stripe, Vercel).

No architectural changes. No new data contracts. No new routes. No new libraries.

---

## 2. Current UI Observations

### KpiCard.jsx (current state)

- Label displayed ABOVE the large number (label-first order)
- Value font-size: `2.25rem`, color: `theme.error` (#DC2626 red) hardcoded for ALL metrics
- Red value color is appropriate for failure counts (DLQ Operations) but incorrect for
  pipeline health metrics like `total_documents_last_24h` — those are not failure signals
- Card shadow: `0 1px 3px rgba(0,0,0,.06)` — very subtle, barely visible
- Padding: `1.25rem 1.5rem` — adequate but not generous

### TopSitesTable.jsx + ExceptionsTable.jsx (current state)

- No row striping — all rows same background (surface white)
- No hover highlight — rows are visually static
- Numeric columns (`Failures`, `Count`) are left-aligned — inconsistent with standard
  table conventions where numbers are right-aligned
- Header row has identical background to data rows — poor visual separation

### HealthBanner.jsx (current state)

- The entire banner carries the semantic color: SUCCESS triggers a large green background
  block spanning the full page width
- Padding `0.75rem 1.25rem` makes the banner tall and prominent — it visually competes
  with the dashboard title and KPI cards
- Result: "large alert-style block" that dominates the first 90px of every dashboard view
- The metadata content (generated_at, schema_version) is useful but secondary — it should
  not command as much visual attention as KPI numbers

---

## 3. Three UI Improvements

---

### Improvement 1 — KpiCard Upgrade

**File:** `portal/src/components/KpiCard.jsx`

**Goal:** Metric cards with value-first layout, neutral strong number, larger font, better
depth — matching Datadog / Stripe metric card style.

#### Changes

**Layout order:** Flip label and value. Render the large number first, label below.

```
Before:        After:
──────────     ──────────
FAILURES—24H   89
89             Failures — Last 24h
```

**Value color:** Change from `theme.error` (red, always-on alarm) to `theme.textPrimary`
(#0F172A, near-black). This is the correct Datadog/Stripe pattern: metric values are
neutral; color-coded status belongs in health badges and status pills — not in the
KPI number itself. The HealthBadge already communicates severity.

**Value font-size:** Increase from `2.25rem` to `2.75rem` for stronger visual dominance.

**Label font-size:** Reduce from `0.75rem` to `0.7rem` and soften to `textMuted` (#94A3B8)
to create clear typographic hierarchy (large neutral number + small muted label).

**Card shadow:** Upgrade from `0 1px 3px rgba(0,0,0,.06)` to
`0 2px 8px rgba(0,0,0,.07), 0 1px 3px rgba(0,0,0,.04)` — multi-layer shadow produces
more natural depth without looking heavy.

**Padding:** Increase from `1.25rem 1.5rem` to `1.5rem 1.75rem` — more breathing room
around the large number.

**Add a subtle top accent bar:** A 3px blue (`theme.primaryBlue`) top border on the card
gives it a branded anchor point — a common pattern in Datadog and Grafana metric panels.

#### Resulting style object

```js
kpiCard: {
  flex: "1 1 200px",
  background: theme.surface,
  border: `1px solid ${theme.border}`,
  borderTop: `3px solid ${theme.primaryBlue}`,   // new: accent bar
  borderRadius: 8,
  padding: "1.5rem 1.75rem",                     // was: 1.25rem 1.5rem
  boxShadow: "0 2px 8px rgba(0,0,0,.07), 0 1px 3px rgba(0,0,0,.04)",  // was: 0 1px 3px .06
},
kpiValue: {
  fontSize: "2.75rem",                            // was: 2.25rem
  fontWeight: 700,
  color: theme.textPrimary,                       // was: theme.error
  lineHeight: 1,
  marginBottom: "0.4rem",
},
kpiLabel: {
  fontSize: "0.7rem",                             // was: 0.75rem
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.07em",
  color: theme.textMuted,                         // was: textSecondary
  marginBottom: 0,                                // label is now below, no bottom margin needed
},
```

#### JSX change

```jsx
// Before
<div style={styles.kpiCard}>
  <div style={styles.kpiLabel}>{label}</div>
  <div style={styles.kpiValue}>{value.toLocaleString()}</div>
</div>

// After
<div style={styles.kpiCard}>
  <div style={styles.kpiValue}>{value.toLocaleString()}</div>
  <div style={styles.kpiLabel}>{label}</div>
</div>
```

No prop changes. No caller changes. `value` is already passed as a number and
`toLocaleString()` is already called.

---

### Improvement 2 — Professional Table Styling

**Files:**
- `portal/src/components/TopSitesTable.jsx`
- `portal/src/components/ExceptionsTable.jsx`

**Goal:** Tables with zebra striping, hover highlight, and right-aligned numeric columns —
matching Stripe / Datadog list table style.

Both components share identical `styles` patterns, so the same changes apply to both.

#### Changes

**Zebra striping:** Alternate row backgrounds on even rows.
```js
// Applied via index in the .map()
tdEven: { background: theme.background },   // #F8FAFC — light off-white
// odd rows: default surface (#FFFFFF)
```

**Hover highlight:** Use `onMouseEnter` / `onMouseLeave` on `<tr>` with a `hoveredRow`
state. No CSS modules or `<style>` injection needed.

```jsx
const [hoveredRow, setHoveredRow] = useState(null);

// On each <tr>:
onMouseEnter={() => setHoveredRow(rowKey)}
onMouseLeave={() => setHoveredRow(null)}
style={hoveredRow === rowKey ? styles.trHover : (isEven ? styles.trEven : {})}
```

Hover style:
```js
trHover: { background: "#EFF6FF" },  // soft blue — matches Run History base row style
trEven:  { background: theme.background },
```

**Right-aligned numeric column:** The second column (`Failures` / `Count`) should be
right-aligned. This requires two targeted styles: one for the numeric `<th>`, one for
the numeric `<td>`.

```js
thRight: { ...styles.th, textAlign: "right" },
tdRight: { ...styles.td, textAlign: "right", fontVariantNumeric: "tabular-nums" },
```

`fontVariantNumeric: "tabular-nums"` ensures consistent number width across rows,
preventing visual jitter when numbers differ in digit count.

**Header row visual separation:** Strengthen the header background by using
`theme.background` (already present) and adding a slightly heavier bottom border:
```js
th: {
  ...existing,
  borderBottom: `2px solid ${theme.border}`,  // was: 1px — double weight header separator
},
```

**Last row border removal:** Remove the bottom border from the last table row to
prevent a doubled border at the card edge.

```jsx
// In each td: check if it's the last row
style={{ ...tdStyle, borderBottom: isLast ? "none" : undefined }}
```

#### State import

Add `useState` import to both files (currently neither imports it):
```js
import { useState } from "react";
```

---

### Improvement 3 — Metadata Strip Simplification

**File:** `portal/src/components/HealthBanner.jsx`

**Goal:** Replace the large semantic-colored banner block with a compact, neutral
metadata strip where the status chip carries the color and the banner itself is quiet.

#### The problem precisely

Currently, `getBannerStyle(status)` returns a full-width background color:
```js
// SUCCESS → large green block across entire page width
{ background: theme.successBg, border: `1px solid ${theme.successBorder}` }
```

This is appropriate for an alert, not a metadata summary. The SUCCESS status is good
news — it should not command the same visual space as an error.

#### Change: neutral banner, colored chip only

```js
// Replace getBannerStyle — always returns neutral
function getBannerStyle() {
  return {
    background: theme.surface,
    border: `1px solid ${theme.border}`,
  };
}
```

The status pill already carries the semantic color via `getStatusPillStyle()` — no
change needed there. SUCCESS still appears green; it's just the chip, not the background.

#### Change: reduce padding and margin

```js
bannerBase: {
  display: "flex",
  flexWrap: "wrap",
  gap: "0",
  borderRadius: 8,
  padding: "0.5rem 1.25rem",       // was: 0.75rem 1.25rem — reduce vertical padding
  marginBottom: "1rem",            // was: 1.5rem — less separation from KPI section
  alignItems: "center",
  rowGap: "0.25rem",               // was: 0.5rem
},
```

#### Change: metadata values — compact formatting

The timestamp values (`report_ts`, `generated_at`) are currently full ISO strings in
monospace. Shorten the displayed format to match the style used in Run History:

```js
// Helper (inline, no import needed):
function fmtDate(isoStr) {
  return isoStr ? isoStr.replace("T", " ").replace("Z", " UTC") : "—";
}
```

Apply in the banner JSX:
```jsx
<span style={styles.bannerValue}>{fmtDate(reportTs)}</span>
<span style={styles.bannerValue}>{fmtDate(generatedAt)}</span>
```

This is purely display — the underlying prop values are unchanged.

#### Change: reduce label size

```js
bannerLabel: {
  fontSize: "0.6rem",          // was: 0.65rem — slightly smaller
  ...existing uppercase/weight/letterSpacing,
},
bannerValue: {
  fontSize: "0.75rem",         // was: 0.8rem — compact
  ...existing fontFamily monospace,
},
```

#### Result visual concept

```
┌────────────────────────────────────────────────────────────┐
│ STATUS        DATA AS OF             GENERATED    SCHEMA   │  ← 0.5rem padding
│ [SUCCESS]     2026-03-10 09:00 UTC   2026-03-11   1.2.0   │
└────────────────────────────────────────────────────────────┘
```

vs current:

```
┌─────────────── large green background block ───────────────┐
│ STATUS         DATA AS OF              GENERATED  SCHEMA   │  ← 0.75rem padding
│ [SUCCESS]      2026-03-10T09:00:00Z    2026-03-11 1.2.0   │
└────────────────────────────────────────────────────────────┘
```

---

## 4. Files to Modify

| File | Change type | Lines affected (approx.) |
|------|-------------|--------------------------|
| `portal/src/components/KpiCard.jsx` | Style edits + JSX reorder | ~35 lines total |
| `portal/src/components/TopSitesTable.jsx` | Style edits + hover state | ~60 lines total |
| `portal/src/components/ExceptionsTable.jsx` | Style edits + hover state | ~60 lines total |
| `portal/src/components/HealthBanner.jsx` | Style edits + format helper | ~70 lines total |

**No changes to:**
- Dashboard layout components (DlqOperations.jsx, PipelineHealth.jsx)
- Page components (RunHistory.jsx, RunDetail.jsx, RunCompare.jsx)
- Theme file (cashmereTheme.js)
- Routes, hooks, utilities, publisher, schemas

---

## 5. CSS Changes Summary

| Component | Property | Before | After |
|-----------|----------|--------|-------|
| KpiCard | value color | `theme.error` (red) | `theme.textPrimary` (near-black) |
| KpiCard | value font-size | `2.25rem` | `2.75rem` |
| KpiCard | label color | `textSecondary` | `textMuted` |
| KpiCard | padding | `1.25rem 1.5rem` | `1.5rem 1.75rem` |
| KpiCard | shadow | `0 1px 3px rgba(.06)` | `0 2px 8px rgba(.07), 0 1px 3px (.04)` |
| KpiCard | top border | none | `3px solid theme.primaryBlue` |
| KpiCard | layout order | label → value | value → label |
| TopSitesTable | row bg (even) | `theme.surface` | `theme.background` |
| TopSitesTable | row bg (hover) | none | `#EFF6FF` |
| TopSitesTable | numeric col align | left | right |
| TopSitesTable | numeric col font | default | tabular-nums |
| TopSitesTable | header border | `1px solid` | `2px solid` |
| TopSitesTable | last row border | divider | none |
| ExceptionsTable | (same as TopSitesTable) | — | — |
| HealthBanner | banner background | semantic color | `theme.surface` (neutral) |
| HealthBanner | banner border | semantic border | `theme.border` (neutral) |
| HealthBanner | padding vertical | `0.75rem` | `0.5rem` |
| HealthBanner | margin-bottom | `1.5rem` | `1rem` |
| HealthBanner | timestamp format | full ISO string | `YYYY-MM-DD HH:MM UTC` |

---

## 6. Expected Visual Impact

### KPI Cards

Before: small label on top, large red number below — alarm-style widget.

After: large dark authoritative number on top, small muted label below — information
density display. Blue accent bar anchors the card identity. Deeper shadow separates
cards from the background plane.

### Tables

Before: flat white rows, left-aligned numbers — spreadsheet feel.

After: light zebra rows, blue hover highlight, right-aligned numbers with tabular
alignment — matches Stripe's transaction tables and Datadog's metric tables.

### Metadata Strip

Before: large green/yellow/red block dominates top of page — looks like an alert.

After: compact neutral strip with small colored status chip — the dashboard content
becomes the visual focus. The strip is informational, not alarming.

**Combined effect:** The dashboard reads as a professional analytics product. The visual
hierarchy becomes: Title > KPI cards > Chart/Tables > Metadata strip (instead of:
Alert banner > Label > Number).

---

## 7. Verification Checklist

```bash
# Start the portal dev server
cd portal && npm run dev
```

### Visual checks

| # | Check | Expected result |
|---|-------|----------------|
| 1 | Open `http://localhost:5173/contexture/local/dlq_operations` | KPI cards show large dark numbers with blue accent bars; failure counts are near-black, not red |
| 2 | KPI card order | Number appears above label (e.g., `89` then `Failures — Last 24h`) |
| 3 | KPI card shadow | Cards visually separate from page background with visible but not heavy shadow |
| 4 | Top Sites table | Even rows have a slightly different background from odd rows |
| 5 | Top Sites table hover | Hovering a row produces a soft blue highlight |
| 6 | Top Sites table numbers | Failures column header and values are right-aligned |
| 7 | Metadata strip | Banner is neutral (not green/yellow/red background); status chip is colored |
| 8 | Metadata strip size | Strip is visibly shorter/thinner than before; does not dominate the page top |
| 9 | Open `http://localhost:5173/contexture/local/pipeline_health` | Same improvements visible; `total_documents` KPI no longer shows in red |
| 10 | Open `http://localhost:5173/contexture/local/history` | Run History page unchanged — no table hover, no accent bars |
| 11 | Open any Run Comparison | Run Comparison header and tables unchanged |
| 12 | Switch to `default/local` | Improvements carry over (same components) |

### Regression checks

```bash
cd portal && npm test         # All tests pass
cd portal && npm run build    # Build completes without errors
```

---

## 8. Non-Goals

| Excluded | Reason |
|----------|--------|
| Routing or page layout changes | Visual polish only |
| New color tokens in cashmereTheme.js | All values used are existing tokens or one-off inline values |
| Animated transitions | Out of scope for Phase 1 polish |
| Mobile responsive improvements | Dashboard is desktop-first; no viewport changes |
| Dark mode | Not in the current theme system |
| Chart styling (TrendChart) | The line chart is already visually adequate; not a priority |
| Run History / Run Compare table styling | Those tables serve a different purpose; consistent with their own patterns |
