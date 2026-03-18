# System Architecture Contract

This document defines the non-negotiable architectural rules for this platform.
It is the authoritative reference for all development sessions, code reviews, and
AI-assisted work. Rules here take precedence over convenience or feature speed.

**Every AI session must read this document before proposing or implementing changes.**

---

## Rules (R1–R10)

### R1 — Metrics live in SQL only

All reporting metrics are defined in Athena views (`sql/athena_views.sql`).

Metric logic must not be duplicated or re-implemented in:
- Publisher Python code (assembles results; does not define metrics)
- React components or hooks
- `propsAdapter` functions in `widgetRegistry.js`
- AI-generated outputs

If a metric is missing or wrong, fix the Athena view. Never paper over it
in a downstream layer.

---

### R2 — Parquet is the analytical storage format

All curated reporting data is stored as Parquet datasets in S3. ETL pipelines
produce these datasets. The publisher reads from Athena queries that reference them.

No analytical data may be sourced directly from operational systems (MySQL, OpenSearch)
for reporting purposes. Operational systems provide configuration and diagnostic context
only.

---

### R3 — Publisher generates deterministic artifacts

The publisher:
1. Queries Athena (or DuckDB locally)
2. Assembles artifact data
3. Validates output schemas
4. Writes JSON artifacts to `artifacts/{client}/{env}/current/{dashboard}/`
5. Archives an immutable snapshot to `artifacts/{client}/{env}/runs/{run_id}/{dashboard}/`

Publisher runs must be:
- **Deterministic** — same inputs produce the same outputs
- **Restart-safe** — re-running does not corrupt previous state
- **Auditable** — every run produces a versioned snapshot

`report_ts` is fixed at the start of each publisher run and must not drift mid-run.

---

### R4 — JSON artifacts are the delivery contract

JSON artifacts are the stable interface between the publisher and the portal.
The portal depends on artifact schemas; changes are breaking changes.

**Canonical artifacts per dashboard:**

| Artifact | Purpose |
|---|---|
| `manifest.json` | Run metadata, artifact list, freshness timestamps |
| `summary.json` | KPI scalars |
| `trend_30d.json` | Daily time-series data |
| `top_sites.json` | Ranked site aggregates |
| `exceptions.json` | Exception type counts |
| `run_history.json` | Cross-run index (at `current/` level) |

Dashboard-specific artifacts (e.g. `region_summary.json`, `lifetime_detail.json`) follow
the same contract rules.

**Adding or changing an artifact schema requires:**
1. Update `docs/json-contracts.md`
2. Update the publisher schema validator
3. Update or add portal tests
4. Update this document if the change is cross-cutting

---

### R5 — Portal is presentation-only

The React portal loads artifact JSON and renders it. It must not:
- Compute, derive, or transform reporting metrics
- Query Athena, MySQL, OpenSearch, or any operational system
- Replicate aggregation logic that belongs in Athena

Formatting for display (e.g. number locale formatting, date slicing) is permitted.
Metric computation is not.

---

### R6 — Dashboard definitions are presentation-layer only

`definition.json` files describe layout, widget bindings, column configuration,
and display formatting. They do not define, filter, or transform metrics.

A definition file may reference:
- Widget types (from `widgetRegistry.js`)
- Artifact fields (from published JSON artifacts)
- Display format hints (`"number"`, `"date_string"`, `"timestamp"`)
- Metric IDs (from `metricCatalog.js`) for label and tone resolution

A definition file must not:
- Contain computed values or metric logic
- Reference Athena, SQL, or publisher internals

---

### R7 — Routing state is URL state

Client (`client`) and environment (`env`) are URL path segments, not application state.

```
/:client/:env/<dashboardId>
/:client/:env/history
/:client/:env/history/:runId/:dashboardId
```

Components read `client` and `env` exclusively via `useParams()`.
These values must never be stored in:
- React context
- `localStorage` or `sessionStorage`
- Global store or module-level variables

Deep-linking and bookmarking must work for every dashboard URL.

`DEFAULT_CLIENT = "default"` and `DEFAULT_ENV = "local"` are defined only in `App.jsx`
for redirect purposes — nowhere else.

---

### R8 — `useArtifactPath()` is the only artifact URL builder

All current-run artifact fetches must use the `useArtifactPath` hook:

```js
// portal/src/hooks/useArtifactPath.js
const path = useArtifactPath("dashboard_id");
const url = path("summary.json");
// → /{client}/{env}/current/dashboard_id/summary.json
```

Components must never construct artifact paths by string concatenation.
`useArtifactPath` is the single, auditable path-construction point.

