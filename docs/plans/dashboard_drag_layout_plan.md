# Plan: Drag-and-Drop Dashboard Editing

## 1. Feature Overview

Introduce interactive drag-and-drop and resize for dashboard widgets.

Widgets in `"grid"` sections can be repositioned and resized by the user.  Layout changes
are held in React state for the current session.  Widget components remain completely
unaware of drag-and-drop logic — they render data as before, wrapped inside grid items.

This feature extends the Phase 6 layout contract.  The `widget.layout` coordinates defined
in every widget's `definition.json` serve as the initial grid positions.

---

## 2. Current Static Layout Limitation

After Phase 6, widget placement is config-driven but still static:

- `"flex_row"` sections render widgets in CSS flex wrap — no repositioning possible
- `"stack"` sections render widgets vertically — no repositioning possible
- Widget `layout.col/row/w/h` fields exist in definitions but are never read by the renderer

The heuristic is gone, but the layout remains fixed at page load.  There is no way for a
user to rearrange widgets without editing JSON.

---

## 3. Library Recommendation and Rationale

**Recommended library: `react-grid-layout`**

| Criterion | Assessment |
|-----------|------------|
| Drag support | Built-in |
| Resize support | Built-in |
| React 18 compatible | Yes |
| 12-column grid | Default |
| Layout change callback | `onLayoutChange(layout)` |
| Maturity | Widely used; active maintenance |
| Size | ~50 kB gzipped |
| Custom drag engine needed | No |

`react-grid-layout` is the de-facto standard for this use case.  It requires no custom
pointer-event logic and maps directly to the `{ i, x, y, w, h }` coordinate model already
established in Phase 6 (`i` = `widget.id`, `x` = `col`, `y` = `row`).

**Alternatives considered:**

- `dnd-kit` — lower-level toolkit; requires custom grid implementation; higher dev cost
- Custom drag logic — not appropriate; high complexity for no benefit at this scale
- `react-beautiful-dnd` — list-oriented only; no resize support

---

## 4. Proposed Interaction Model

### 4.1 New layout type: `"grid"`

A section with `"layout": { "type": "grid" }` renders its widgets using react-grid-layout
instead of CSS flex or block.

Existing types are unchanged:

| `layout.type` | Renderer | Interactive? |
|---------------|----------|-------------|
| `"flex_row"` | CSS flex wrap | No |
| `"stack"` | CSS block | No |
| `"grid"` | react-grid-layout | **Yes** |

Converting a section from `"flex_row"` to `"grid"` opts it into drag-and-drop.

### 4.2 Initial layout from definitions

When DashboardRenderer initialises for a `"grid"` section, it reads widget layout
coordinates from `definition.widgets`:

```js
// widget.layout → react-grid-layout item
{ i: widget.id, x: widget.layout.col, y: widget.layout.row, w: widget.layout.w, h: widget.layout.h }
```

### 4.3 User interaction

- **Drag:** user grabs the widget header area and moves it; other widgets reflow around it
- **Resize:** user drags the resize handle at the widget's bottom-right corner
- On either action, `onLayoutChange` fires with the updated layout array

### 4.4 Row height convention

`rowHeight` is set to **80px**.  With `h: 2`, KPI cards render at 160px + margins —
consistent with their current visual size.  Tables and charts at `h: 4` render at ~320px.

---

## 5. Layout State Update Flow

```
definition.json (widget.layout.col/row/w/h)
  └─ DashboardRenderer initialises sectionLayouts state (useState)
       └─ DashboardGrid receives layout array for its section
            └─ react-grid-layout renders items
                 └─ user drags or resizes
                      └─ onLayoutChange(newLayout) fires
                           └─ DashboardRenderer updates sectionLayouts state
                                └─ DashboardGrid re-renders with new positions
```

**Key properties:**

- Layout state lives in `DashboardRenderer` — single source of truth per render
- State is initialised from `definition.json` on every mount — no stale state
- Widget components (`KpiCard`, `TrendChart`, etc.) receive no layout props — fully decoupled
- Phase 8 will add localStorage persistence; the state shape is already compatible

**sectionLayouts state shape:**

```js
{
  [sectionId]: [{ i: string, x: number, y: number, w: number, h: number }]
}
```

---

## 6. Files to Create or Modify

### Files to Create

#### `portal/src/components/DashboardGrid.jsx`

Wraps `react-grid-layout`'s `GridLayout` (with `WidthProvider` for responsive width).
Accepts:

```
Props:
  widgets       — WidgetDefinition[] for this section
  artifacts     — { [filename]: parsedJson }
  layout        — ReactGridLayout.Layout[] (managed by DashboardRenderer)
  onLayoutChange — (newLayout: Layout[]) => void
```

Renders each widget inside a `<div key={widget.id}>` grid item.  Each child div contains
a `<WidgetRenderer>`.  No drag-specific props are passed to WidgetRenderer.

CSS imports required in this file:
```js
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
```

#### Files to Create

| File | Purpose |
|------|---------|
| `portal/src/components/DashboardGrid.jsx` | react-grid-layout wrapper; renders grid items around WidgetRenderer |

### Files to Modify

#### `portal/package.json`

