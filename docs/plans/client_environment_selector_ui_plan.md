# Client / Environment Selector UI — Implementation Plan

**Feature:** Client / Environment Selector UI
**Output artifact:** `docs/plans/client_environment_selector_ui_plan.md`
**Date:** 2026-03-10
**Status:** Draft — pending review

---

## Context

The platform supports multi-client and multi-environment routing via `/:client/:env/...`.
All components derive `client` and `env` from `useParams()`. The identity bar in
`AppShell.jsx` currently displays `{client} / {env}` as plain text.

Users who want to switch scope must manually edit the URL. For demos and development,
this creates friction. The selector UI replaces the plain text with interactive controls
that update the URL — keeping the URL as the sole source of truth.

---

## 1. Feature Summary

The Client/Environment Selector is a small UI element in the identity bar that allows
users to switch between available client/env scopes from any portal page.

It reads the current scope from `useParams()`, shows the available options from a static
config, and calls `useNavigate()` when the user picks a new value. The URL updates;
`useParams()` propagates the new values to all components automatically.

The selector is a **convenience layer over route state**. It adds no new data, no new
architecture, and no hidden state. Removing it would not break anything — users could
still navigate by editing URLs directly.

---

## 2. UX Goals

| Goal | Behavior |
|------|---------|
| Fast switching | One dropdown interaction → URL updates immediately |
| Visible scope | Identity bar always shows current client and env |
| No ambiguity | The displayed value always matches the URL |
| Shareable URLs | All URLs remain deep-linkable after switching |
| No hidden state | Closing and reopening the browser shows the same scope as the URL |
| Demo-friendly | Works without a backend, server, or authentication |

---

## 3. Core Design Principle — URL Remains the Source of Truth

The selector must **navigate, not own state**.

```
User selects "contexture" →
  useNavigate() called with /contexture/local/dlq_operations →
  URL changes →
  useParams() returns { client: "contexture", env: "local" } →
  All components re-render with new scope
```

This is the only safe model for this architecture. Alternatives fail in specific ways:

| Anti-pattern | Failure mode |
|-------------|-------------|
| React context owning client/env | URL no longer reflects scope — browser back/forward breaks; deep links broken |
| localStorage owning scope | Private browsing, shared URLs, and bookmarks silently use wrong scope |
| Query params `?client=x` | Conflicts with existing compare page query params; CloudFront behavior harder to configure |
| Component state owning scope | Scope lost on page refresh; not shareable |

The selector's selected value is always derived from `useParams()`, never from local
state. It is a controlled component whose "value" is the URL.

---

## 4. Placement in the UI

**Recommendation: inside the existing identity bar in `AppShell.jsx`.**

Rationale:
- The identity bar already shows `{client} / {env}` — it is the natural home for scope controls
- The NavBar is already occupied with dashboard tabs and History; adding selectors there risks crowding
- The identity bar is rendered by `AppShell`, which owns the client/env context — the selector naturally belongs at this level
- The identity bar is visually separate from content tabs — it signals "you are here in the platform" rather than "navigate to a tab"

**Before (plain text):**
```
default / local                                    [NavBar below]
```

**After (interactive):**
```
[default ▾] / [local ▾]     Client / Environment   [NavBar below]
```

The two dropdowns replace the plain text. They sit on the left side of the identity bar
with a small label "Client / Environment" to the right in muted text for context.

---

## 5. Route Preservation Rules

When the user changes client or env, the selector applies these rules to determine the
target URL:

### Case A — Dashboard page (`/:client/:env/<dashboardId>`)

**Preserve the dashboard ID.**

```
/default/local/dlq_operations → /contexture/prod/dlq_operations
```

The new client/env may not have published artifacts for that dashboard yet. If so, the
dashboard component already shows an appropriate error state (missing artifact guard).
No special handling needed in the selector.

### Case B — History list (`/:client/:env/history`)

**Preserve the `/history` suffix.**

```
/default/local/history → /contexture/prod/history
```

Each client/env has its own `run_history.json`. The new scope's history loads cleanly.

### Case C — Run Detail (`/:client/:env/history/:runId/:dashboardId`)

**Reset to the new scope's history list.**

```
/default/local/history/20260309T120000Z/dlq_operations → /contexture/prod/history
```

