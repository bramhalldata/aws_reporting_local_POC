# Multi-Client & Multi-Environment Support — Phase 3: Documentation & Cleanup Plan

**Feature:** Multi-Client & Multi-Environment Support — Phase 3 Documentation & Cleanup
**Output artifact:** `docs/plans/multi_client_environment_support_phase3_docs_cleanup_plan.md`
**Date:** 2026-03-09
**Status:** Approved

---

## Context

Phases 1 and 2 of Multi-Client & Multi-Environment Support are complete and verified:

- **Phase 1 (Publisher):** Artifact tree is now scoped to `artifacts/{client}/{env}/current/` and `artifacts/{client}/{env}/runs/`. `run_history.json` schema bumped to v1.2.0 with required `client_id` and `env_id` envelope fields. `artifact.path` values now carry the full scope prefix.
- **Phase 2 (Portal):** Routing restructured to `/:client/:env/...`. `useArtifactPath()` derives client/env from `useParams()`. Identity bar shows `client / env`. Legacy routes redirect to `/default/local/...`.

Phase 3 does **not** change architecture, publisher logic, portal routing, or JSON schemas. Its purpose is to bring documentation into alignment with the implemented system so future contributors — human and AI — have accurate reference material.

**Problems identified in existing docs:**

| File | Issue |
|------|-------|
| `docs/json-contracts.md` | Shows schema v1.1.0; missing `client_id`, `env_id` envelope fields; artifact paths use old unscoped format |
| `README.md` | Completely outdated: old artifact output paths, wrong portal URL, stale directory structure, v1.0.0 artifact examples |
| `docs/architecture/` | Directory does not exist; no dedicated artifact layout or portal routing documentation |

---

## 1. Objectives

- Bring `docs/json-contracts.md` to v1.2.0 accuracy
- Rewrite `README.md` to reflect the current scoped artifact layout, current portal URL, and current publisher CLI behavior
- Create `docs/architecture/artifact-layout.md` documenting the scoped artifact tree
- Create `docs/architecture/portal-routing.md` documenting the `/:client/:env` routing model
- Eliminate all outdated references to `artifacts/current/` (unscoped) and old portal URLs in developer-facing documentation

---

## 2. `docs/json-contracts.md` — Updates

### 2a. Location and served-at headers

```
Before:
  Location: artifacts/current/run_history.json
  Served at: /current/run_history.json
  Envelope schema version: 1.1.0

After:
  Location: artifacts/{client}/{env}/current/run_history.json
  Served at: /{client}/{env}/current/run_history.json
  Envelope schema version: 1.2.0
```

### 2b. Envelope example — add client_id and env_id

```json
{
  "schema_version": "1.2.0",
  "client_id": "default",
  "env_id": "local",
  "generated_at": "2026-03-09T14:00:00+00:00",
  "runs": [ ... ]
}
```

### 2c. Envelope field table — add two rows

| Field | Type | Description |
|-------|------|-------------|
| `client_id` | string | Client identifier (e.g. `"default"`, `"contexture"`) |
| `env_id` | string | Environment identifier (e.g. `"local"`, `"prod"`) |

### 2d. Run entry artifact path example — add scope prefix

```
Before: "path": "runs/20260309T120000Z/dlq_operations/summary.json"
After:  "path": "default/local/runs/20260309T120000Z/dlq_operations/summary.json"
```

### 2e. Artifact Object path field description

```
Before: computed: runs/{run_id}/{dashboard_id}/{name}
After:  computed by publisher: {client_id}/{env_id}/runs/{run_id}/{dashboard_id}/{name}
        Portal never constructs artifact paths — path is publisher-owned.
```

### 2f. Schema history table — add v1.2.0 row

| Version | Change |
|---------|--------|
| `1.0.0` | Initial: `artifacts` was an array of bare filename strings |
| `1.1.0` | `artifacts` changed to structured objects with `name`, `type`, `path` |
| `1.2.0` | Envelope gains required `client_id` and `env_id`; `artifact.path` gains `{client_id}/{env_id}/` prefix |

### 2g. manifest.json location header — add client/env scope

```
Before:
  artifacts/current/<dashboardId>/manifest.json
  artifacts/runs/<runId>/<dashboardId>/manifest.json

After:
  artifacts/{client}/{env}/current/<dashboardId>/manifest.json
  artifacts/{client}/{env}/runs/<runId>/<dashboardId>/manifest.json
```

---

## 3. `README.md` — Updates

### 3a. Step 3 publisher output paths

```
Before:
  Output:
    artifacts/manifest.json
    artifacts/summary.json ...

After:
  Artifacts written to:
    artifacts/default/local/current/dlq_operations/
    artifacts/default/local/runs/{run_id}/dlq_operations/
    artifacts/default/local/current/run_history.json
```

### 3b. Step 4 portal URL

```
Before: http://localhost:5173
After:  http://localhost:5173/default/local/dlq_operations
```

### 3c. Directory structure

Update `artifacts/` block to show scoped tree. Update `portal/src/` block to show current file structure.

### 3d. Verification commands

```
Before:
  cat artifacts/manifest.json
  cat artifacts/summary.json

After:
  cat artifacts/default/local/current/run_history.json
  cat artifacts/default/local/current/dlq_operations/manifest.json
```

### 3e. Artifact Contracts section

Replace stale v1.0.0 inline examples with a pointer to `docs/json-contracts.md`.

### 3f. Add Multi-Client & Multi-Environment Routing section

Document `/default/local/dlq_operations` as the default local URL, and show how to publish/navigate for different client/env combinations.

---

## 4. New Files

### `docs/architecture/artifact-layout.md`

- Artifact directory tree with `{client}/{env}` scoping
- Roles of `current/` vs `runs/`
- Key principles: isolation, immutable runs, publisher-owned paths

### `docs/architecture/portal-routing.md`

- Full route model: `/:client/:env/<dashboard>`, history, run detail
- Why URL-prefix wins over application state
- How `useParams()` and `useArtifactPath()` work together
- Routing guardrails
- Example URLs

---

## 5. Non-Goals

Phase 3 does NOT:
- Modify portal routing code
- Modify publisher logic
- Change JSON schemas or validators
- Change artifact layouts
- Introduce new features

---

## 6. Files to Change

| File | Action |
|------|--------|
| `docs/json-contracts.md` | Update |
| `README.md` | Update sections |
| `docs/architecture/artifact-layout.md` | Create (new) |
| `docs/architecture/portal-routing.md` | Create (new) |

### Unchanged

- All publisher Python files
- All portal `.jsx` files
- All schema validators
- `CLAUDE.md`, `docs/claude-startup-guide.md`

---

## 7. Verification Checklist

- [ ] `docs/json-contracts.md` envelope example matches `artifacts/default/local/current/run_history.json`
- [ ] `docs/json-contracts.md` schema version is `"1.2.0"` throughout
- [ ] `docs/json-contracts.md` artifact path example starts with `default/local/runs/`
- [ ] `docs/json-contracts.md` schema history includes v1.2.0 row
- [ ] `README.md` Step 3 output paths point to `artifacts/default/local/`
- [ ] `README.md` portal URL is `http://localhost:5173/default/local/dlq_operations`
- [ ] `README.md` verification commands use scoped paths
- [ ] `README.md` no stale references to root-level `artifacts/summary.json`
- [ ] `docs/architecture/artifact-layout.md` exists and is accurate
- [ ] `docs/architecture/portal-routing.md` exists and is accurate
- [ ] `npm run build` exits 0