Add dependency:
```json
"react-grid-layout": "^1.4.4"
```

No additional type packages needed (`react-grid-layout` ships its own types).

#### `portal/src/components/DashboardRenderer.jsx`

Two changes:

1. **Initialise layout state** from widget definitions for all `"grid"` sections:

```js
const [sectionLayouts, setSectionLayouts] = useState(() => {
  const initial = {};
  definition.layout.sections.forEach((section) => {
    if (section.layout?.type === "grid") {
      initial[section.id] = section.widget_ids
        .map((id) => definition.widgets.find((w) => w.id === id))
        .filter(Boolean)
        .map((w) => ({
          i: w.id,
          x: w.layout?.col ?? 0,
          y: w.layout?.row ?? 0,
          w: w.layout?.w  ?? 6,
          h: w.layout?.h  ?? 2,
        }));
    }
  });
  return initial;
});
```

2. **Add `"grid"` case to the section rendering switch:**

```jsx
{definition.layout.sections.map((section) => {
  const layoutType = section.layout?.type ?? "stack";

  if (layoutType === "grid") {
    const sectionWidgets = section.widget_ids
      .map((id) => definition.widgets.find((w) => w.id === id))
      .filter(Boolean);
    return (
      <div key={section.id} style={styles.section}>
        <DashboardGrid
          widgets={sectionWidgets}
          artifacts={artifacts}
          layout={sectionLayouts[section.id] ?? []}
          onLayoutChange={(newLayout) =>
            setSectionLayouts((prev) => ({ ...prev, [section.id]: newLayout }))
          }
        />
      </div>
    );
  }

  return (
    <div key={section.id} style={layoutType === "flex_row" ? styles.kpiRow : styles.section}>
      {/* existing widget rendering */}
    </div>
  );
})}
```

Import `DashboardGrid` and `useState` in DashboardRenderer.

#### `portal/src/dashboards/dlq_operations/definition.json`

Change `kpis` section from `"flex_row"` to `"grid"` to demonstrate interactive layout:

```json
{ "id": "kpis", "layout": { "type": "grid" } }
```

All other sections (`top_sites_7d`, `trends`, `top_sites_30d`, `exceptions`) remain `"stack"`.

#### `portal/src/dashboards/pipeline_health/definition.json`

Change `kpis` section from `"flex_row"` to `"grid"`:

```json
{ "id": "kpis", "layout": { "type": "grid" } }
```

`breakdowns` section remains `"stack"`.

### Unchanged Components

- `portal/src/components/KpiCard.jsx` — no changes
- `portal/src/components/WidgetRenderer.jsx` — no changes
- `portal/src/components/TrendChart.jsx` — no changes
- `portal/src/components/TopSitesTable.jsx` — no changes
- `portal/src/components/ExceptionsTable.jsx` — no changes
- `portal/src/widgetRegistry.js` — no changes
- `portal/src/metricCatalog.js` — no changes
- All publisher, SQL, and artifact files

---

## 7. Risks / Tradeoffs

### Risk: `WidthProvider` requires DOM measurement

`WidthProvider` measures the container's width on mount.  In SSR or test environments it
may return 0.  For this client-side-only portal this is not a problem.

### Risk: react-grid-layout CSS specificity

The library ships its own CSS.  Its styles must not conflict with Cashmere theme styles.
DashboardGrid imports the library CSS; all styles are scoped to the grid container class.

### Tradeoff: layout state resets on page reload

Phase 7 layout changes are session-only.  Refreshing the page resets to definition.json
positions.  This is intentional — Phase 8 adds persistence.  Users are not given a false
impression of persistence.

### Tradeoff: `"grid"` sections replace visual section headers

In `"grid"` mode, widgets within a section are positioned by grid coordinates, not grouped
visually within section containers.  Section label rendering for grid sections is omitted
in this feature.  Future work can add optional section header labels above each grid.

### Tradeoff: widget height is fixed in row units

react-grid-layout uses integer `h` values scaled by `rowHeight`.  Widget components must
be able to fill any height gracefully.  KpiCard already does.  TrendChart and TopSitesTable
may need CSS `height: 100%` on their root element — verify during implementation.

---

## 8. Verification Checklist

- [ ] **npm install succeeds** — `npm install` in `portal/` completes without errors after adding `react-grid-layout`
- [ ] **KPI cards draggable** — navigate to `/demo/dlq_operations`; KPI cards can be grabbed and moved
- [ ] **KPI cards resizable** — resize handle visible on hover; dragging it changes card size
- [ ] **Layout state updates** — after drag, card remains in new position without reverting
- [ ] **Reset on reload** — page refresh restores original positions from definition.json
- [ ] **Stack sections unchanged** — tables and chart sections on DLQ dashboard render as before, no drag handles
- [ ] **Pipeline Health KPI cards also draggable** — `/demo/pipeline_health` shows draggable 3-card KPI row
- [ ] **Widget components unmodified** — KpiCard, TrendChart, WidgetRenderer have no drag-specific imports or props
- [ ] **All 82 tests pass** — `npm test` in `portal/` exits cleanly
- [ ] **No console errors** — browser console is clean on both dashboards