`runId` is a timestamp ID specific to a run within the old scope. That run does not
exist in the new scope's `run_history.json`. Preserving the runId would produce a
"Run not found" error. Resetting to history is the correct safe default.

### Case D — Compare page (`/:client/:env/history/compare?dashboard=...&base=...&target=...`)

**Reset to the new scope's history list.**

```
/default/local/history/compare?... → /contexture/prod/history
```

`base` and `target` run IDs are specific to the old scope. They do not exist in the
new scope. Preserving them would produce "Run not found" errors on the compare page.

### Summary table

| Current page | Switch behavior |
|--------------|----------------|
| `/:c/:e/<dashboardId>` | → `/{newClient}/{newEnv}/<dashboardId>` |
| `/:c/:e/history` | → `/{newClient}/{newEnv}/history` |
| `/:c/:e/history/:runId/:dashboardId` | → `/{newClient}/{newEnv}/history` |
| `/:c/:e/history/compare?...` | → `/{newClient}/{newEnv}/history` |

### Route detection implementation

The selector uses `useLocation()` and string matching against the current path:

```js
const { client, env } = useParams();
const location = useLocation();
const suffix = location.pathname.slice(`/${client}/${env}`.length); // e.g. "/dlq_operations"

function targetUrl(newClient, newEnv) {
  // Preserve dashboard pages (any known dashboardId)
  const isDashboard = dashboardMeta.some(d => suffix === `/${d.id}`);
  if (isDashboard) return `/${newClient}/${newEnv}${suffix}`;

  // Preserve history list
  if (suffix === "/history") return `/${newClient}/${newEnv}/history`;

  // Reset for run detail, compare, and any unknown sub-routes
  return `/${newClient}/${newEnv}/history`;
}
```

---

## 6. Available Client/Env Source

### Options considered

| Option | Description | Verdict |
|--------|-------------|---------|
| **Hardcoded config file** in portal source | `portal/src/config/scopes.js` lists available scopes as a JS array | **Recommended for Phase 1** |
| Static metadata JSON artifact | Publisher writes `/scopes.json` to artifacts; portal fetches it | Too complex for Phase 1 — requires publisher changes and async load |
| Infer from artifact directories | List `artifacts/` subdirectories at runtime | Impossible in browser — no directory listing API in static hosting |

### Recommendation: hardcoded config file

```js
// portal/src/config/scopes.js
export const SCOPES = [
  { client: "default",    envs: ["local"] },
  { client: "contexture", envs: ["local", "prod"] },
];
```

**Rationale:**
- Zero new infrastructure: no publisher changes, no new artifact, no async fetch
- Easy to update: edit one file, rebuild portal
- Static hosting compatible: works on Vite dev server and CloudFront
- Explicit: the list of valid scopes is visible in source control
- Demo-friendly: a developer adds a new scope in one line

**Phase 2 path:** If scopes need to be dynamic (managed by ops without a portal rebuild),
publish a `/scopes.json` artifact and load it asynchronously. The selector component
interface would not change — only the data source changes.

**Note:** Users can still manually navigate to any `/{client}/{env}/...` URL not in the
config. The selector only controls what appears in the dropdown — it does not restrict access.

---

## 7. UI State Model

The selector requires **only one piece of local UI state**: whether each dropdown is
open or closed. Since native `<select>` elements handle this natively, **zero local state
is required** in the React component.

The selector is a fully controlled component:

```jsx
<select
  value={client}                          // derived from useParams()
  onChange={e => navigate(targetUrl(e.target.value, env))}
>
  {clients.map(c => <option key={c} value={c}>{c}</option>)}
</select>
```

There is no `useState` for the selected value. The current value is always `useParams().client`
and `useParams().env`. Selecting a value immediately triggers navigation; the URL updates;
`useParams()` returns the new values; the select reflects them.

---

## 8. Routing / Navigation Behavior

```js
const navigate = useNavigate();
const { client, env } = useParams();

function handleClientChange(newClient) {
  // When client changes, find first env available for new client;
  // if current env is available in new client, preserve it.
  const newClientEntry = SCOPES.find(s => s.client === newClient);
  const newEnv = newClientEntry?.envs.includes(env) ? env : newClientEntry?.envs[0] ?? env;
  navigate(targetUrl(newClient, newEnv));
}

function handleEnvChange(newEnv) {
  navigate(targetUrl(client, newEnv));
}
```

