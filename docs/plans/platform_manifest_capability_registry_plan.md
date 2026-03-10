# Platform Manifest / Capability Registry — Implementation Plan

**Feature:** Platform Manifest / Capability Registry
**Output artifact:** `docs/plans/platform_manifest_capability_registry_plan.md`
**Date:** 2026-03-10
**Status:** Draft — pending review

---

## Context

The platform has no machine-readable description of its own state. The portal
discovers capabilities through a combination of hardcoded registries (`scopes.js`,
`dashboards/index.js`) and per-scope `run_history.json` files. There is no single
artifact that answers: "what clients, environments, and dashboards does this
platform currently serve?"

The platform manifest closes this gap by providing a global, static, automatically-
generated capability index at a well-known URL.

---

## 1. Feature Summary

The platform manifest is a single JSON file written by the publisher that
describes all bootstrapped client/env scopes and their current dashboard state.

**What it enables:**

| Benefit | Description |
|---------|-------------|
| Discoverability | Any tool can fetch one URL to learn the full platform state |
| UI safety | Portal can show only dashboards that actually have artifacts (Phase 2) |
| Platform introspection | Operators can inspect scope health at a glance |
| Automation | CI/CD pipelines, monitoring, and future tooling can read one file |
| Onboarding | New developers can understand the platform state immediately |

The manifest is additive — it does not replace or modify `run_history.json`.

---

## 2. Manifest Schema (v1.0.0)

```json
{
  "schema_version": "1.0.0",
  "generated_at": "2026-03-10T16:50:00+00:00",
  "clients": [
    {
      "client_id": "default",
      "envs": [
        {
          "env_id": "local",
          "dashboards": [
            {
              "dashboard_id": "dlq_operations",
              "latest_run_id": "20260309T175159Z",
              "artifact_types": ["exceptions", "summary", "top_sites", "trend_30d"]
            },
            {
              "dashboard_id": "pipeline_health",
              "latest_run_id": "20260309T180545Z",
              "artifact_types": ["failure_types", "summary"]
            }
          ]
        }
      ]
    },
    {
      "client_id": "contexture",
      "envs": [
        {
          "env_id": "local",
          "dashboards": [
            {
              "dashboard_id": "dlq_operations",
              "latest_run_id": "20260310T164747Z",
              "artifact_types": ["exceptions", "summary", "top_sites", "trend_30d"]
            },
            {
              "dashboard_id": "pipeline_health",
              "latest_run_id": "20260310T164747Z",
              "artifact_types": ["failure_types", "summary"]
            }
          ]
        }
      ]
    }
  ]
}
```

### Schema design principles

- **Minimal**: only what is needed for Phase 1 discovery and Phase 2 UI integration
- **Sorted**: all lists sorted alphabetically (clients, envs, dashboards, artifact_types) for deterministic diffs
- **`latest_run_id`**: the most recent successful run for that dashboard in that scope; `null` if no successful run exists
- **`artifact_types`**: derived from the latest successful run's artifact list; sorted alphabetically

---

## 3. Manifest Location

**Recommendation: Option A — `artifacts/platform-manifest.json` (global)**

| Option | Location | Assessment |
|--------|---------|------------|
| **A (chosen)** | `artifacts/platform-manifest.json` | Single well-known URL; aggregates all scopes; one fetch for full picture |
| B | `artifacts/{client}/{env}/current/platform-manifest.json` | Scoped only; portal must know scopes in advance to fetch N files |
| C | Both global + scoped | Over-engineering for Phase 1 |

**Why Option A:**

- The manifest's primary purpose is **cross-scope discoverability** — scoped manifests do not serve this purpose
- A single static URL (`/platform-manifest.json`) is fetchable by any tool without prior knowledge of what scopes exist
- The file remains small: O(clients × envs × dashboards) — currently ~15 fields total
- CloudFront serves it at a predictable, cache-invalidatable path
- The 2-wildcard glob `artifacts/*/*/current/run_history.json` correctly scans only v1.2.0 scoped histories, not legacy v1.1.0 root-level files

**Scope sources**: The manifest is derived from **actual artifact presence on disk**, not from `scopes.js`. A scope configured in `scopes.js` but not yet bootstrapped simply does not appear in the manifest. A scope not in `scopes.js` but manually created does appear. The manifest reflects truth, not configuration.

---

## 4. Data Sources

| Data | Source | Notes |
|------|--------|-------|
| Client list | `artifacts/*/` directory scan | Two wildcards: `{client}/{env}` |
| Env list | `artifacts/{client}/*/` | Grouped by client |
| Dashboard list per scope | `run_history.json` per scope | Already aggregated by `_rebuild_run_history()` |
| Latest run_id | First `status == "SUCCESS"` entry in `run_history.json` | Runs are sorted most-recent-first |
| Artifact types per dashboard | Latest successful run's `artifacts[].type` list | Already available in each run entry |

