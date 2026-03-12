# Plan: Filter Bar Contract (Feature 13)

## 1. Feature Overview

`definition.json` already has a `filters` array declaring which URL parameters a
dashboard consumes.  These declarations are **never read by any rendering code** — the
filter array is dead metadata.  `DashboardRenderer` and `useDashboardArtifacts` both
call `useParams()` directly to obtain `client` and `env`, bypassing the declaration.
`WidgetRenderer.propsAdapter` has no access to filter state at all.

This feature activates the filter contract:

1. Formalizes the filter definition shape (adding optional `default` field)
2. Introduces a `useFilterState(definition)` hook that reads declared filter values
   from their sources and returns a stable `{ [filterId]: value }` map
3. Threads `filterState` through `DashboardRenderer` → `WidgetRenderer` → `propsAdapter`
   so any widget can consume filter state without custom wiring

No filter bar UI is introduced in this feature.  The contract is the plumbing layer
that a UI would sit on top of.

---

## 2. Current Filter Inconsistency Risk

Without a shared contract:

- `DashboardRenderer` reads `client`/`env` from `useParams()` directly
- `useDashboardArtifacts` also reads `client`/`env` from `useParams()` directly
- `propsAdapter(widget, data)` has no access to any filter state
- A future widget needing `date_range` would invent its own wiring

Two widgets needing the same filter would independently call `useSearchParams()` in
different places — duplicating logic, risking inconsistency, and making the filter
system impossible to test centrally.

The declared `filters` array in definition.json implies a contract that the platform
does not yet honour.

---

## 3. Proposed Filter Contract

### 3.1 Filter definition shape (current + additive change)

```json
"filters": [
  { "id": "client",     "type": "url_param", "param": "client" },
  { "id": "env",        "type": "url_param", "param": "env" },
  { "id": "date_range", "type": "url_param", "param": "date_range", "default": "7d" }
]
```

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique filter identifier within the dashboard |
| `type` | Yes | Source type — only `"url_param"` in this feature |
| `param` | Yes (for url_param) | URL parameter name to read |
| `default` | No | Value to use when the parameter is absent |

**`url_param` reads from two sources in order:**
1. Path parameters via `useParams()` — covers `:client` and `:env` in the route
2. Query parameters via `useSearchParams()` — covers `?date_range=7d` etc.

---

### 3.2 `useFilterState(definition)` hook

New file: `portal/src/hooks/useFilterState.js`

```js
export function useFilterState(definition) {
  const pathParams   = useParams();
  const [searchParams] = useSearchParams();

  return useMemo(() => {
    const state = {};
    for (const filter of (definition.filters ?? [])) {
      if (filter.type === "url_param") {
        const value =
          pathParams[filter.param] ??
          searchParams.get(filter.param) ??
          filter.default ??
          null;
        state[filter.id] = value;
      }
    }
    return state;
  }, [definition.filters, pathParams, searchParams]);
}
```

Returns: `{ client: "acme", env: "prod", date_range: "7d" }` (example)

The hook is pure relative to its inputs and does not call `useParams` or
`useSearchParams` more than once per render.

---

## 4. Widget Subscription Model

`filterState` is passed as a third argument to `propsAdapter`:

```js
entry.propsAdapter(widget, data, filterState)
```

All existing propsAdapters accept `(widget, data)` with no third arg — JavaScript
ignores extra arguments, making this fully backward-compatible.  No existing propsAdapter
changes are required for the plumbing to work.

Widgets that want to consume filter state declare their intent in their propsAdapter:

```js
// Example: a future widget that varies its footnote based on date range
kpi_card: {
  propsAdapter: (widget, data, filterState) => {
    const window = filterState?.date_range ?? "7d";
    return { label, value, footnote: `Last ${window}` };
  }
}
```

This model requires zero per-widget wiring in `DashboardRenderer` or `WidgetRenderer`.

---

## 5. Default Value Handling

Defaults are declared per filter in `definition.json`.  `useFilterState` applies the
default when the URL parameter is absent.  This means:

- A dashboard with `{ "id": "date_range", "default": "7d" }` always returns `"7d"` for
  `filterState.date_range` even if the URL has no `?date_range` query param
- `client` and `env` have no declared default; if absent from the URL, `filterState.client`
  is `null` — same semantics as the current direct `useParams()` calls
- No filter state is stored in React state — filter values always derive from the URL,
  making them bookmarkable and shareable by design

---

## 6. Files to Create or Modify

### Files to Create

#### `portal/src/hooks/useFilterState.js`

New hook per §3.2.

#### `portal/src/hooks/useFilterState.test.js`

