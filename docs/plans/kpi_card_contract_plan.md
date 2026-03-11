# Reusable KPI Card Contract — Implementation Plan

**Feature:** Reusable KPI Card Contract
**Roadmap Phase:** 4 of 10
**Branch:** feature/dashboard-plugin-architecture
**Date:** 2026-03-11

---

## 1. Feature Overview

The current `KpiCard` component accepts only `{ label, value }`. It is functional but not portable — it carries no comparison context, no tone, no footnote, and no way for a dashboard definition to configure display behavior without writing custom JSX.

Phase 4 establishes `KpiCard` as a **first-class, config-driven dashboard primitive** that can appear on any dashboard without per-page customization. All new props are optional so existing dashboards need no forced changes.

This is an **architecture and contract** phase. Visual polish, metric catalog integration, and advanced interactions are explicitly deferred.

---

## 2. Current KPI Card Limitations

```jsx
export default function KpiCard({ label, value }) {
  return (
    <div style={styles.kpiCard}>
      <div style={styles.kpiValue}>{value.toLocaleString()}</div>
      <div style={styles.kpiLabel}>{label}</div>
    </div>
  );
}
```

**Limitations:**
- No comparison context — users cannot tell if a number is good or bad
- No status tone — top border is always `primaryBlue` regardless of metric state
- No footnote — measurement window (e.g. "24-hour rolling") must be embedded in the label
- No delta — no way to show change from a prior period
- `value` is always formatted as a localized number — fails gracefully for strings but was not designed for them
- Dashboard-specific label text is hard-coded in `DlqOperations.jsx` props; not driven by definition config

---

## 3. KPI Design Pattern Summary

All KPI cards must follow a strict visual hierarchy. The hierarchy is non-negotiable:

### Hierarchy (top to bottom)

```
┌──────────────────────────────────┐  ← tone-colored top border (3px)
│ METRIC LABEL                     │  ← Eyebrow: smallest text, muted, uppercase
│                                  │
│ 1,234                            │  ← Hero value: largest element, dominant
│                                  │
│ ↓ down 8% vs last week           │  ← Delta: small, contextual, single line
│                                  │
│ 24-hour rolling window           │  ← Footnote: smallest, muted, explanatory
└──────────────────────────────────┘
```

### UX Guardrails (enforced by component design)

| Rule | Implementation |
|------|---------------|
| Primary value must dominate | `2.75rem bold` — unchanged from current |
| Label must not compete | `0.7rem uppercase muted` — unchanged |
| Color in tone/delta, not in the number | Primary value always `textPrimary` (dark) — tone is only in the border |
| Cards readable at a glance | Delta and footnote are single-line, compact (`0.8rem` / `0.7rem`) |
| No multi-line explanations | Footnote truncates with ellipsis if overlong |
| No dense text blocks | Maximum three lines below the hero value (delta + footnote) |

### Tone → border color

| Tone | Color | Token |
|------|-------|-------|
| `neutral` | Blue (default) | `theme.primaryBlue` |
| `positive` | Teal | `theme.accentTeal` |
| `warning` | Amber | `theme.warningText` |
| `critical` | Red | `theme.error` |

Tone is set in `kpi_config.tone` in the widget definition. It does not require runtime data fetching — it is a configuration value set at definition time.

---

## 4. KPI Interaction Pattern

Phase 4 interaction scope:

- **Hover**: subtle background lift (increase box-shadow slightly) — already supported by the existing card structure, implemented as a CSS-in-JS hover state using `useState(hovered)`
- **No click behavior**: click-through to drill-down is deferred to a later phase
- **No tooltip**: tooltip on hover is deferred
- **No additional data fetching on interaction**: all card data is loaded as part of the dashboard artifact fetch; hover is purely visual

The hover state is included in Phase 4 to make the card feel interactive even without click behavior (cards on commercial dashboards like Datadog always have a hover response). It requires no additional data, no routing, and no async logic.

---

## 5. Proposed KPI Card Contract

### Props interface

```javascript
KpiCard({
  // Required
  label,           // string  — eyebrow metric name
  value,           // number | string — primary hero value

  // Optional
  delta,           // string  — comparison line e.g. "↓ 8% vs last week"
  tone,            // "neutral" | "positive" | "warning" | "critical"  (default: "neutral")
  footnote,        // string  — measurement context e.g. "24-hour rolling window"
  sparklineData,   // array   — RESERVED, accepted but not rendered in Phase 4
})
```

### Rendering behavior per prop

| Prop | Rendered when | Location in card |
|------|--------------|-----------------|
| `label` | Always | Top (eyebrow) |
| `value` | Always | Middle (hero, dominant) |
| `delta` | When provided (non-empty string) | Below value |
| `footnote` | When provided (non-empty string) | Below delta (or below value if no delta) |
| `sparklineData` | Never (Phase 4) | Reserved |