**No new data collection is needed.** The generator reads `run_history.json` files that the publisher already maintains. It adds one layer of aggregation across scopes.

---

## 5. Generation Strategy

**Recommendation: call `_rebuild_platform_manifest()` at the end of every `run()` call, immediately after `_rebuild_run_history()`.**

```
run(report_ts, env, dashboard, client)
  ├─ ... (query, assemble, validate, write artifacts)
  ├─ _rebuild_run_history(generated_at, client_id, env_id)  ← existing
  └─ _rebuild_platform_manifest(generated_at)               ← new
```

**Why after every `run()`:**

- The manifest reflects artifact state; `run()` changes artifact state
- Consistent with `_rebuild_run_history()` — same trigger, same placement
- Both rebuilds are idempotent (scan → validate → write)
- The cost is O(scopes) glob + O(runs) JSON reads — negligible for POC scale

**Why not alternatives:**

- *Bootstrap-only*: single `publisher run` wouldn't update the manifest
- *Separate CLI command*: adds operational burden; operators can forget to run it
- *Incremental update*: adds complexity; full rebuild is fast enough

---

## 6. Publisher Changes

### New function: `_rebuild_platform_manifest()`

Placed in `src/publisher/main.py` after `_rebuild_run_history()`, following the established pattern for rebuild helpers.

```python
def _rebuild_platform_manifest(generated_at: str) -> None:
    """Scan all scoped run_history.json files and rebuild artifacts/platform-manifest.json.

    Called at the end of every publisher run, after _rebuild_run_history().
    Reflects actual artifact presence on disk — not portal scopes config.

    Uses 2-wildcard glob (artifacts/{client}/{env}/current/run_history.json) to
    target only v1.2.0 scoped histories; root-level legacy files are excluded.
    """
    clients_map: dict[str, dict[str, list]] = {}

    pattern = os.path.join(ARTIFACTS_BASE_DIR, "*", "*", "current", "run_history.json")
    for history_path in sorted(glob.glob(pattern)):
        parts    = os.path.normpath(history_path).split(os.sep)
        env_id   = parts[-3]
        client_id = parts[-4]
        try:
            with open(history_path, encoding="utf-8") as f:
                hist = json.load(f)
            if not isinstance(hist.get("runs"), list):
                continue
        except (json.JSONDecodeError, OSError):
            continue  # skip malformed or unreadable histories

        # Collect latest successful run per dashboard (runs are sorted most-recent-first).
        seen: dict[str, dict] = {}
        for run in hist["runs"]:
            dashboard_id = run.get("dashboard_id")
            if not dashboard_id or run.get("status") != "SUCCESS":
                continue
            if dashboard_id not in seen:
                seen[dashboard_id] = {
                    "dashboard_id": dashboard_id,
                    "latest_run_id": run["run_id"],
                    "artifact_types": sorted(
                        a["type"] for a in run.get("artifacts", [])
                    ),
                }

        dashboards = sorted(seen.values(), key=lambda d: d["dashboard_id"])
        if client_id not in clients_map:
            clients_map[client_id] = {}
        clients_map[client_id][env_id] = dashboards

    clients = [
        {
            "client_id": cid,
            "envs": [
                {"env_id": eid, "dashboards": clients_map[cid][eid]}
                for eid in sorted(clients_map[cid])
            ],
        }
        for cid in sorted(clients_map)
    ]

    manifest = {
        "schema_version": "1.0.0",
        "generated_at":   generated_at,
        "clients":        clients,
    }

    manifest_path = os.path.join(ARTIFACTS_BASE_DIR, "platform-manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, sort_keys=True)

    scope_count = sum(len(clients_map[c]) for c in clients_map)
    print(f"  platform-manifest: {manifest_path} ({len(clients)} client(s), {scope_count} scope(s))")
```

### Modified: `run()` in `src/publisher/main.py`

Add one call at the end of `run()`:

```python
# 10. Rebuild run history index.
_rebuild_run_history(generated_at, client_id=client_id, env_id=env_id)

# 11. Rebuild global platform manifest.
# _rebuild_platform_manifest scans all scopes — idempotent and fast at POC scale.
_rebuild_platform_manifest(generated_at)
```

### No new module required for Phase 1

The function follows the same pattern as `_rebuild_run_history()` and belongs in `main.py`. If `main.py` grows significantly, extracting to `platform_manifest.py` is a clean future refactor.

---

## 7. Portal Integration

### Phase 1: generate without portal changes

The manifest is written to `artifacts/platform-manifest.json` and served at
`/platform-manifest.json` by Vite dev server (via `publicDir: ../artifacts`).
No portal changes are required in Phase 1.

### Phase 2 opportunities

