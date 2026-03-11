# Dashboard Renderer — Implementation Plan

**Feature:** Dashboard Renderer
**Roadmap Phase:** 2 of 10
**Branch:** feature/dashboard-plugin-architecture
**Date:** 2026-03-11

---

## 1. Feature Overview

The platform has an established `DashboardDefinition` schema (Phase 1). Phase 2 introduces a generic `DashboardRenderer` component that reads a dashboard definition and renders the dashboard from configuration — replacing page-specific JSX composition for at least one existing dashboard.

This feature validates the schema design and establishes the central rendering pipeline that all future dashboards will build on.

**Scope:** Generic renderer + one migrated dashboard (`pipeline_health`). DLQ Operations remains on manual JSX for now.

---

## 2. Current Rendering Limitations

Both current dashboards (`DlqOperations.jsx`, `PipelineHealth.jsx`) follow the same manual pattern:

- Artifact loading logic is duplicated in each page (manifest fetch → validate → Promise.all)
- Widget composition is hard-coded JSX (KpiCard, TrendChart, etc. manually assembled)
- Adding a new dashboard requires writing a new full page component with duplicated infrastructure

**DlqOperations.jsx** — 192 lines including ~50 lines of loading/error logic
**PipelineHealth.jsx** — 106 lines including ~40 lines of loading/error logic

The loading infrastructure is identical between both dashboards; only the artifact names and widget composition differ.

---

## 3. Renderer Responsibilities

The `DashboardRenderer` component:

1. **Receives** a `DashboardDefinition` object as a prop
2. **Extracts** unique artifact filenames needed from widget `data_source` declarations
3. **Loads** all required artifacts (including `manifest.json`) using the existing `useArtifactPath` hook pattern
4. **Handles** loading, error, and scope-empty states using the same patterns as the current dashboards
5. **Renders** a `HealthBanner` from manifest data (implicit — always first)
6. **Iterates** `layout.sections`, then `widget_ids` within each section
7. **Resolves** each widget's component and props via the widget registry
8. **Renders** an `UnknownWidget` fallback for unrecognized widget types

The renderer is **not** responsible for:
- Modifying artifact data (presentation only)
- Computing metrics (all values come from artifacts)
- Drag-and-drop behavior (Phase 7+)
- Layout grid positioning (Phase 6+)

---

## 4. Rendering Flow

### 4.1 Inputs and Outputs

```
Input:  definition (DashboardDefinition object)
Output: Rendered dashboard JSX

Side effects: fetch calls to artifact endpoints
```

### 4.2 Artifact Collection

The renderer derives required artifacts from widget definitions:

```javascript
// Collect unique artifact filenames from all widget data_sources
const artifactNames = [...new Set(
  definition.widgets.map(w => w.data_source.artifact)
)];
// manifest.json is always included in the load, even if not in the list
```

### 4.3 Artifact Loading (new hook)

A new `useDashboardArtifacts` hook abstracts the duplicated loading logic:

```javascript
// portal/src/hooks/useDashboardArtifacts.js
function useDashboardArtifacts(dashboardId, artifactNames) {
  // Uses useArtifactPath(dashboardId) for URL resolution
  // Fetches manifest.json first, validates status
  // Fetches remaining artifacts in parallel
  // Returns: { artifacts, loading, error, isScopeEmpty }
  // artifacts shape: { "manifest.json": {...}, "summary.json": {...}, ... }
}
```

This hook replaces the duplicated `loadArtifacts()` blocks in DlqOperations and PipelineHealth.

### 4.4 Widget Registry

```javascript
// portal/src/widgetRegistry.js
import KpiCard from './components/KpiCard.jsx';
import TrendChart from './components/TrendChart.jsx';
import TopSitesTable from './components/TopSitesTable.jsx';
import ExceptionsTable from './components/ExceptionsTable.jsx';
import HealthBanner from './components/HealthBanner.jsx';

const widgetRegistry = {
  kpi_card: {
    component: KpiCard,
    propsAdapter: (widget, data) => ({
      label: widget.title,
      value: data,              // data is the scalar field value
    }),
  },
  line_chart: {
    component: TrendChart,
    propsAdapter: (widget, data) => ({
      days: data,               // data is the days array (field extracted)
    }),
  },
  data_table: {
    component: TopSitesTable,
    propsAdapter: (widget, data) => ({
      title: widget.title,
      sites: data,              // data is the sites array (field extracted)
    }),
  },
  exceptions_table: {
    component: ExceptionsTable,
    propsAdapter: (widget, data) => ({
      exceptions: data,         // data is the exceptions/failure_types array
      title: widget.title,
    }),
  },
};
```

