# Run History UI — Architecture Review

**Plan artifact:** `docs/plans/run_history_ui_plan.md`
**Review artifact:** `docs/reviews/run_history_ui_review.md`
**Reviewer:** Staff Architecture Review
**Date:** 2026-03-08
**Stage:** REVIEW

---

## 1. Review Summary

The plan is architecturally sound and well-scoped. The central design decision — having the
publisher generate a pre-built `run_history.json` index into `artifacts/current/` — is the
correct resolution to the `publicDir` constraint. It avoids changing Vite configuration,
keeps all existing artifact paths intact, and introduces no new serving infrastructure.

Phase 1 scope is appropriately minimal: list view only, no detail page, no client/env scoping.
The plan correctly defers detail routing to Phase 2 (which requires a `publicDir` change) and
multi-client scoping to Phase 2 of the client identity work.

The design aligns with system direction. Portal components follow existing patterns. The
publisher change is additive and restart-safe. The schema validator follows the established
pattern for all other artifact validators.

Three concerns warrant attention before implementation proceeds. Two are bugs in the plan's
code (sort order, `sys.exit(1)` placement). One is an architectural inconsistency (`useArtifactPath`
not adopted in `RunHistory.jsx`). All three are resolvable without restructuring the plan.

---

## 2. Strengths of the Plan

**Elegant constraint resolution.** Using the publisher to pre-build the index avoids all
alternatives (changing `publicDir`, adding a proxy, serving `artifacts/runs/` directly). The
chosen approach is the least disruptive and consistent with the "publisher generates all
artifacts" principle.

**Additive, non-breaking publisher change.** `_rebuild_run_history()` is a standalone function
called at the end of `run()`. It adds no coupling to existing steps. Removing it later would
leave zero impact on existing dashboard artifact generation.

**Deterministic artifact output.** `json.dump(..., sort_keys=True)` is correctly included.
Combined with the fixed sort key, this ensures bit-identical output for identical inputs,
consistent with the architecture's determinism requirement.

**Follows established portal patterns.** `RunHistory.jsx` uses the same `useEffect` /
`useState` / error-first guard pattern as `DlqOperations.jsx`. Cashmere semantic color tokens
are used throughout. No hardcoded hex values.

**Clear Phase 2 migration paths documented.** The plan explicitly identifies the `publicDir`
migration path for detail routing, the `useArtifactPath` extension point for client/env
scoping, and the fail-safe write pattern for FAILURE status recording. None of these are
needed in Phase 1 but the plan leaves clean extension points.

**Comprehensive verification and negative tests.** The four positive tests and four negative
tests cover the expected happy paths and the most likely failure modes (missing file, empty
history, regression on existing dashboards).

**Right-aligned History link is visually correct.** `marginLeft: "auto"` on `platformLinks`
pushes it to the far right of the flex container, creating a clear visual distinction between
dashboard navigation tabs and platform-level utility links.

**Schema includes FAILURE status.** Even though Phase 1 never records FAILURE entries, the
schema enum `["SUCCESS", "FAILURE"]` is future-ready. Adding Phase 2 FAILURE recording
requires no schema bump.

---

## 3. Architectural Concerns

### 3.1 Sort order bug — both fields reversed

**Severity: Medium**

The plan sorts run entries with:

```python
runs.sort(key=lambda r: (r["run_id"], r["dashboard_id"]), reverse=True)
```

`reverse=True` applies to the entire tuple, so **both** `run_id` and `dashboard_id` are
sorted descending. The stated intent is run_id descending (most recent first) and dashboard_id
ascending (alphabetical) within the same run. The current code produces reverse alphabetical
dashboard_id ordering within a run (e.g., `pipeline_health` before `dlq_operations` instead
of `dlq_operations` before `pipeline_health`).

This is a silent bug — the output is sorted, just not as documented. Correct implementation:

```python
runs.sort(key=lambda r: (r["run_id"], r["dashboard_id"]))
# run_id ascending, dashboard_id ascending — then reverse only run_id:
runs.sort(key=lambda r: r["run_id"], reverse=True)
```

Or equivalently with a single sort using negated comparator (not idiomatic for strings). The
two-sort approach is clearer.