**Client switching:** If the new client supports the current env, preserve it. If not,
default to the first env listed for that client. Example: switching from `default` (envs:
`["local"]`) to `contexture` (envs: `["local", "prod"]`) while on `local` → stays `local`.

**Env switching:** Always preserves the current client; only the env segment changes.

**Navigation is replace-style or push-style:** Use `navigate(url)` (push, default) so
browser back/forward navigate through scope changes. This allows users to undo a scope
switch with the browser back button — matching expected navigation behavior.

---

## 9. Error / Missing Scope Handling

If a user switches to a scope that has no published artifacts, the existing component
error guards already handle this:

- Dashboard components show "artifact not found" error state when `manifest.json` or
  `summary.json` is missing (Vite SPA fallback + content-type check)
- `RunHistory.jsx` shows an error when `run_history.json` is missing
- `RunCompare.jsx` shows an error when `run_history.json` is missing

**The selector does not need additional error handling** — the destination page handles
the empty-scope case gracefully without a redirect or special state.

**Out-of-range scope:** If the URL contains a `client` or `env` not in `SCOPES`, the
selector's `<select>` will show the current value but it won't appear as a valid
`<option>` — the select may display blank or show the raw value. This is acceptable for
Phase 1: manual URLs still work; the selector just won't have that scope in its list.

**Recommendation:** Keep the behavior simple — no redirect, no fallback. Trust the
existing component error states. If a scope has no artifacts, the user sees an error
and can switch scope using the selector.

---

## 10. Files to Create / Modify

### Create

| File | Purpose |
|------|---------|
| `portal/src/config/scopes.js` | Static list of available client/env scopes |
| `portal/src/components/ClientEnvSelector.jsx` | The selector UI component |

### Modify

| File | Change |
|------|--------|
| `portal/src/AppShell.jsx` | Replace plain `{client} / {env}` text with `<ClientEnvSelector />` |

### Unchanged

- `portal/src/components/NavBar.jsx` — selector lives in identity bar, not NavBar
- All dashboard components — they receive client/env from URL, not from selector
- All pages (RunHistory, RunDetail, RunCompare) — unchanged
- All publisher files — no new artifact needed
- `portal/src/App.jsx` — routing unchanged

---

## 11. Verification Plan

### Functional (manual)

| Scenario | Expected result |
|----------|----------------|
| On `/default/local/dlq_operations`, change client to `contexture` | Navigates to `/contexture/local/dlq_operations` |
| On `/default/local/dlq_operations`, change env to `prod` | Navigates to `/default/prod/dlq_operations` |
| On `/default/local/history`, change client | Navigates to `/{new}/local/history` |
| On `/default/local/history/20260309T...Z/dlq_operations`, change client | Navigates to `/{new}/local/history` (resets) |
| On compare page, change client | Navigates to `/{new}/local/history` (resets) |
| Change client when new client does not support current env | Navigates using first env in new client's list |
| Browser back after scope switch | Returns to previous scope |
| Bookmark `/contexture/prod/dlq_operations` and open | Loads correctly; selector shows `contexture / prod` |
| Switch to scope with no artifacts | Destination page shows appropriate error; selector still functional |
| Navigate to `/{client}/{env}` not in SCOPES config | Page still loads; selector shows raw value |

### Build verification

```bash
cd portal && npm run build
# Must exit 0
```

### Test verification

```bash
cd portal && npm test
# Existing 17 runDiff tests must still pass
# No selector unit tests required in Phase 1 (no pure functions to test; all logic is route-driven)
```

---

## 12. Non-Goals

| Excluded | Reason |
|----------|--------|
| Authentication or authorization | Out of scope; platform is POC/demo |
| Dynamic scope discovery via backend API | Phase 1 uses static config; Phase 2 concern |
| localStorage as scope source | Explicitly rejected — breaks deep-linking and shared URLs |
| Tenant permission filtering | No permission model in Phase 1 |
| Auto-discovery from artifact directories | Not feasible in browser on static hosting |
| Selector outside the identity bar | Placement is decided: identity bar |
| Animated or custom-styled dropdown | Use native `<select>` for simplicity and accessibility |
| Disabling unavailable env options dynamically | Phase 1 shows all configured options; empty artifact state handled by page components |
