# Plan: Apply Cashmere UI Theme to React Portal

## Context

The portal used an ad-hoc inline style object with raw hex constants scattered throughout
`portal/src/App.jsx`. This plan applies the Cashmere UI theme (defined in
`skills/ui/cashmere-theme.md`) to standardize all visual styling. No data logic, component
structure, layout, or architecture was changed — this is a pure presentation-layer update.

Skill applied: `skills/ui/cashmere-theme.md`

---

## Architecture Compliance

| Requirement | How it is met |
|-------------|--------------|
| Portal is presentation-only | Only styles changed; no data logic, API calls, or metrics touched |
| No layout changes | Component hierarchy and JSX structure unchanged |
| No artifact contract changes | SQL, publisher, validators, artifacts all unchanged |

---

## Files Changed

| File | Change |
|------|--------|
| `portal/src/theme/cashmereTheme.js` (new) | Centralized Cashmere color token object |
| `portal/src/App.jsx` | Import theme; replace hardcoded colors with tokens; add status helpers |

---

## Token Diff

| Element | Before | After | Token |
|---------|--------|-------|-------|
| Page background | none | `#F8FAFC` | `theme.background` |
| Card/banner borders | `#e2e8f0` | `#CBD5E1` | `theme.border` |
| Table row dividers | `#f1f5f9` | `#E2E8F0` | `theme.divider` |
| Secondary/axis text | `#64748b` | `#475569` | `theme.textSecondary` |
| Muted text | `#94a3b8` | `#94A3B8` | `theme.textMuted` |
| bannerValue color | `#1e293b` | `#0F172A` | `theme.textPrimary` |
| Error pill bg | `#fef2f2` | `#FEE2E2` | `theme.errorBg` |
| Error box background | `#fef2f2` | `#FEE2E2` | `theme.errorBg` |
| Error box border | `#fecaca` | `#FECACA` | `theme.errorBorder` |
| Chart line | `#dc2626` (red) | `#1D4ED8` (primary blue) | `theme.primaryBlue` |

**Unchanged (already compliant):**
- `kpiValue` red (`#DC2626`) — correct; "Failures → red" per Cashmere skill
- SUCCESS pill green — unchanged
- `tableTitle` / card header background `#F8FAFC` — already correct

---

## Status-based Helpers

Two helper functions centralize status-to-style mapping for the `HealthBanner`:

### `getBannerStyle(status)`

| Status | Background | Border |
|--------|-----------|--------|
| SUCCESS | `#DCFCE7` | `#86EFAC` |
| WARNING | `#FEF3C7` | `#FDE68A` |
| ERROR / other | `#FEE2E2` | `#FECACA` |

### `getStatusPillStyle(status)`

| Status | Background | Text |
|--------|-----------|------|
| SUCCESS | `#DCFCE7` | `#166534` |
| WARNING | `#FEF3C7` | `#92400E` |
| ERROR / other | `#FEE2E2` | `#991B1B` |

`styles.banner` was renamed to `styles.bannerBase` (structural properties only) so
`getBannerStyle()` injects semantic background/border without conflict.

`styles.pillSuccess` and `styles.pillError` were removed — replaced by `getStatusPillStyle()`.

---

## Verification Steps

1. `cd portal && npm run build` — exits 0
2. `cd portal && npm run dev` — confirm:
   - Page has light `#F8FAFC` background
   - Card borders are `#CBD5E1` (visibly slightly darker)
   - Trend chart line is blue (`#1D4ED8`) instead of red
   - KPI failure values remain red (semantic: failures = error color)
   - SUCCESS banner is green; ERROR banner would be red
   - No raw hex constants remain in `App.jsx` styles
