# Platform Manifest / Capability Registry — Plan Review

**Feature:** Platform Manifest / Capability Registry
**Plan artifact:** `docs/plans/platform_manifest_capability_registry_plan.md`
**Date:** 2026-03-10
**Reviewer:** Claude Code
**Recommendation:** APPROVED WITH THREE NOTES

---

## 1. Feature Summary

**Assessment: Correct and well-motivated.**

The plan accurately identifies the gap: the platform has no machine-readable
aggregate description of its own state. The manifest fills that gap without
modifying any existing contract. The Phase 1 / Phase 2 split is appropriate —
generate now, integrate into portal UI later.

---

## 2. Manifest Location — Option A (Global)

**Assessment: Correct choice. One note.**

`artifacts/platform-manifest.json` at the root of the artifact tree is the right
location. A single well-known URL that aggregates all scopes is exactly what
cross-scope discoverability requires. The 2-wildcard glob correctly targets only
v1.2.0 scoped histories:

```
artifacts/*/*/current/run_history.json
```

This excludes `artifacts/current/run_history.json` (1 wildcard — legacy v1.1.0)
automatically. Verified against the live artifact tree.

**Note 1 — Legacy artifacts at artifact root:**

The live artifact tree has legacy v1.0.0/v1.1.0 files at the root level:
`artifacts/manifest.json`, `artifacts/summary.json`, `artifacts/current/`.
The platform manifest will be written to `artifacts/platform-manifest.json`,
which does not conflict with any legacy file name. However, implementors should
verify that CloudFront caching behavior for this new root-level file is considered
in future production deployments. For local Vite dev, no concern.

---

## 3. Schema Design

**Assessment: Correct and minimal.**

The v1.0.0 schema is intentionally minimal:
- `schema_version` — correct to version from the start
- `generated_at` — consistent with all other artifact envelopes
- `clients` → `envs` → `dashboards` — clean hierarchical structure
- `latest_run_id` — most useful field for Phase 2 UI integration
- `artifact_types` — sorted, derived from latest successful run

**`latest_run_id` sourced from first successful run:**

The plan correctly filters `status == "SUCCESS"` when computing `latest_run_id`.
This means a scope with only failed runs shows no dashboards. This is correct —
a failed run's artifacts may be incomplete and should not be referenced as
"latest" in a capability registry.

**`artifact_types` sorted alphabetically:**

Correct. Ensures deterministic output and clean diffs. Verified against live data:
`["exceptions", "summary", "top_sites", "trend_30d"]` (dlq_operations).

**No concerns on schema.**

---

## 4. Data Sources

**Assessment: Correct. No new data collection.**

Deriving the manifest from `run_history.json` files is the right choice:
- `run_history.json` is already maintained by `_rebuild_run_history()`
- It already contains `dashboard_id`, `run_id`, `status`, and `artifacts[].type`
- No additional filesystem scan, no new artifact format, no new publisher query

**Correct decision: derive from artifact presence, not `scopes.js`.**

The manifest reflects what is actually bootstrapped. A scope in `scopes.js` but
not bootstrapped does not appear. A scope not in `scopes.js` but manually created
does appear. The manifest is truth, not configuration.

---

## 5. Generation Strategy — After Every `run()`

**Assessment: Correct approach.**

Calling `_rebuild_platform_manifest()` at the end of `run()` is consistent with
`_rebuild_run_history()`. Both are idempotent rebuilds triggered by artifact state
changes.

**Note 2 — `_rebuild_platform_manifest()` is called N+1 times during bootstrap:**

During `publisher bootstrap --client X --env local`, `bootstrap()` calls `run()`
N times (once per dashboard). Each `run()` call triggers both
`_rebuild_run_history()` and `_rebuild_platform_manifest()`. For 2 dashboards,
this means 2 manifest rebuilds per bootstrap. Both are idempotent and fast.

The plan correctly notes that a future optimization could call
`_rebuild_platform_manifest()` once after the loop in `bootstrap()`. This is not
needed in Phase 1. A one-line comment near the call in `run()` would be helpful
for future implementors, matching the existing comment pattern for
`_rebuild_run_history()` in `bootstrap()`.

---

## 6. Publisher Implementation

**Assessment: Correct. Algorithm is sound.**

The proposed implementation is clean:

1. `sorted(glob.glob(pattern))` — deterministic scan order ✓
2. `os.path.normpath(history_path).split(os.sep)` — correct path extraction;
   `parts[-3]` = env_id, `parts[-4]` = client_id on both Windows and Unix ✓
3. `continue` on malformed history — does not abort the full manifest ✓
4. Filter `status == "SUCCESS"` — only stable artifact state included ✓
5. `seen` dict with `if dashboard_id not in seen` — takes first (most recent)
   occurrence; runs are sorted most-recent-first by `_rebuild_run_history()` ✓
