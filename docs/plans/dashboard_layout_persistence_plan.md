# Plan: Dashboard Layout Persistence (Feature 8)

## Context

Phase 7 (drag-and-drop) introduced interactive grid layout for KPI sections.  Layout
changes are held in `sectionLayouts` React state inside `DashboardRenderer`, which is
lost on every page reload.  This makes drag-and-drop feel like a toy rather than a
platform feature.

The current state shape — `{ [sectionId]: Layout[] }` — is already serialisation-ready.
This feature adds a persistence layer beneath it using `localStorage` as the V1 store,
designed so the read/write mechanism can be swapped for a server API later.

---

## Approach

**Mechanism:** `localStorage`
**Key format:** `portal:layout:{dashboardId}` (one entry per dashboard)
**Value:** `JSON.stringify({ [sectionId]: [{ i, x, y, w, h }] })`

Extract all layout state logic from `DashboardRenderer` into a new hook
`useDashboardLayout(definition)`.  The hook owns:

- Loading saved layout from localStorage (or falling back to definition defaults)
- Merging: new widgets get default coordinates; removed widgets are dropped; saved positions win for existing widgets
- Persisting on every `onLayoutChange` call
- Resetting to defaults on demand

`DashboardRenderer` replaces its raw `useState` / `setSectionLayouts` with the hook, and
gains a "Reset layout" button in the header (only rendered when the dashboard has at
least one `"grid"` section).

---

## Layout Load / Merge Logic

On mount the hook:

1. Reads `localStorage.getItem("portal:layout:{dashboardId}")`
2. Builds default layout from `definition.widgets[*].layout.col/row/w/h`
3. Merges: for each grid section, iterate default items and substitute the saved position
   if the widget ID exists in the saved data

```js
merged[sectionId] = defaultItems.map(defaultItem => {
  const saved = savedItems.find(s => s.i === defaultItem.i);
  return saved ?? defaultItem;
});
```

This handles three cases cleanly:

| Scenario | Behaviour |
|----------|-----------|
| First load (no saved data) | Default from definition coordinates |
| After drag/resize | Saved layout written to localStorage |
| Page reload with saved data | Saved layout restored (merged with any definition changes) |
| Widget added to definition | New widget gets default position; all others keep saved positions |
| Widget removed from definition | Removed from saved layout on next save |
| User clicks Reset | localStorage entry deleted; state resets to definition defaults |

---

## Files to Create

### `portal/src/hooks/useDashboardLayout.js`

Custom hook. Exports:

```js
const { sectionLayouts, updateSectionLayout, resetLayouts } = useDashboardLayout(definition);
```

Internal functions:

- `storageKey(dashboardId)` → `"portal:layout:{dashboardId}"`
- `buildDefaultLayouts(definition)` — reads `widget.layout.col/row/w/h` for all grid sections
- `loadLayouts(definition)` — reads localStorage, falls back to defaults, applies merge
- `saveLayouts(dashboardId, sectionLayouts)` — writes to localStorage

---

## Files to Modify

### `portal/src/components/DashboardRenderer.jsx`

1. Import the new hook:
   ```js
   import { useDashboardLayout } from "../hooks/useDashboardLayout.js";
   ```

2. Replace the `useState` + `setSectionLayouts` block with:
   ```js
   const { sectionLayouts, updateSectionLayout, resetLayouts } = useDashboardLayout(definition);
   ```

3. Replace the `onLayoutChange` inline handler with `updateSectionLayout`:
   ```jsx
   onLayoutChange={(newLayout) => updateSectionLayout(section.id, newLayout)}
   ```

4. Derive `hasGridSections` before the render:
   ```js
   const hasGridSections = definition.layout.sections.some(
     (s) => s.layout?.type === "grid"
   );
   ```

5. Add Reset button to the header (only when `hasGridSections` is true):
   ```jsx
   <header style={styles.header}>
     <h1 style={styles.title}>{definition.title}</h1>
     {hasGridSections && (
       <button onClick={resetLayouts} style={styles.resetButton}>Reset layout</button>
     )}
   </header>
   ```

6. Add `styles.resetButton` — minimal style: small muted text button, right-aligned:
   ```js
   resetButton: {
     marginTop: "0.5rem",
     float: "right",
     background: "none",
     border: "none",
     cursor: "pointer",
     fontSize: "0.8rem",
     color: theme.textMuted,
     padding: "0.25rem 0",
   },
   ```

---

## Files NOT Modified

- `portal/src/components/DashboardGrid.jsx` — no changes; receives same props as today
- `portal/src/components/KpiCard.jsx` — no changes
- All `definition.json` files — no changes
- Publisher, SQL, artifact files — no changes

---

## Future Evolution Path

To migrate from localStorage to a server API in Phase N:

1. Replace `localStorage.getItem/setItem/removeItem` in `useDashboardLayout.js` with API calls
2. The hook's return signature (`sectionLayouts`, `updateSectionLayout`, `resetLayouts`) stays identical
3. `DashboardRenderer` and `DashboardGrid` need no changes

---

## Verification

1. **First load** — navigate to `/demo/dlq_operations`; KPI cards render at default positions from definition.json
2. **Drag a card** — move one KPI card to a new position
3. **Reload** — refresh the page; card is in the moved position (not the default)
4. **Reset** — click "Reset layout"; cards return to default positions; localStorage entry is cleared
5. **New widget scenario** — manually add a third dummy widget to `kpis` section in definition.json; it appears at its definition coordinates while other cards keep saved positions
6. **Stack sections unaffected** — tables and chart sections render exactly as before
7. **All tests pass** — `npm test` in `portal/`