Unit tests covering:
- Filter reads from path params (client, env)
- Filter reads from query params (date_range)
- Default applied when param absent
- Null returned when param absent and no default
- Empty filters array returns empty object
- Unknown filter type returns null value (graceful)

---

### Files to Modify

#### `portal/src/components/DashboardRenderer.jsx`

Import and call `useFilterState`:

```js
import { useFilterState } from "../hooks/useFilterState.js";

// inside DashboardRenderer:
const filterState = useFilterState(definition);
```

Pass `filterState` to `WidgetRenderer`:

```jsx
<WidgetRenderer key={widgetId} widget={widget} artifacts={artifacts} filterState={filterState} />
```

Same in the `DashboardGrid` branch — `DashboardGrid` already passes `widgets` and
`artifacts` to `WidgetRenderer` internally; see §DashboardGrid below.

---

#### `portal/src/components/WidgetRenderer.jsx`

Accept and pass `filterState`:

```js
export default function WidgetRenderer({ widget, artifacts, filterState }) {
  // ...
  const props = entry.propsAdapter(widget, data, filterState);
  // ...
}
```

`filterState` defaults to `undefined` if not provided — existing callers (e.g. tests)
are unaffected.

---

#### `portal/src/components/DashboardGrid.jsx`

`DashboardGrid` renders `WidgetRenderer` internally.  It must accept and forward
`filterState`:

```js
export default function DashboardGrid({ widgets, artifacts, layout, onLayoutChange, filterState }) {
  // ...
  <WidgetRenderer widget={widget} artifacts={artifacts} filterState={filterState} />
}
```

And `DashboardRenderer` passes `filterState` to `DashboardGrid`:

```jsx
<DashboardGrid
  widgets={sectionWidgets}
  artifacts={artifacts}
  layout={...}
  onLayoutChange={...}
  filterState={filterState}
/>
```

---

#### `portal/src/widgetRegistry.js`

Update propsAdapter JSDoc to document the third argument:

```js
/**
 * @property {function(widget: Object, data: *, filterState: Object): Object} propsAdapter
 *   - filterState: { [filterId]: value } map from useFilterState. Optional; may be
 *     undefined for callers that have not yet threaded filterState through.
 */
```

No functional change to any existing propsAdapter implementation — they all ignore the
third argument.

---

#### `docs/guides/add-dashboard.md`

Update the `filters` section in the definition.json template to show the `default`
field and document the filter shape.

---

### Files NOT Modified

- `portal/src/hooks/useDashboardArtifacts.js` — continues to call `useParams()` directly
  for `client`/`env` (needed for artifact path construction, independent of filter state)
- `portal/src/hooks/useDashboardLayout.js`
- `portal/src/metricCatalog.js`
- `portal/src/dashboards/widgetPresets.js`, `resolveWidgets.js`
- `portal/src/dashboards/index.js`, `App.jsx`, `NavBar.jsx`
- All `definition.json` files (existing filter declarations are already valid)

---

## 7. Risks / Tradeoffs

| Risk | Assessment | Mitigation |
|------|-----------|------------|
| `client`/`env` are path params; future filters like `date_range` are query params — both handled in one hook | Intentional — `useFilterState` checks path params first, then query params | Document lookup order clearly in hook header |
| propsAdapter third-arg addition is backward-compatible but undiscoverable | Low — existing adapters still work; new adapters see filterState naturally | JSDoc on widgetRegistry entry shape; guide update |
| DashboardGrid threading adds a prop that most dashboards never use | Unavoidable for correctness; grid sections need filterState for their WidgetRenderers | Low-friction addition; no grid behavior changes |
| Filter state is URL-only (no React state, no persistence) | Intentional — URL is the right persistence layer for filter state; bookmarkable and shareable | No action needed; document this as a feature not a limitation |
| `useDashboardArtifacts` still reads `client`/`env` from `useParams()` directly | Acceptable dual-reading — the hook's concern is artifact path construction, not filter display | Add a comment noting the intentional separation |

---

## 8. Verification Checklist

- [ ] `npm test` — all existing tests pass; new `useFilterState.test.js` passes
- [ ] `filterState` for `dlq_operations` returns `{ client: "default", env: "local" }` at `localhost:5173/default/local/dlq_operations`
- [ ] A test definition with `{ "id": "date_range", "type": "url_param", "param": "date_range", "default": "7d" }` returns `{ date_range: "7d" }` when no query param is present
- [ ] Navigate to `?date_range=30d` — `filterState.date_range` becomes `"30d"`
- [ ] Both `DashboardGrid` (grid section) and stack section widgets receive `filterState` through `WidgetRenderer`
- [ ] Existing KPI card and table widgets render correctly — propsAdapter ignores filterState with no visible change
- [ ] No React warnings about missing prop types or extra props
