# Artifact File Serving Expansion — Architecture Review

**Plan artifact:** `docs/plans/artifact_file_serving_expansion_plan.md`
**Review artifact:** `docs/reviews/artifact_file_serving_expansion_review.md`
**Date:** 2026-03-09
**Reviewer role:** Staff-level architecture reviewer

---

## 1. Review Summary

The plan is architecturally sound and well-scoped. It correctly identifies the root cause (Vite `publicDir` too narrow), proposes the right fix (expand to `../artifacts`), and combines it with a minimal but meaningful artifact contract improvement (structured artifact objects in `run_history.json`).

The option comparison is rigorous — both rejected alternatives (proxy and path abstraction) fail for legitimate reasons that the plan explains clearly. The plan is implementable without ambiguity.

**Scope assessment:** Appropriate. Two concerns are addressed together because they share a dependency — the portal cannot display correct links without both the serving change and the contract improvement. Combining them is correct.

**System direction alignment:** Strong. The change advances the `useArtifactPath` migration the codebase was already designed for, keeps metrics in Athena, keeps artifacts as the delivery contract, and keeps the portal as a presentation layer.

---

## 2. Strengths of the Plan

- **Production-correct serving model.** Option A (publicDir expansion) works identically in Vite dev and S3 + CloudFront. This is the only option that would actually work end-to-end.
- **Publisher enrichment at the right boundary.** `_rebuild_run_history()` is the correct place to emit `path` and `type` — the publisher has all required context (`run_id`, `dashboard_id`, `filename`) and no UI consumer needs to recompute it.
- **Manifest schema unchanged.** Keeping `manifest.json` artifacts as bare strings is correct. The enrichment scope is limited to `run_history.json`, which is the consumer-facing contract. This minimizes blast radius.
- **No new files, no new dependencies.** The feature is implemented entirely through targeted changes to existing files.
- **`useArtifactPath` hook becomes genuinely useful.** The hook was already defined for this migration. Adopting it now closes the gap between the designed intent and the actual usage.
- **Route stability preserved.** `/history/:runId/:dashboardId` is unchanged, honoring the explicit stability contract from the prior plan.
- **Deployment order documented as a prerequisite.** The publisher-before-portal requirement is called out explicitly in the verification steps.

---

## 3. Architectural Concerns

### Concern 1 — `type` derived by stripping `.json` (low severity)

**Issue:** `"trend_30d.json".replace(".json", "")` → `"trend_30d"`. This works for all current artifacts but is a brittle convention. If a future artifact were named `report.v2.json`, the type would be `"report.v2"`, which may not be the intended identifier.

**Assessment:** Acceptable for Phase 1 in a POC context. The artifact naming convention is controlled by the dashboard config and has been stable. However, `type` could later be defined explicitly in `dashboards/<id>/dashboard.json` if a richer taxonomy is needed.

**Recommendation:** Accept for Phase 1. Add a comment in `_rebuild_run_history()` noting that `type` is derived by stripping `.json` and that a future phase may define it explicitly in dashboard config.

---

### Concern 2 — `SCHEMA_VERSION` constant is documentary only (low severity)

**Issue:** `run_history_schema.py` defines `SCHEMA_VERSION = "1.0.0"` (to be bumped to `"1.1.0"`). This constant is not validated by the jsonschema validator — the schema does not enforce that the envelope's `schema_version` field matches the constant. The bump is purely documentary.

**Assessment:** Not a defect; the constant serves as a human-readable marker and audit trail. But a future reader might assume it is enforced and be confused when validation passes regardless of the version string.

**Recommendation:** Add a comment in `run_history_schema.py` clarifying that `SCHEMA_VERSION` is a documentary constant, not enforced by the validator.

---

### Concern 3 — `RunHistory.jsx` artifact display width (cosmetic, low severity)

**Issue:** The artifacts column currently renders `run.artifacts.join(", ")`. After the change it renders `run.artifacts.map((a) => a.name).join(", ")`. For dashboards with many artifacts this could make the column wide. This is a pre-existing display concern, not introduced by this plan.