### 3.2 `sys.exit(1)` after successful dashboard artifact writes

**Severity: Medium**

`_rebuild_run_history()` calls `sys.exit(1)` if schema validation fails:

```python
try:
    run_history_schema.validate(run_history)
except jsonschema.ValidationError as exc:
    print(f"ERROR: run_history.json schema validation failed: {exc.message}", file=sys.stderr)
    sys.exit(1)
```

At this point in the publisher run, all dashboard artifacts have already been written to
`artifacts/current/`. If `_rebuild_run_history()` fails, the operator sees a fatal exit but
the dashboard artifacts are current and correct. The next publisher run will re-build
`run_history.json` successfully.

The surprising failure mode: an operator would need to re-run the full publisher to recover
from a `run_history.json` validation failure, even though all dashboard data is fine. This
violates the principle of least surprise.

**Recommended alternative:** log an error and continue rather than `sys.exit(1)`. The history
index is a derived convenience artifact, not a primary reporting contract. A missing or stale
history file should not invalidate a successful dashboard artifact run.

```python
except jsonschema.ValidationError as exc:
    print(f"WARNING: run_history.json schema validation failed — history not updated: {exc.message}", file=sys.stderr)
    return
```

### 3.3 `RunHistory.jsx` does not use `useArtifactPath`

**Severity: Low**

The `useArtifactPath` hook was introduced specifically so that portal components do not
construct artifact paths directly. `RunHistory.jsx` fetches `/run_history.json` with a
hardcoded path:

```javascript
const res = await fetch("/run_history.json");
```