Historical run artifact links use `artifact.path` (publisher-supplied) directly:
```jsx
<a href={`/${artifact.path}`}>...</a>
```
The portal adds only a leading `/`. It never computes or modifies `artifact.path`.

---

### R9 — Multi-client via configuration, not code forks

The platform supports multiple clients and environments through:
- URL routing (`/:client/:env/...`)
- Publisher deployment parameters (`--client`, `--env`)
- Client-scoped artifact trees (`artifacts/{client}/{env}/...`)

Client differences must never be handled by:
- Conditional logic keyed on `client` or `env` in shared components
- Forking shared components into client-specific copies
- Hardcoding client names anywhere outside `App.jsx` defaults

New clients require only: publisher configuration + infrastructure deployment.
No portal code changes are required.

---

### R10 — Publisher is immutable from portal work

Publisher code (`src/publisher/`), SQL views (`sql/`), and artifact schemas are out
of scope for portal-layer tasks unless a task explicitly spans both layers.

Portal tasks must not:
- Modify publisher logic or SQL
- Change artifact schemas without a cross-layer plan
- Add portal-side workarounds for publisher data quality issues

If a portal task reveals a publisher or data issue, stop, document the finding,
and resolve it as a separate publisher-layer task.

---

## Pipeline Ownership Table

| Layer | Owner | Responsibility | Must not |
|---|---|---|---|
| ETL | Data Engineering | Ingest, normalize, write Parquet | Define metrics |
| Parquet | Data Engineering | Curated analytical storage | Serve portal directly |
| Athena views | Data Engineering | Define all reporting metrics | Compute in downstream layers |
| Publisher | Platform Engineering | Assemble artifacts, validate, write S3 | Re-define metrics; call portal |
| JSON artifacts | Both | Stable delivery contract | Change schema without docs + tests |
| Portal | Frontend Engineering | Load artifacts, render dashboards | Compute metrics; query ops systems |

---

## Boundary Violations

The following are explicit violations of this contract. If you observe one,
stop and flag it before continuing.

| Violation | Example | Rule violated |
|---|---|---|
| Metric logic in React | `const rate = failures / total` in a component | R1, R5 |
| Metric logic in propsAdapter | Filtering or aggregating rows in `widgetRegistry.js` | R1, R5 |
| Publisher querying portal state | Publisher reading from portal config or URL | R10 |
| Hardcoded client name in shared component | `if (client === "contexture")` in `DashboardRenderer` | R9 |
| Artifact path construction in portal | `/${client}/${env}/current/...` in a component | R8 |
| New metric defined outside Athena | `metricCatalog.js` entry with formula logic | R1 |
| Definition.json containing computed values | `"total": 1200 + 800` in a widget | R6 |
| Portal querying MySQL or OpenSearch directly | `fetch("/api/mysql/...")` in a hook | R5 |
| Schema change without docs + validator update | Adding field to `summary.json` silently | R4 |

---

## Extension Points

When extending the platform, use these defined extension points only.

### Add a new dashboard

1. Create `portal/src/dashboards/{id}/definition.json`
2. Create `portal/src/dashboards/{id}/{Id}.jsx` (thin wrapper around `DashboardRenderer`)
3. Add one entry to `portal/src/dashboards/index.js`
4. Run publisher with `--dashboard {id}` to produce artifacts
5. No changes to `App.jsx`, `NavBar`, routing, or `DashboardRenderer` required

### Add a new widget type

1. Create `portal/src/components/{TypeName}.jsx`
2. Add entry to `portal/src/widgetRegistry.js` (component + propsAdapter)
3. Reference the type string in a `definition.json`
4. Update `docs/guides/widget-library.md`
5. No changes to `DashboardRenderer` or `WidgetRenderer` required

### Add a new metric to the catalog

1. Define the metric in an Athena view (`sql/athena_views.sql`)
2. Add publisher query and artifact field
3. Update artifact schema + `docs/json-contracts.md`
4. Add entry to `portal/src/metricCatalog.js` (label, tone, formatter, footnote)
5. Reference `metric` in a `definition.json` widget

### Add a new client or environment

1. Configure publisher deployment parameters
2. Run publisher: `publisher run --client {id} --env {env} --dashboard {dashboard}`
3. Artifacts appear at `artifacts/{client}/{env}/current/`
4. Portal serves them at `/{client}/{env}/{dashboard}` automatically
5. No portal code changes required

---

## Document Maintenance

| When | What |
|---|---|
| New routing pattern added | Update R7, portal-routing.md |
| New artifact type introduced | Update R4, json-contracts.md, this doc's artifact table |
| New extension point established | Add to Extension Points section |
| A rule is violated and fixed | Document the incident in the relevant rule's notes |
| Platform layer ownership changes | Update Pipeline Ownership Table |