### Value formatting

- `typeof value === "number"` → `value.toLocaleString()` (adds comma separators)
- `typeof value === "string"` → rendered as-is (handles timestamps like `latest_event_timestamp`)
- `value === null | undefined` → renders `"—"` (em dash) rather than crashing

---

## 6. Required vs Optional Props

| Prop | Required | Contract rule |
|------|----------|--------------|
| `label` | ✅ Yes | Must be a non-empty string; drives the eyebrow |
| `value` | ✅ Yes | Number or string; null/undefined renders as `"—"` |
| `delta` | ❌ No | String only; not shown if absent or empty |
| `tone` | ❌ No | Defaults to `"neutral"` (blue); unknown values fall back to `"neutral"` |
| `footnote` | ❌ No | String only; single line; not shown if absent or empty |
| `sparklineData` | ❌ No | Array; reserved; silently ignored in Phase 4 |

---

## 7. Data Flow and Integration with Widgets

### How KPI cards receive data

All data flows through the `DashboardDefinition` → `DashboardRenderer` → `WidgetRenderer` → `widgetRegistry` → `KpiCard` pipeline. No KPI-specific data fetching occurs in the component.

```
definition.json widget entry
  ├── data_source.artifact  → which JSON artifact to load
  ├── data_source.field     → which field within that artifact (scalar value)
  └── kpi_config            → optional display config (tone, footnote, delta)

useDashboardArtifacts()
  └── loads all required artifacts

WidgetRenderer
  └── extracts: data = artifacts[artifact][field]

widgetRegistry.kpi_card.propsAdapter(widget, data)
  └── returns: { label, value, ...widget.kpi_config }

KpiCard({ label, value, tone, footnote, delta, sparklineData })
  └── renders
```

### How dashboard-specific logic is removed

Currently `DlqOperations.jsx` passes `label` and `value` as hard-coded props:
```jsx
<KpiCard label="Failures — last 24 h" value={summary.failures_last_24h} />
```

The standard path (Phase 2+) is for label and value to come from `definition.json` via `kpi_config` and `data_source`. `DlqOperations.jsx` migration to the renderer is a separate follow-on task; Phase 4 does not force it.

After Phase 4, any `kpi_card` widget driven through `DashboardRenderer` automatically receives `tone`, `footnote`, and `delta` from `kpi_config` — no dashboard-specific JSX needed.

### How formatting rules remain consistent

All formatting is owned by `KpiCard` itself:
- Number formatting: `.toLocaleString()` in the component (not in propsAdapter)
- String values: rendered as-is
- Null guard: component renders `"—"` — callers never need to guard for this

No dashboard definition can override the formatting rules — they are baked into the component.

### How delta comparisons are represented

Phase 4 treats `delta` as an opaque string supplied by the definition or (in future) from an artifact field. The component renders it verbatim below the primary value. No sign-based color coding in Phase 4 — `delta` is always `textSecondary` colored.

Example values: `"↓ 8% vs last week"`, `"+24 today"`, `"No change"`, `"vs. 7-day avg: 45"`

Future phases may introduce `deltaSign: "positive" | "negative" | "neutral"` for semantic coloring.

### How the KPI card aligns with the future metric catalog

Phase 5 (Metric Catalog) will introduce metric IDs that carry label, formatter, and threshold rules. The KPI card contract is designed to be metric-catalog-ready:

