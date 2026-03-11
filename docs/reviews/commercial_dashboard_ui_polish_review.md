# Commercial Dashboard UI Polish — Plan Review

**Feature:** Commercial Dashboard UI Polish (Datadog / Stripe Style)
**Plan artifact:** `docs/plans/commercial_dashboard_ui_polish_plan.md`
**Date:** 2026-03-10
**Reviewer:** Claude Code
**Recommendation:** APPROVED WITH ONE NOTE

---

## 1. Feature Overview

**Assessment: Correct and well-scoped.**

The plan is correctly bounded as visual-only. The statement "no architectural changes,
no new data contracts, no new routes, no new libraries" is verifiable against the
4-file change set. The framing (Datadog/Stripe polish, not a redesign) is accurate —
these are the kind of targeted CSS tweaks that take a functional prototype to a
presentable product.

---

## 2. Current UI Observations

**Assessment: Accurate.**

The current-state observations are verified against the component source:

- KpiCard value color: `theme.error` (#DC2626) confirmed — hardcoded red for ALL
  metrics including non-failure ones (`total_documents_last_24h` in PipelineHealth)
- TopSitesTable / ExceptionsTable: no hover, no striping, left-aligned numbers confirmed
- HealthBanner: full semantic-colored background (`theme.successBg` / `theme.errorBg`)
  confirmed in `getBannerStyle()` — the entire wide bar carries the background color

All three observations are accurate and the problems are real.

---

## 3. Three UI Improvements

### Improvement 1 — KpiCard

**Assessment: Correct. The specific changes are well-chosen.**

**Value-first layout:** The flip from label-above-value to value-above-label is the
correct Datadog/Stripe pattern. It matches the visual convention users expect from
production analytics dashboards. The JSX change is three lines.

**Color change (red → textPrimary):** This is the highest-impact single change in the
plan. `theme.error` on non-failure metrics (pipeline_health) is genuinely wrong — it
signals alarm when there is none. Changing to `theme.textPrimary` is correct. The
HealthBadge already communicates severity in the comparison view; KPI numbers showing
in black is unambiguous.

**Font size 2.25rem → 2.75rem:** A 22% size increase produces clear dominance. This
is appropriate given the value-first layout — the number becomes the headline.

**Blue accent top border:** The `3px solid theme.primaryBlue` top border is a well-
established commercial dashboard pattern (Grafana panels use it, Datadog uses color-
coded top bars). It anchors the card identity and introduces brand color without
requiring new tokens. Using `borderTop` as a separate property from `border` in the
inline style object is the correct technique for overriding a subset of border sides.

**Shadow upgrade:** The two-layer shadow (`0 2px 8px rgba(0,0,0,.07), 0 1px 3px
rgba(0,0,0,.04)`) produces a more natural depth gradient than a single box-shadow.
The values are conservative — this will not look heavy.

**No caller changes:** This is important. DlqOperations.jsx and PipelineHealth.jsx
do not need to be touched. The change is entirely in KpiCard.jsx.

---

### Improvement 2 — Table Styling

**Assessment: Correct. Two implementation details need implementation-time attention.**

**Zebra striping:** Using `theme.background` (#F8FAFC) for even rows against
`theme.surface` (#FFFFFF) for odd rows is the correct contrast ratio — subtle but
visible. The index-based approach is straightforward.

**Hover highlight with `onMouseEnter`/`onMouseLeave`:** Using `#EFF6FF` matches the
`baseRowHighlight` style already defined in `RunHistory.jsx` — consistent cross-page.
The implementation correctly uses `rowKey` (the `site` name for TopSitesTable, the
`failure_type` for ExceptionsTable) to identify which row is hovered.

**Note 1 — `useState` import:**

Both TopSitesTable.jsx and ExceptionsTable.jsx currently do not import `useState`.
The plan correctly identifies this requirement. This is a one-line addition to each file.

```js
import { useState } from "react";
```

**Right-aligned numeric column:** The `textAlign: "right"` on both the `th` and `td`
for the numeric column is correct. `fontVariantNumeric: "tabular-nums"` is a well-chosen
addition — it prevents numbers from shifting horizontally as rows change value, which
would otherwise be noticeable in a live-updating dashboard.

**Header border weight 1px → 2px:** A heavier bottom border on the header row is a
standard technique to visually separate column headers from data rows. Correct.

**Last row border removal:** Removing the bottom border from the last `td` prevents
the doubled-border artifact at the card-edge. Implementation note: this requires
checking `index === data.length - 1` in the `.map()` callback. Both TopSitesTable
and ExceptionsTable will need to pass `index` and the data length into the row render.

---

### Improvement 3 — Metadata Strip

**Assessment: Correct. The neutral-banner approach is the right design decision.**

**Background change to neutral:** Replacing semantic-colored backgrounds with
`theme.surface` and `theme.border` is precisely right. The status chip already
communicates the state — the banner background color is redundant and dominant.
Removing the colored background makes the page header area focused on data, not status.

**Padding reduction (0.75rem → 0.5rem):** Saves approximately 10px of vertical space
on the page. This is meaningful — it means KPI cards appear higher in the viewport
without scrolling.

**Timestamp format `fmtDate()` helper:** Using the same format as RunHistory.jsx
(`YYYY-MM-DD HH:MM UTC`) achieves visual consistency across pages. The implementation
correctly notes this is display-only — the prop values are unchanged. The inline helper
function does not need a separate utility import.

**Semantic meaning preserved:** SUCCESS/ERROR/WARNING is still communicated via the
status pill with semantic colors. The change removes redundancy (banner + pill), not
information.

---

## 4. Files to Modify

**Assessment: Correct. 4 files only.**

The 4-file scope is appropriate for the 3 improvements:
- KpiCard.jsx: 1 file for improvement 1
- TopSitesTable.jsx + ExceptionsTable.jsx: 2 files for improvement 2 (identical changes)
- HealthBanner.jsx: 1 file for improvement 3

The explicit list of files NOT changed (DlqOperations, PipelineHealth, RunHistory,
RunCompare, cashmereTheme, routes, hooks) is correct and provides a useful constraint
boundary for implementation.

---

## 5. CSS Changes Summary

**Assessment: Correct and complete.**

The before/after table accounts for all style property changes. The `fontVariantNumeric`
entry is present. The HealthBanner banner background and border changes are correctly
described as semantic → neutral.

One addition not in the table (but correct in the prose): the `fmtDate()` timestamp
formatting helper in HealthBanner. This is a display change, not a CSS property, so
its absence from the CSS table is appropriate.

---

## 6. Expected Visual Impact

**Assessment: Accurate description.**

The before/after visual hierarchy description is correct:

- Before: Alert banner > Label > Number
- After: Title > KPI cards > Chart/Tables > Metadata strip

This hierarchy matches production analytics dashboards (Datadog's dashboard layout
places metrics prominently and status in a secondary header).

---

## 7. Verification Checklist

**Assessment: Complete. 12 visual checks + 2 regression checks.**

The 12-row verification table covers:
- Both dashboards (dlq_operations and pipeline_health) ✓
- All three improvement categories ✓
- Explicit regression check for Run History (unchanged) ✓
- Build and test pass ✓

All checks are specific and verifiable. No check requires subjective judgment — each
has a measurable pass criterion.

---

## Summary Assessment

| Section | Status |
|---------|--------|
| Feature overview | ✓ Visual-only; 4 files; no architecture changes |
| Current UI observations | ✓ Accurate; verified against component source |
| KpiCard upgrade | ✓ Value-first layout; neutral color; accent bar; shadow |
| Table styling | ✓ Zebra, hover, right-align numbers; useState import noted |
| Metadata strip | ✓ Neutral background; compact padding; colored chip preserved |
| Files to modify | ✓ 4 files; explicit no-change list |
| CSS changes summary | ✓ Complete before/after table |
| Visual impact | ✓ Correct hierarchy description |
| Verification checklist | ✓ 12 visual + 2 regression checks |

**Recommendation: APPROVED WITH ONE NOTE**

1. **Last-row border removal requires index tracking in both table components.**
   The plan correctly identifies the goal (remove bottom border on last row) but the
   implementation detail — passing `index` and comparing against `data.length - 1` in
   the `.map()` callback — must be applied to both `TopSitesTable.jsx` and
   `ExceptionsTable.jsx`. The data prop names differ (`sites` vs `exceptions`), so the
   implementation must use the correct prop name in each file when computing `isLast`.
   This is a minor implementation detail, not a design concern. The implementor should
   confirm the variable names before writing the code.