The plan acknowledges this in the Phase 2 section ("The `useArtifactPath` hook ... is the
correct extension point") but defers adoption. However, if `useArtifactPath` is not adopted
from the start, `RunHistory.jsx` becomes the one component that constructs paths directly,
creating an inconsistency in the codebase and requiring modification when Phase 2 client/env
scoping arrives.

The hook currently returns `/${dashboardId}/${filename}`, which is dashboard-scoped. A
platform-level artifact like `run_history.json` doesn't have a `dashboardId`. One option:
extend the hook to support a platform-level path variant, or introduce a separate
`usePlatformArtifactPath` hook. For Phase 1, the hardcoded path is acceptable, but the
architectural inconsistency should be noted and a Phase 2 task created.

**Recommended action:** Document this as a known Phase 2 task in the plan. No implementation
change required for Phase 1.

### 3.4 Unbounded history file growth

**Severity: Low (local dev), Medium (long-running environments)**

The plan specifies no retention policy. Every publisher run appends entries to `run_history.json`.
Over months of runs in a long-lived environment, this file will grow indefinitely. The publisher
re-scans all `artifacts/runs/` manifests on each run, making the scan O(N) in the number of
historical runs.

This is not a Phase 1 concern (local dev), but should be documented as a known limitation
requiring resolution before production deployment.

### 3.5 History NavLink is not registry-driven

**Severity: Low**

Dashboard tabs are driven by `dashboardMeta`. The History NavLink is hardcoded in `NavBar.jsx`.
This is appropriate for Phase 1 — History is a platform-level page, not a dashboard plugin —
but it creates two separate navigation patterns in `NavBar.jsx`. If platform links multiply
(e.g., Settings, Admin, Docs), the hardcoded approach does not scale.

The plan does not document a strategy for platform-level navigation extensibility. This is
acceptable for Phase 1 but should be tracked for Phase 2.

---

## 4. Scalability Assessment

**Publisher-side index generation:** The glob scan is O(N) in the number of run directories.
For hundreds of runs, this is negligible. For thousands, the scan and JSON serialization will
add measurable time to the publisher run. Not a Phase 1 concern; document the threshold.

**Portal-side table rendering:** `RunHistory.jsx` renders all rows without virtualization.
For development use with tens to hundreds of runs, this is fine. For thousands of rows in a
long-lived environment, browser performance would degrade. Windowed rendering (e.g., react-window)
would be required at scale.

**Multi-client scoping:** The Phase 2 migration path is correctly identified (`useArtifactPath`
for client/env injection). The plan does not require any client scoping in Phase 1, and the
architecture correctly defers it. No concern here.

**Schema version:** `schema_version: "1.0.0"` at the top level gives a clear bump point for
future schema changes. Each run entry also carries its own `schema_version` (from the manifest).
This dual versioning is slightly unusual — ensure consumers understand that the outer
`schema_version` governs the `run_history.json` envelope, not the individual dashboard
artifact schema.

---

## 5. Missing Design Decisions

### 5.1 History retention / rotation policy

The plan does not define how many historical runs are retained, or when/whether old entries
are pruned from `run_history.json`. This must be decided before production deployment.

### 5.2 FAILURE run capture strategy

Phase 1 states that FAILURE runs are never recorded because `sys.exit(1)` fires before
artifacts are written. The Phase 2 discussion mentions a "fail-safe write" but does not
define the mechanism. This should be designed before Phase 2 begins; the schema is already
ready.

### 5.3 Platform navigation extensibility

No decision has been made about how platform-level links (History, and future links) are
managed in NavBar. A simple `platformLinks` array (similar to `dashboardMeta`) would allow
future platform pages to be added without modifying NavBar.jsx directly.

---

## 6. Recommended Improvements

| # | Concern | Action | Phase |
|---|---------|--------|-------|
| 1 | Sort order bug | Use two-sort approach: sort by `dashboard_id` ascending, then stable-sort by `run_id` descending | Phase 1 |
| 2 | `sys.exit(1)` after dashboard writes | Change to warn-and-continue for `_rebuild_run_history` validation failures | Phase 1 |
| 3 | `useArtifactPath` not adopted | Document as known Phase 2 task; no Phase 1 change required | Phase 2 |
| 4 | Unbounded history growth | Document known limitation; define retention policy before production | Pre-prod |
| 5 | Platform nav extensibility | Define `platformLinks` registry or equivalent before adding a second platform page | Phase 2 |

Items 1 and 2 should be corrected during implementation. Items 3–5 are documented concerns
that do not block Phase 1.

---

## 7. Implementation Risks

**Sort order mismatch (HIGH).** If implemented as written, `reverse=True` on the tuple sort
produces the wrong dashboard_id ordering within a run. This is a code-level bug in the plan
that must be caught at implementation time.

**`sys.exit(1)` placement surprise (MEDIUM).** An implementer may accept the `sys.exit(1)`
as correct (matching the pattern used elsewhere in `main.py`) without noticing that it fires
after dashboard artifacts are written. The change to warn-and-continue is a judgment call
that should be explicit in the implementation task.

**NavBar flex layout regression (LOW).** Adding `<div style={styles.platformLinks}>` with
`marginLeft: "auto"` assumes the nav `<nav>` element uses `display: flex`. The current
NavBar JSX does use `display: flex` on `styles.nav`, so this is safe — but it must be
verified at implementation time, especially if the NavBar styles are ever reorganized.

**`run_history.json` missing on first page load (LOW).** On a fresh checkout where the
publisher has never been run, navigating to `/history` will display the error box. This is
documented in the negative tests and the error message is informative. No regression risk,
but the error message should be tested.

**`glob` module import collision (LOW).** The plan adds `import glob` to `main.py`. Verify
no existing local module named `glob` exists in `src/publisher/` that would shadow the
stdlib module.

---

## 8. Approval Recommendation

```
APPROVED WITH REVISIONS
```

The plan is architecturally sound and the Phase 1 scope is correct. Two implementation-level
bugs in the plan's code (sort order reversal, `sys.exit(1)` placement) must be corrected
during implementation. The remaining items (unbounded growth, `useArtifactPath` adoption,
platform nav extensibility) are Phase 2 concerns that should be tracked but do not block
implementation.

**Required before implementation proceeds:**
1. Correct the sort order: two-sort approach for `(run_id desc, dashboard_id asc)`
2. Change `_rebuild_run_history` failure handling from `sys.exit(1)` to warn-and-continue

**Track for Phase 2:**
3. Adopt `useArtifactPath` pattern for `RunHistory.jsx` platform artifact path
4. Define history retention / rotation policy
5. Design platform navigation extensibility model