`HealthBanner` is handled outside the registry — the renderer renders it implicitly from `manifest.json`.

### 4.5 Data Extraction

Each widget declares its `data_source`:

```json
{ "artifact": "summary.json", "field": "total_failures_24h" }
{ "artifact": "trend_30d.json", "field": "days" }
{ "artifact": "exceptions.json", "field": "exceptions" }
```

The renderer extracts data using `field`:

```javascript
function extractData(widget, artifacts) {
  const artifactData = artifacts[widget.data_source.artifact];
  const { field } = widget.data_source;
  return field ? artifactData[field] : artifactData;
}
```

**Note on definition.json field values:** Phase 1 used `field: null` for array artifacts. Phase 2 refines these to use explicit field names (e.g., `"field": "days"`, `"field": "exceptions"`, `"field": "failure_types"`) so the renderer can extract data uniformly. Definition files in `portal/src/dashboards/` will reflect this.

### 4.6 Section Rendering

Sections group widgets. For Phase 2, a section of all-`kpi_card` widgets renders in a flex row (matching existing visual layout); all other sections render as a vertical stack.

```javascript
// Detect KPI row: section where every widget is kpi_card type
const isKpiRow = section.widget_ids.every(id =>
  definition.widgets.find(w => w.id === id)?.type === 'kpi_card'
);
// Apply row style if true, stack style if false
```

---

## 5. Error / Fallback Handling

### 5.1 Loading State
```jsx
if (loading) return <div style={loadingStyle}>Loading dashboard...</div>;
```

### 5.2 Scope Empty (no publisher run yet)
```jsx
if (isScopeEmpty) return <ScopeEmptyState client={client} env={env} />;
```
This reuses the existing `ScopeEmptyState.jsx` component.

### 5.3 Artifact Load Error
```jsx
if (error) return (
  <div style={errorBoxStyle}>
    <strong>Dashboard unavailable</strong>
    <p>{error}</p>
  </div>
);
```

### 5.4 Unknown Widget Type
If a widget's `type` has no entry in the registry, the renderer renders a visible placeholder instead of crashing:

```jsx
function UnknownWidget({ type }) {
  return (
    <div style={unknownWidgetStyle}>
      Unknown widget type: <code>{type}</code>
    </div>
  );
}
```

This allows schema evolution (new types added to definition.json) without breaking dashboards running on older renderer versions.

### 5.5 Missing Artifact Data
If `artifacts[widget.data_source.artifact]` is undefined, the renderer renders `UnknownWidget` with a `data_source_error` message rather than throwing.

---

## 6. Files to Create or Modify

### Files to Create

| File | Purpose |
|------|---------|
| `portal/src/components/DashboardRenderer.jsx` | Generic renderer component |
| `portal/src/hooks/useDashboardArtifacts.js` | Generic artifact loading hook |
| `portal/src/widgetRegistry.js` | Widget type → component + propsAdapter registry |
| `portal/src/dashboards/pipeline_health/definition.json` | Definition for pipeline_health (refined from Phase 1) |
| `portal/src/dashboards/dlq_operations/definition.json` | Definition for dlq_operations (reference only — not yet migrated) |

### Files to Modify

| File | Change |
|------|--------|
| `portal/src/dashboards/pipeline_health/PipelineHealth.jsx` | Replace JSX composition with `<DashboardRenderer definition={def} />` |

### Files Unchanged

