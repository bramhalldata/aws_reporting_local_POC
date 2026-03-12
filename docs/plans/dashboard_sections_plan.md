# Plan: Dashboard Sections (Feature 12)

## 1. Feature Overview

The dashboard schema already has a `sections` array in `definition.json`.  Each section
has `id`, `label`, `widget_ids`, and `layout`.  `DashboardRenderer` already iterates
over sections and renders the correct layout type (grid or stack).  However, the section
`label` field is **never rendered visually**: no section heading, no divider, no
description text appears in the browser.

This feature surfaces section structure by rendering `label` as a visible h2 heading and
adding optional `description` support.  The change is additive — existing sections that
already have `label` get headings automatically; new dashboards can include `description`
for additional context.

---

## 2. Current Flat Layout Limitation

Both existing dashboards (`dlq_operations`, `pipeline_health`) render all widgets in a
continuous vertical flow.  The user sees KPI cards, tables, and charts stacked without
any visual grouping or labels.  The section `label` values — "Overview",
"Top Sites — 7 days", "Trends", "Exceptions", "Failure Breakdown" — already exist in
the JSON but are unused at render time.

The `label` field is currently dead metadata.  This feature activates it.

---

## 3. Proposed Section Model

### Schema additions — additive, backward-compatible

Add an optional `description` field to section objects:

```json
{
  "id": "kpis",
  "label": "Overview",
  "description": "High-level failure counts for the last 24 hours and 7 days.",
  "widget_ids": ["failures_24h", "failures_7d"],
  "layout": { "type": "grid" }
}
```

| Field | Status | Rendered as |
|-------|--------|-------------|
| `label` | Existing; now rendered | h2 section heading |
| `description` | New optional field | subtitle paragraph below heading |
| `widget_ids` | Existing; unchanged | grouped widget references |
| `layout.type` | Existing; unchanged | controls grid vs. stack rendering |

Omitting `label` suppresses the heading entirely (backward-compatible for any future
headless section).  Omitting `description` suppresses the subtitle; no empty element
is rendered.

### Rendered output

```
[section heading block — emitted when label is present]
  <h2>Overview</h2>
  <p>High-level failure counts...</p>   ← only when description is set

[section widgets]
  <DashboardGrid ...>  or  <div style={stack}>...</div>
```

---

## 4. Integration with Dashboard Schema and Layout

The section heading block is inserted at the top of each section in the render loop,
before either the `DashboardGrid` (grid layout) or the widget stack `<div>` (stack
layout).  No changes are needed to `DashboardGrid`, `WidgetRenderer`, or any data
loading hook.

Section layout semantics are unchanged:

| `layout.type` | Widgets rendered as | Heading position |
|---------------|---------------------|-----------------|
| `"grid"` | Draggable grid (react-grid-layout) | Above the grid |
| `"stack"` | Vertical full-width stack | Above the stack |

The heading is outside the grid container so it is never draggable or resizable.

---

## 5. Files to Create or Modify

### `portal/src/components/DashboardRenderer.jsx` (modify)

Add three new style entries and add the section heading block inside the section
render loop.

**New styles:**

```js
sectionHeader: {
  marginBottom: "1rem",
},
sectionTitle: {
  fontSize: "1.1rem",
  fontWeight: 600,
  color: theme.textSecondary,
  margin: 0,
},
sectionDescription: {
  fontSize: "0.875rem",
  color: theme.textMuted,
  marginTop: "0.25rem",
  marginBottom: 0,
},
```

**Section render loop — heading block (grid branch):**

```jsx
if (layoutType === "grid") {
  const sectionWidgets = section.widget_ids
    .map((id) => resolvedWidgets.find((w) => w.id === id))
    .filter(Boolean);
  return (
    <div key={section.id}>
      {section.label && (
        <div style={styles.sectionHeader}>
          <h2 style={styles.sectionTitle}>{section.label}</h2>
          {section.description && (
            <p style={styles.sectionDescription}>{section.description}</p>
          )}
        </div>
      )}
      <DashboardGrid ... />
    </div>
  );
}
```