| Integration | Description |
|-------------|-------------|
| Selector auto-discovery | Load `/platform-manifest.json` instead of static `scopes.js` — shows only bootstrapped scopes |
| Dashboard availability | Grey out or hide NavBar tabs for dashboards with no `latest_run_id` |
| Navigation safety | Prevent navigating to `/:client/:env/<dashboard>` when dashboard is not in manifest |
| Scope health indicator | Show last run timestamp in identity bar |

Phase 2 requires portal changes but no publisher changes — the manifest is already complete.

---

## 8. Failure Handling

| Scenario | Behavior |
|----------|---------|
| Scope has malformed `run_history.json` | Skip that scope with `continue`; other scopes still included |
| Dashboard has no successful runs | `seen` map is empty for that dashboard; it does not appear in that scope's dashboard list |
| Artifact types differ between runs | Only the latest successful run's types are included |
| `ARTIFACTS_BASE_DIR` scan returns zero results | `clients` is empty; manifest written with `"clients": []` — valid, not harmful |
| Write permission error | Exception propagates to `run()` caller; publisher exits non-zero (same as any other write failure) |

The manifest does not fail the publisher run — write failures are exceptional and would indicate a filesystem issue.

---

## 9. Performance Considerations

**Generation cost:** O(scopes × runs_in_history)

With current platform state:
- 2 scopes (default/local, contexture/local) → 2 glob matches → 2 file reads
- Each history has ≤ 10 run entries → negligible JSON parse time

With 100 scopes × 20 runs each: still O(milliseconds) — JSON reads from local filesystem or EFS.

No caching, no incremental logic needed at this scale.

---

## 10. Files to Create / Modify

### Modify

| File | Change |
|------|--------|
| `src/publisher/main.py` | Add `_rebuild_platform_manifest()` function; call it at end of `run()` |

### Unchanged

- `portal/src/config/scopes.js` — unchanged in Phase 1
- `docs/json-contracts.md` — may add a new section documenting the platform manifest schema
- All existing validators — unchanged
- `portal/` code — unchanged in Phase 1

---

## 11. Verification Plan

### Manual

```bash
# 1. Run a single dashboard
publisher run --env local --dashboard dlq_operations --client default

# Verify manifest is generated
cat artifacts/platform-manifest.json
# Expected: 1+ client entries; schema_version = "1.0.0"

# 2. Bootstrap a second scope
publisher bootstrap --client contexture --env local

# Verify manifest includes both scopes
python -c "
import json; m = json.load(open('artifacts/platform-manifest.json'))
print([c['client_id'] for c in m['clients']])
"
# Expected: ['contexture', 'default']

# 3. Verify dashboard entries
python -c "
import json; m = json.load(open('artifacts/platform-manifest.json'))
for c in m['clients']:
    for e in c['envs']:
        for d in e['dashboards']:
            print(c['client_id'], e['env_id'], d['dashboard_id'], d['latest_run_id'])
"
# Expected: 4 lines (2 clients × 2 dashboards)

# 4. Verify artifact_types are sorted alphabetically
# dlq_operations: ["exceptions", "summary", "top_sites", "trend_30d"]
# pipeline_health: ["failure_types", "summary"]

# 5. Portal serves it
# With npm run dev running: fetch /platform-manifest.json → should return JSON
```

### Failure scenario

```bash
# Temporarily corrupt a run_history.json
echo "not json" > artifacts/default/local/current/run_history.json

publisher run --env local --dashboard dlq_operations --client contexture
# Expected: platform-manifest.json updates with contexture/local entries
# default/local is skipped (malformed) but contexture/local still appears

# Restore
publisher bootstrap --client default --env local
```

### Build and test

```bash
cd portal && npm test    # 32 existing tests must still pass
cd portal && npm run build  # must exit 0
```

---

## 12. Non-Goals

| Excluded | Reason |
|----------|--------|
| Backend APIs for manifest query | Static hosting compatibility must be preserved |
| Authentication / permissions | No auth model in this POC |
| Live service discovery | Static artifact; not a live API |
| Modifying `run_history.json` | Additive only — existing contracts unchanged |
| Portal UI changes in Phase 1 | Manifest generated and available; portal reads it in Phase 2 |
| Scoped manifests | Redundant with global; adds complexity without benefit in Phase 1 |
| Schema validator | Phase 1 keeps manifest generation simple; add validator when schema stabilizes |

---

## 13. Future Extensions

| Extension | Description |
|-----------|-------------|
| Selector auto-discovery | Portal replaces `scopes.js` with a fetch of `platform-manifest.json` |
| Dashboard metadata | Add `label`, `description`, `enabled` fields from `dashboard.json` |
| Artifact lineage | Link to `run_history.json` path for each scope |
| Health rollup | Add `last_successful_run_at` per scope for monitoring |
| AI introspection | Feed manifest to AI tools for automated platform analysis |

None of these require publisher changes beyond what Phase 1 delivers.