- `label` can be sourced from the catalog (the definition's `widget.title` field would be replaced by a metric lookup)
- `tone` can be computed from catalog threshold rules against the live value
- `delta` can be computed from catalog comparison rules

When Phase 5 ships, the only change needed is in the propsAdapter (or a new catalog-aware adapter layer) — `KpiCard` itself remains unchanged.

---

## 8. Example Usage Across Two Dashboards

### pipeline_health — docs_processed_24h

**definition.json:**
```json
{
  "id": "docs_processed_24h",
  "type": "kpi_card",
  "title": "Documents — last 24 h",
  "data_source": { "artifact": "summary.json", "field": "total_documents_last_24h" },
  "kpi_config": {
    "tone": "neutral",
    "footnote": "24-hour rolling window"
  }
}
```

**Rendered card:**
```
┌──────────────────────────────────┐
│ DOCUMENTS — LAST 24 H            │  ← label
│ 0                                │  ← value (integer from artifact)
│ 24-hour rolling window           │  ← footnote
└──────────────────────────────────┘
```

---

### dlq_operations — failures_24h

**definition.json:**
```json
{
  "id": "failures_24h",
  "type": "kpi_card",
  "title": "Failures — last 24 h",
  "data_source": { "artifact": "summary.json", "field": "failures_last_24h" },
  "kpi_config": {
    "tone": "neutral",
    "footnote": "24-hour rolling window"
  }
}
```

**Rendered card:**
```
┌──────────────────────────────────┐
│ FAILURES — LAST 24 H             │  ← label
│ 0                                │  ← value
│ 24-hour rolling window           │  ← footnote
└──────────────────────────────────┘
```

Both cards use the **same component** with different `data_source` bindings — no per-dashboard KPI logic anywhere.

---

## 9. Files to Create or Modify

### Files to Modify

| File | Change |
|------|--------|
| `portal/src/components/KpiCard.jsx` | Add `delta`, `tone`, `footnote`, `sparklineData` props; add hover state; add tone border logic; null-guard `value` |
| `portal/src/widgetRegistry.js` | Update `kpi_card` propsAdapter to spread `widget.kpi_config` |
| `portal/src/dashboards/pipeline_health/definition.json` | Add `kpi_config` to three `kpi_card` widget entries |
| `portal/src/dashboards/dlq_operations/definition.json` | Add `kpi_config` to two `kpi_card` widget entries |

### Files Unchanged

| File | Reason |
|------|--------|
| `portal/src/components/DashboardRenderer.jsx` | No change — section/layout logic unchanged |
| `portal/src/components/WidgetRenderer.jsx` | No change — resolution logic unchanged |
| `portal/src/dashboards/pipeline_health/PipelineHealth.jsx` | No change — already a DashboardRenderer wrapper |
| `portal/src/dashboards/dlq_operations/DlqOperations.jsx` | Not migrated; `{ label, value }` props still work |
| All publisher code, SQL, artifact schemas | No change |

---

## 10. Non-Goals

| Feature | Reason |
|---------|--------|
| Final visual polish pass | Style refinements deferred |
| Full metric catalog implementation | Phase 5 |
| Drag-and-drop layout changes | Phase 7 |
| Advanced animation system | Out of scope |
| Click / drill-down behavior | Routing concern — later phase |
| Sparkline rendering | Recharts subcomponent; reserved prop accepted |
| Dynamic delta from artifacts | Publisher changes required |
| Semantic delta coloring | Needs threshold/metric catalog rules |
| Icon support | Icon library decision pending |

---

## 11. Risks / Tradeoffs

| Risk | Mitigation |
|------|-----------|
| `value.toLocaleString()` on null/undefined | Add null guard: render `"—"` if value is nullish |
| `kpi_config` spread passes unexpected keys | React ignores unknown DOM props; no issue |
| `tone` typo silently uses neutral | Document fallback in JSDoc comment |
| DlqOperations.jsx bypasses registry — `kpi_config` not applied there | Expected; those cards use hard-coded props; migration is a later task |
| Hover state adds `useState` to a previously stateless component | Minimal; hover is purely cosmetic with no side effects |

---

## 12. Verification Checklist

### Reuse across two dashboards
1. Navigate to `/:client/:env/pipeline_health` — confirm three KPI cards render with footnotes
2. Navigate to `/:client/:env/dlq_operations` — confirm two KPI cards still render (from DlqOperations.jsx hard-coded props — no footnote expected on this path until DLQ migrates to renderer)

### Required props
3. Render `<KpiCard label="Test" value={42} />` — confirm value shows `42`, label shows `"TEST"`
4. Render `<KpiCard label="Test" value={null} />` — confirm card renders `"—"` rather than crashing

### Dashboard-specific logic removed
5. Confirm `KpiCard.jsx` contains no reference to `dlq_operations`, `pipeline_health`, or any dashboard-specific string
6. Confirm the `kpi_card` propsAdapter in `widgetRegistry.js` contains no dashboard-specific logic

### Delta comparison
7. Render `<KpiCard label="Test" value={42} delta="↓ 8% vs last week" />` — confirm delta line appears below the value

### Hover interaction
8. Hover over a KPI card — confirm shadow increases (no page reload, no data fetch)

### Tone
9. Render `<KpiCard label="Test" value={1} tone="critical" />` — confirm red top border
10. Render `<KpiCard label="Test" value={1} tone="positive" />` — confirm teal top border
11. Render `<KpiCard label="Test" value={1} tone="unknown_value" />` — confirm falls back to blue (neutral)

### Future metric catalog compatibility
12. Confirm the `KpiCard` component accepts `label`, `value`, `tone`, `delta`, `footnote`, `sparklineData` as distinct props — each can be independently sourced from a future metric catalog without changing the component signature

### Build and tests
13. Run `npm run build` — confirm no errors
14. Run `npm test` — confirm 75/75 tests pass