**Section render loop — heading block (stack branch):**

```jsx
return (
  <div key={section.id} style={layoutType === "flex_row" ? styles.kpiRow : styles.section}>
    {section.label && (
      <div style={styles.sectionHeader}>
        <h2 style={styles.sectionTitle}>{section.label}</h2>
        {section.description && (
          <p style={styles.sectionDescription}>{section.description}</p>
        )}
      </div>
    )}
    {section.widget_ids.map(...)}
  </div>
);
```

Note: the grid branch currently returns `<DashboardGrid>` directly with no wrapper
`<div>`.  Adding the heading requires wrapping in a `<div>` with `key={section.id}`.
The `key` moves from `DashboardGrid` to the outer `<div>`.

---

### `portal/src/dashboards/dlq_operations/definition.json` (modify)

Add `description` to two sections:

```json
{ "id": "kpis",
  "label": "Overview",
  "description": "Failure counts across the last 24 hours and 7 days.",
  ... }

{ "id": "top_sites_7d",
  "label": "Top Sites — 7 days",
  "description": "Sites ranked by failure volume over the most recent 7-day window.",
  ... }
```

---

### `portal/src/dashboards/pipeline_health/definition.json` (modify)

Add `description` to one section:

```json
{ "id": "kpis",
  "label": "Overview",
  "description": "Pipeline throughput and recency indicators for the last 24 hours.",
  ... }
```

---

### `docs/guides/add-dashboard.md` (modify)

Update the section object in the definition.json template to show `description` as an
optional field with a comment:

```json
{
  "id": "kpis",
  "label": "Overview",
  "description": "Optional one-sentence section subtitle.",
  "widget_ids": ["metric_a", "metric_b"],
  "layout": { "type": "grid" }
}
```

---

### Files NOT Modified

- `portal/src/components/DashboardGrid.jsx`
- `portal/src/components/WidgetRenderer.jsx`
- `portal/src/dashboards/widgetPresets.js`
- `portal/src/dashboards/resolveWidgets.js`
- `portal/src/metricCatalog.js`
- `portal/src/widgetRegistry.js`
- `portal/src/dashboards/index.js`, `App.jsx`, `NavBar.jsx`
- All hooks (`useDashboardArtifacts`, `useDashboardLayout`)

---

## 6. Risks / Tradeoffs

| Risk | Assessment | Mitigation |
|------|-----------|------------|
| "Overview" h2 directly below dashboard h1 feels repetitive | Low — the h2 is lighter weight (`1.1rem`, muted color) and serves as a named section anchor | Developer can omit `label` from a section to suppress its heading |
| Section titles add vertical whitespace | Minimal — `1.1rem` heading + optional one-line description; smaller than existing widget cards | Acceptable trade-off for readability |
| Grid branch currently has no wrapper `<div>` — adding one changes DOM structure | Low — react-grid-layout renders inside its own container; the outer `<div>` only affects the section heading placement | The `key` prop moves to the outer `<div>`; React reconciliation is unaffected |
| `description` is unvalidated free text | Low risk at current scale | One-sentence convention documented in guide; no enforcement needed |

---

## 7. Verification Checklist

- [ ] `npm test` in `portal/` — all 90 existing tests pass; no test changes required
- [ ] DLQ Operations: "Overview" h2 renders above KPI cards; description subtitle visible
- [ ] DLQ Operations: "Top Sites — 7 days" h2 + description visible above the table
- [ ] DLQ Operations: "Trends", "Top Sites — 30 days", "Exceptions" show h2 with no description (heading-only, no empty paragraph)
- [ ] Pipeline Health: "Overview" h2 + description visible above KPI cards
- [ ] Pipeline Health: "Failure Breakdown" h2 visible, no description element rendered
- [ ] "Reset layout" button still appears and functions (grid sections regression check)
- [ ] Drag-and-drop still works for KPI cards in grid sections (no regression from wrapper `<div>`)
