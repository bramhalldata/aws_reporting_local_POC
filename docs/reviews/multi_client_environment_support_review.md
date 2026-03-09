# Review: Multi-Client & Multi-Environment Support Plan

**Plan artifact:** `docs/plans/multi_client_environment_support_plan.md`
**Reviewer:** Architecture Review (Claude Code)
**Date:** 2026-03-09
**Status:** APPROVED WITH MINOR REVISIONS

---

## 1. Review Summary

The plan is architecturally sound and well-scoped. It correctly identifies `client_id` and `env_id` as first-class dimensions that must propagate through every layer — publisher, artifact storage, schema, and portal routing — without becoming application state. The URL-prefix routing model (`/:client/:env`) is the right choice for a static-file-served SPA on S3/CloudFront: it makes client/env deep-linkable, bookmarkable, and inherently consistent via React Router `useParams()`. No React context or global store is needed.

Phasing is correctly sequenced: publisher migration first (zero portal regression risk), then atomic portal routing change, then documentation. This sequencing is essential given that the portal routing change is breaking.

Minor concerns are noted below but do not block implementation.

---

## 2. Strengths of the Plan

- **URL-prefix context model** is the right architecture for this platform. `useParams()` propagates client/env to every component in the subtree automatically — zero prop drilling, zero sync bugs, zero localStorage drift.
- **Phase 1 is truly zero-risk** — publisher writes to a new path tree while the existing `artifacts/current/` tree remains untouched. The current portal continues to work without modification.
- **`useArtifactPath` hook as the extension point** is elegant: dashboard components (`DlqOperations.jsx`, `PipelineHealth.jsx`) require zero changes. Adding client/env awareness touches exactly one function.
- **Artifact path ownership is correctly assigned to the publisher.** The portal never computes `artifact.path` — it only renders what the publisher provided. This is the right boundary.
- **`LegacyRunDetailRedirect` approach is correct.** `Navigate` cannot inject dynamic route params, so wrapper components using `useParams()` + `useNavigate()` are the only correct solution. The plan correctly identifies this.
- **Schema versioning is incremental and backwards-compatible.** v1.2.0 adds required envelope fields; the structured artifact object contract from v1.1.0 is unchanged.
- **`ARTIFACTS_BASE_DIR` as a module-level constant with scoped derivation inside `run()`** keeps the publisher deterministic and testable per invocation without introducing global mutable state.
- **Routing guardrails section (§8)** prevents future architectural drift — specifically, the rule that `useParams()` is the sole source of client/env.

---

## 3. Architectural Concerns

### 3.1 `DEFAULT_ENV = "prod"` for local development

The plan redirects all legacy bookmarks and bare URLs to `default/prod`. During local development, the publisher `__main__` block writes to `default/local`. This means developers navigating to `/` or `/dlq_operations` will land on `default/prod`, which may not have artifacts, producing a confusing fetch error.

**Risk level:** Low — this is a development UX issue, not a correctness issue.
**Suggestion:** Consider `DEFAULT_ENV = "local"` for local dev, or document that the dev workflow is to navigate directly to `/default/local/dlq_operations`.

### 3.2 Portal catch-all within `/:client/:env` could match dashboard IDs

The `<Route path="*" element={<Navigate to={defaultDashboard} replace />} />` inside the `/:client/:env` parent redirects unknown sub-paths to `defaultDashboard`. If a client navigates to `/:client/:env/typo`, they get silently redirected rather than a 404. For the current scope (2 dashboards, internal tool), this is acceptable.

**Risk level:** Low.

### 3.3 No input validation on `client_id` / `env_id` in publisher

The publisher currently accepts any string for `client` and `env` and uses them directly in filesystem paths. Malicious or malformed values (e.g., `../../etc`) could construct unexpected paths.

**Risk level:** Low for local/POC scope; must be addressed before production.
**Suggestion:** Add a simple alphanumeric + underscore/hyphen guard in `run()` before path construction:
```python
import re
if not re.match(r'^[a-zA-Z0-9_-]+$', client_id):
    raise ValueError(f"Invalid client_id: {client_id!r}")
if not re.match(r'^[a-zA-Z0-9_-]+$', env_id):
    raise ValueError(f"Invalid env_id: {env_id!r}")
```

### 3.4 `_rebuild_run_history` scan pattern depth is fragile

The scan pattern `artifacts/{client}/{env}/runs/*/*/manifest.json` assumes exactly two path components below `runs/`: `{run_id}/{dashboard_id}`. If the artifact tree structure ever changes depth, the glob silently finds nothing. This is the existing pattern and not a regression, but worth noting.

