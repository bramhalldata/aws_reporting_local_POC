# Portal Routing Architecture

This document describes the URL routing model used by the React portal,
how client and environment context propagates through the component tree,
and how artifact URLs are resolved.

---

## Route Model

All portal routes are nested under a `/:client/:env` prefix:

```
/:client/:env/<dashboardId>                      → dashboard component
/:client/:env/history                            → RunHistory (list of all runs)
/:client/:env/history/:runId/:dashboardId        → RunDetail (single run detail)
```

Legacy routes (pre-v1.2.0) redirect to the default client/env:

```
/history/:runId/:dashboardId  →  /default/local/history/:runId/:dashboardId
/history                      →  /default/local/history
/*                            →  /default/local/dlq_operations
```

---

## Why URL-Prefix State

Client and environment are URL state, not application state. This means:

| Property | Value |
|----------|-------|
| Deep-linkable | Yes — each client/env/dashboard combination has a stable URL |
| Bookmarkable | Yes — URLs fully describe the view |
| State management required | None — no React context, no localStorage, no global store |
| S3 / CloudFront compatible | Yes — path-based routing works with standard static hosting |

The alternative approaches (query params `?client=x`, React context, localStorage) were
rejected because they either complicate CloudFront routing rules or break deep-linking.

---

## How useParams() Propagates client and env

React Router v6 makes `client` and `env` available to every component in the
`/:client/:env` subtree via `useParams()`:

```jsx
// In any component rendered under /:client/:env:
const { client, env } = useParams();
```

This includes `NavBar`, `RunHistory`, `RunDetail`, and all dashboard components.
No prop drilling or context provider is needed.

---

## useArtifactPath() — The Only Artifact URL Builder

Dashboard components must never construct artifact paths directly. All current-run
artifact fetches use the `useArtifactPath` hook:

```js
// portal/src/hooks/useArtifactPath.js
import { useParams } from "react-router-dom";

export function useArtifactPath(dashboardId) {
  const { client, env } = useParams();
  return (filename) => `/${client}/${env}/current/${dashboardId}/${filename}`;
}
```

Usage in a dashboard component:

```jsx
const path = useArtifactPath("dlq_operations");
const res = await fetch(path("summary.json"));
// → /default/local/current/dlq_operations/summary.json
```

Dashboard components (`DlqOperations`, `PipelineHealth`) require **zero changes** when
client or env changes — the hook resolves the correct path automatically.

---

## Historical Run Artifact Links

`RunDetail` renders artifact links using the publisher-supplied `artifact.path` directly:

```jsx
<a href={`/${artifact.path}`} target="_blank" rel="noreferrer">
  {artifact.name}
</a>
```

`artifact.path` is computed by the publisher as `{client_id}/{env_id}/runs/{run_id}/{dashboard_id}/{filename}`.
The portal adds only a leading `/` — it never constructs or modifies the path.

---

## Routing Guardrails

1. All dashboard and history routes live under `/:client/:env/...` — no sibling absolute routes.
2. `useParams()` is the sole source of `client` and `env` — they are never hardcoded in components.
3. `useArtifactPath()` is the only path builder for current-run artifact fetches.
4. `artifact.path` is never computed in the portal — it is publisher-owned.
5. `DEFAULT_CLIENT = "default"` and `DEFAULT_ENV = "local"` are defined only in `App.jsx`.
6. Selectors (future) must navigate by updating the URL — never by setting state that shadows it.

---

## Example URLs

| URL | Renders |
|-----|---------|
| `http://localhost:5173/default/local/dlq_operations` | DLQ Operations dashboard for default/local |
| `http://localhost:5173/default/local/pipeline_health` | Pipeline Health for default/local |
| `http://localhost:5173/contexture/prod/dlq_operations` | DLQ Operations for contexture/prod |
| `http://localhost:5173/default/local/history` | Run history list for default/local |
| `http://localhost:5173/contexture/prod/history` | Run history list for contexture/prod (isolated) |
| `http://localhost:5173/default/local/history/20260309T140000Z/dlq_operations` | Run detail |
| `http://localhost:5173/` | Redirects → `/default/local/dlq_operations` |
| `http://localhost:5173/history` | Redirects → `/default/local/history` |

---

## Adding a New Dashboard

Adding a new dashboard requires only one line in `portal/src/dashboards/index.js`:

```js
export const dashboards = {
  dlq_operations: DlqOperations,
  pipeline_health: PipelineHealth,
  my_new_dashboard: MyNewDashboard,   // ← add here
};
```

The route `/:client/:env/my_new_dashboard` is registered automatically. The NavBar tab
appears if `my_new_dashboard` is listed in `dashboardMeta`. No routing code changes needed.

---

## Vite SPA Fallback Pitfall

Vite dev server returns `index.html` with HTTP status 200 for missing static files
(as an SPA fallback). Components must check both `res.ok` **and** the `content-type`
header when fetching artifacts:

```js
const res = await fetch(path);
const contentType = res.headers.get("content-type") || "";
if (!res.ok || !contentType.includes("application/json")) {
  throw new Error("Artifact not found — run the publisher first.");
}
```

Checking only `res.ok` is insufficient and will cause a JSON parse error on missing files.

See [../json-contracts.md](../json-contracts.md) for artifact schema documentation.
See [artifact-layout.md](artifact-layout.md) for the artifact directory structure.