**Assessment:** Not blocking. Acceptable for Phase 1.

---

### Concern 4 — Old `run_history.json` backward compatibility (informational)

**Issue:** Existing `run_history.json` in `artifacts/current/` contains bare strings. After implementation, the portal code expects structured objects. The plan relies on the publisher re-run to regenerate the file. If the publisher is not re-run, the portal breaks silently (`artifact.name` returns `undefined`, no error thrown).

**Assessment:** The plan correctly calls out the prerequisite. Since `_rebuild_run_history()` scans all historical manifests and rebuilds the full index, a single publisher re-run produces a correctly structured file for all existing runs. No per-run migration is needed.

**Recommendation:** Accepted as documented. The prerequisite block in Verification Steps is sufficient.

---

## 4. Scalability Assessment

### Dashboard growth
The `useArtifactPath` hook migration scales linearly — each new dashboard adopts the hook at registration time via the same pattern. No central registry change required.

### Client/env scoping (Phase 2)
The hook comment already documents the Phase 2 extension point: `useArtifactPath` gains `clientId` and `env` parameters. All dashboard components will benefit automatically because they use the hook — no component-level changes needed at Phase 2.

### Artifact type taxonomy growth
The `type` field derived from filename is sufficient for Phase 1. If the taxonomy grows complex (e.g., distinguishing AI artifacts from reporting artifacts), the `type` could be explicitly defined in `dashboards/<id>/dashboard.json` and propagated through the manifest. The contract already supports this without a breaking change — `type` is already present in the object.

### `run_history.json` unbounded growth
This is a pre-existing concern noted in the prior plan. Out of scope here. The plan correctly does not address it.

---

## 5. Missing Design Decisions

None identified that are blocking implementation. The plan is sufficiently detailed for a single engineer to implement without ambiguity.

**One decision to document for future phases:** Whether `path` in the structured artifact object should include the `/current/` prefix for active-run artifacts (e.g., `current/dlq_operations/summary.json`) in addition to `runs/<id>/...` paths. Currently `path` only covers historical run artifacts. For Phase 1 this is correct — RunDetail only shows historical artifacts. Document this scope boundary in a comment or in `docs/json-contracts.md`.

---

## 6. Recommended Improvements

### R1 — Add `type` derivation comment in `_rebuild_run_history()`
```python
# type is derived by stripping the .json extension. This convention works for
# current artifact naming. A future phase may define type explicitly in dashboard.json.
"type": filename.replace(".json", ""),
```

### R2 — Add `SCHEMA_VERSION` comment in `run_history_schema.py`
```python
# SCHEMA_VERSION is a documentary constant for human reference and audit trail.
# It is not enforced by the jsonschema validator.
SCHEMA_VERSION = "1.1.0"
```

### R3 — Note `path` scope boundary in `docs/json-contracts.md`
When documenting the new `path` field, note that it currently covers only historical run artifacts (`runs/<run_id>/<dashboard_id>/<filename>`). Active-run artifact paths are handled by `useArtifactPath` and are not stored in `run_history.json`.

These are all minor improvements. None are blocking.

---

## 7. Implementation Risks

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Portal broken if publisher not re-run before testing | Medium | Prerequisite block in Verification Steps; developer must follow order |
| Stale fetch paths not migrated (`/${DASHBOARD}/...`) | Medium | Verification step 8: grep check confirms zero stale paths |
| `DlqOperations` or `PipelineHealth` regression from hook adoption | Medium | Negative test 1 (old path 404s) + dashboard load regression check in step 3 |
| `RunHistory.jsx` artifact cell still using `join` on objects | Low | Easy to catch: renders `[object Object], [object Object]` visually |
| Schema validator warning suppressed silently | Low | Publisher logs to stderr; developer should observe output during verification |

---

## 8. Approval Recommendation

**APPROVED WITH MINOR REVISIONS**

The plan is architecturally correct and ready to implement. The recommended improvements (R1, R2, R3) are minor additions that can be incorporated during implementation without re-reviewing the plan.

Implementation may proceed after this review is acknowledged.