---

## 4. Scalability Assessment

### Dashboards
Adding a new dashboard requires one line in `dashboards/index.js`. Routing, artifact path computation, and run history are fully data-driven. No changes needed to any routing or publisher logic. **Scales well.**

### Clients and environments
Each client/env pair gets an isolated artifact tree, an isolated `run_history.json`, and an isolated portal URL prefix. There is no cross-client contamination risk in the current design. The portal simply follows URLs — navigating to `/acme_health/prod/dlq_operations` fetches `/acme_health/prod/current/dlq_operations/manifest.json` automatically. **Scales well.**

### Run history size
`run_history.json` is a flat list of all runs for a given client/env, rebuilt from disk on every publisher invocation. For the current POC scale (tens to hundreds of runs), this is correct. At production scale (thousands of runs per client), the scan-and-rebuild approach will need pagination or an index strategy.

### Permission filtering
The current design has no permission layer — any URL is publicly navigable if the artifact tree is served. When client isolation requires access control, CloudFront signed URLs or a gateway layer must be added. The URL-prefix model is compatible with CloudFront path-based behaviors, so this extension is feasible.

---

## 5. Missing Design Decisions

### 5.1 `DEFAULT_ENV` value for local development (§3.1 above)

The plan specifies `DEFAULT_ENV = "prod"` but the `__main__` block uses `env="local"`. The catch-all redirect destination and the local dev workflow are misaligned. A decision is needed before Phase 2 implementation.

**Recommendation:** Set `DEFAULT_ENV = "local"` in `App.jsx`, or add a dev-environment note to the verification plan.

### 5.2 Handling of old artifact trees after Phase 1

The plan states old `artifacts/current/` and `artifacts/runs/` files are "left on disk; publisher stops writing; portal never fetches." There is no explicit cleanup step. For the local dev environment, stale old-layout files may cause confusion. This is acceptable for POC but should be documented.

### 5.3 Input validation for `client_id` / `env_id` (§3.3 above)

No validation is specified. Decision: validate in publisher `run()`, or defer to a future hardening phase.

---

## 6. Recommended Improvements

1. **Add `client_id`/`env_id` validation** in `run()` before path construction (see §3.3). A one-line regex guard prevents path traversal and catches typos early.

2. **Clarify `DEFAULT_ENV`** in Phase 2 implementation: decide between `"prod"` (production-first default) and `"local"` (developer-friendly default). Document the intended workflow in `docs/publisher-runbook.md`.

3. **Add a `docs/` note about old artifact tree cleanup** for local development. After Phase 2, old `artifacts/current/` files will confuse developers who run `ls artifacts/` and see both old and new layouts.

4. **Phase 1 verification: test `artifacts/current/` is untouched.** The verification plan mentions this check; confirm it is explicit in the implementation checklist (e.g., assert `artifacts/current/dlq_operations/summary.json` modification time is unchanged after running the publisher post-Phase 1).

---

## 7. Implementation Risks

| Risk | Likelihood | Severity | Mitigation |
|------|-----------|---------|-----------|
| Phase 2 portal routing change breaks navigation entirely | Medium | High | All six portal files must land atomically; test all routes before committing |
| `LegacyRunDetailRedirect` `useNavigate` inside `useEffect` causes double-render | Low | Low | Standard React Router v6 pattern; no functional risk |
| Old `artifacts/current/` files confuse Phase 1 verification | Low | Low | Explicitly assert old tree is unchanged in verification |
| `DEFAULT_ENV = "prod"` causes blank dashboard for local dev after Phase 2 | Medium | Medium | Clarify and document correct local dev URL before merging Phase 2 |
| Path traversal via unvalidated `client_id`/`env_id` | Low (local only) | High (prod) | Add validation before Phase 1 merge |
| Vite `publicDir: ../artifacts` serving sensitive future client data | Low | Medium | Not a Phase 1/2 concern; note for future S3 access control design |

---

## 8. Approval Recommendation

```
APPROVED WITH MINOR REVISIONS
```

The plan is ready to implement in its current form. Phase 1 (publisher migration) may proceed immediately. The following items should be resolved before or during Phase 2 implementation:

1. **Clarify `DEFAULT_ENV`** — decide `"prod"` vs `"local"` and document the local dev workflow.
2. **Add `client_id`/`env_id` input validation** in `run()` — a one-line guard, not a blocking concern for Phase 1.

All other concerns are low-severity or deferred to future phases. The core architecture — URL-prefix routing, `useParams()` propagation, publisher-owned path computation, `useArtifactPath` as the sole portal path builder — is correct and should not be changed.