6. All lists sorted: clients by `client_id`, envs by `env_id`, dashboards by
   `dashboard_id`, artifact_types alphabetically ✓
7. `sort_keys=True` in `json.dump` — ensures deterministic key order in output ✓

**`generated_at` parameter:**

The function takes `generated_at` as a parameter (same as `_rebuild_run_history()`).
The caller in `run()` passes the same `generated_at` value computed once for the
entire run. This is correct — manifest `generated_at` should match the triggering
run's timestamp.

**Note 3 — Windows path separator:**

`os.path.normpath(history_path).split(os.sep)` uses `os.sep` which is `\\` on
Windows and `/` on Unix. This is correct — `os.path.normpath` converts all
separators to the platform separator before splitting. The plan is correct, but
implementors should be aware this is platform-sensitive. If the codebase ever runs
in a cross-platform Docker container, `os.sep` on the host may differ. This is
not a concern for the current POC stack (runs on Windows dev and would run on Linux
in ECS/Fargate). No action needed; noting for awareness.

---

## 7. Portal Integration Split

**Assessment: Correct Phase 1 / Phase 2 boundary.**

Phase 1 generates without portal changes. The manifest is available at
`/platform-manifest.json` via Vite `publicDir: ../artifacts`. No portal changes
needed.

Phase 2 opportunities are clearly described and well-bounded. The cleanest Phase 2
integration is selector auto-discovery (replacing `scopes.js` with a manifest
fetch). This was anticipated in the `scopes.js` file comment:
```js
// Phase 2: if scopes need to be dynamic, publish a /scopes.json artifact
```
The platform manifest supersedes the `scopes.json` idea — it provides richer data
than a bare scope list.

---

## 8. Failure Handling

**Assessment: Correct. Defensive handling throughout.**

- Malformed `run_history.json` → `continue` (skip scope, continue to others) ✓
- No successful runs for a dashboard → dashboard omitted from scope entry ✓
- Zero scopes found → `"clients": []` written (valid JSON, not harmful) ✓
- Write error → exception propagates naturally ✓

The manifest never blocks a publisher run. It is a best-effort aggregate.

---

## 9. Files to Modify

**Assessment: Minimal. One file modified, zero files created.**

Adding `_rebuild_platform_manifest()` to `main.py` and calling it from `run()`
is the correct minimal approach. No new module needed for Phase 1.

**Unchanged:** portal code, `scopes.js`, validators, `run_history.json` schema,
existing artifact contracts.

---

## 10. Verification Plan

**Assessment: Adequate. Covers the key cases.**

The manual verification steps cover:
- Single-scope manifest generation ✓
- Multi-scope manifest after bootstrap ✓
- Client/env list correctness ✓
- Artifact type list correctness ✓
- Portal serving the file ✓
- Failure scenario (malformed history) ✓

The build and test checks are standard and correct.

**One gap:** The verification plan does not test the case where a scope has runs
but ALL have `status != "SUCCESS"`. In this case, `seen` is empty and the scope
appears in `clients` with `"dashboards": []`. This is correct behavior — the scope
exists but has no successful artifacts — but it should be verified manually.

---

## Summary Assessment

| Section | Status |
|---------|--------|
| Feature framing | ✓ Correct; additive; no existing contracts modified |
| Location (Option A) | ✓ Global manifest; 2-wildcard glob excludes legacy files |
| Schema v1.0.0 | ✓ Minimal; sorted; SUCCESS-only `latest_run_id` |
| Data sources | ✓ Derived from existing `run_history.json` files |
| Generation strategy | ✓ After every `run()`; consistent with `_rebuild_run_history()` |
| Publisher implementation | ✓ Algorithm is correct and deterministic |
| Portal Phase 1/2 split | ✓ Generate now, integrate later |
| Failure handling | ✓ Defensive; does not block publisher run |
| Files to modify | ✓ One file (`main.py`); zero new files created |
| Verification | ✓ Adequate; one minor gap (all-failed-runs case) |
| Non-goals | ✓ Well-bounded |

**Recommendation: APPROVED WITH THREE NOTES**

The plan is architecturally correct, minimal, and immediately implementable.
Proceed with these notes:

1. **Legacy artifact root files:** `platform-manifest.json` doesn't conflict with
   existing legacy filenames. Note for future CloudFront configuration: ensure
   the new root-level file has appropriate cache headers (same as other artifacts).

2. **N+1 manifest rebuilds during bootstrap:** Add a one-line comment in `run()`
   near the `_rebuild_platform_manifest()` call noting that it is called once per
   dashboard during bootstrap, matching the existing comment pattern for
   `_rebuild_run_history()`.

3. **Windows path separator:** `os.path.normpath` + `os.sep` is correct for the
   current stack. No code change needed; awareness only.