| File | Reason |
|------|--------|
| `portal/src/dashboards/dlq_operations/DlqOperations.jsx` | Not migrated in Phase 2 |
| `portal/src/components/KpiCard.jsx` | No props change |
| `portal/src/components/TrendChart.jsx` | No props change |
| `portal/src/components/TopSitesTable.jsx` | No props change |
| `portal/src/components/ExceptionsTable.jsx` | No props change |
| `portal/src/components/HealthBanner.jsx` | No props change |
| `portal/src/App.jsx` | Routing unchanged |
| `portal/src/dashboards/index.js` | Registry unchanged |
| All publisher code | Unchanged |
| All SQL views | Unchanged |
| All artifact JSON schemas | Unchanged |

---

## 7. Migration Strategy — Pipeline Health

`pipeline_health` is the target migration dashboard because it is the simpler of the two (2 data artifacts, 4 widgets, 2 sections). This minimizes risk while validating the full rendering path.

### Step 1 — Create `portal/src/dashboards/pipeline_health/definition.json`

```json
{
  "id": "pipeline_health",
  "title": "Pipeline Health",
  "description": "Operational health indicators for the CCD failure pipeline.",
  "schema_version": "1.0.0",
  "layout": {
    "sections": [
      {
        "id": "kpis",
        "label": "Overview",
        "widget_ids": ["docs_processed_24h", "active_sites_24h", "latest_event"]
      },
      {
        "id": "breakdowns",
        "label": "Failure Breakdown",
        "widget_ids": ["failure_types_table"]
      }
    ]
  },
  "widgets": [
    {
      "id": "docs_processed_24h",
      "type": "kpi_card",
      "title": "Documents — last 24 h",
      "data_source": { "artifact": "summary.json", "field": "total_documents_last_24h" }
    },
    {
      "id": "active_sites_24h",
      "type": "kpi_card",
      "title": "Active Sites — last 24 h",
      "data_source": { "artifact": "summary.json", "field": "active_sites_last_24h" }
    },
    {
      "id": "latest_event",
      "type": "kpi_card",
      "title": "Latest Event",
      "data_source": { "artifact": "summary.json", "field": "latest_event_timestamp" }
    },
    {
      "id": "failure_types_table",
      "type": "exceptions_table",
      "title": "Failure Types — last 24 h",
      "data_source": { "artifact": "failure_types.json", "field": "failure_types" }
    }
  ],
  "filters": [
    { "id": "client", "type": "url_param", "param": "client" },
    { "id": "env", "type": "url_param", "param": "env" }
  ],
  "defaults": {
    "section": "kpis"
  }
}
```

### Step 2 — Replace `PipelineHealth.jsx` composition

The current `PipelineHealth.jsx` (106 lines) is replaced with a minimal wrapper:

```jsx
import definition from './definition.json';
import DashboardRenderer from '../../components/DashboardRenderer.jsx';

export default function PipelineHealth() {
  return <DashboardRenderer definition={definition} />;
}
```

The page component remains in the registry (`index.js`) as before — no routing changes needed.

### Step 3 — Validate

Load `/:client/:env/pipeline_health` in the portal and confirm:
- HealthBanner renders with correct status and timestamps
- Three KPI cards render in a flex row with correct values
- Failure types table renders with correct data
- Error/empty states work identically to the old implementation

---

## 8. Verification Checklist

### Functional
1. Navigate to `/:client/:env/pipeline_health` — confirm dashboard renders from config (not JSX)
2. Confirm `HealthBanner` appears with correct status, generatedAt, reportTs, schemaVersion
3. Confirm three KPI cards render in a flex row with values from `summary.json`
4. Confirm `ExceptionsTable` renders failure types from `failure_types.json`
5. Confirm `DlqOperations` dashboard still renders correctly (unchanged path)

### Renderer Generality
6. Add a widget with `"type": "unknown_xyz"` to a definition → confirm `UnknownWidget` placeholder renders instead of crash
7. Confirm `DashboardRenderer` imports no dashboard-specific code (no `DlqOperations`-specific logic)
8. Confirm `widgetRegistry.js` contains all registered types without reference to specific dashboard IDs

### Error / Empty State
9. Stop the publisher (remove `manifest.json`) → confirm `ScopeEmptyState` renders
10. Set `manifest.status: "FAILURE"` → confirm error state renders with message

### Regression
11. Run existing portal tests (if any) — confirm no breakage
12. Build the portal (`npm run build`) — confirm no TypeScript/import errors
