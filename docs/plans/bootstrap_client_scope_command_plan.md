# Bootstrap Client Scope Command — Implementation Plan

**Feature:** Bootstrap Client Scope Command
**Output artifact:** `docs/plans/bootstrap_client_scope_command_plan.md`
**Date:** 2026-03-10
**Status:** Draft — pending review

---

## Context

The publisher generates artifacts for one dashboard per invocation:

```
publisher run --env local --dashboard dlq_operations --client contexture
publisher run --env local --dashboard pipeline_health --client contexture
```

Onboarding a new client/env scope requires N separate commands — one per dashboard.
For demos and development, this creates unnecessary friction. A single bootstrap
command should initialize an entire scope in one step.

---

## 1. Feature Summary

Add a `bootstrap` subcommand to the publisher CLI that initializes a full
client/env scope by running all supported dashboards in sequence under a shared
`report_ts`.

```
publisher bootstrap --client contexture --env local
```

This command:
- discovers all supported dashboards automatically
- runs each through the existing `run()` pipeline
- shares a single `report_ts` / `run_id` across all dashboards
- produces a valid `run_history.json` for the scope
- reports per-dashboard status and a final summary

The bootstrap command is a **thin orchestration loop** over the existing single-run
pipeline. It adds no new artifact logic, no new schema, and no new data flow.

---

## 2. Scope

### Phase 1 does

- Add a `bootstrap` subcommand to `cli.py`
- Add a `bootstrap()` function and a `discover_dashboards()` helper to `main.py`
- Generate current and historical artifacts for all discovered dashboards
- Produce a valid `run_history.json` for the target scope
- Continue past a failing dashboard and report a summary at the end

### Phase 1 does not

- Change existing `run()` behavior in any way
- Add a scheduler or periodic runner
- Support running multiple scopes in one command
- Support selective dashboard lists (all or nothing in Phase 1)
- Add parallelism (sequential is fine for a POC with 2 dashboards)

---

## 3. Source of Dashboard List

**Recommendation: filesystem discovery of the `dashboards/` directory.**

```python
def discover_dashboards() -> list[str]:
    """Return sorted list of dashboard IDs found in DASHBOARDS_DIR.
    A valid dashboard directory contains a dashboard.json config file.
    """
    ids = []
    for name in sorted(os.listdir(DASHBOARDS_DIR)):
        config_path = os.path.join(DASHBOARDS_DIR, name, "dashboard.json")
        if os.path.isfile(config_path):
            ids.append(name)
    return ids
```

**Why filesystem discovery:**

- `DASHBOARDS_DIR` is already the canonical source for dashboard configs — it is
  what `load_dashboard_config()` reads from
- Adding a new dashboard requires adding `dashboards/<id>/dashboard.json` — the
  bootstrap command picks it up automatically with no second list to maintain
- Avoids introducing `SUPPORTED_DASHBOARDS = ["dlq_operations", "pipeline_health"]`
  as a third place to register dashboards (the other two being `dashboards/` and
  the if/elif branches in `run()`)
- If an undiscovered dashboard exists and the if/elif branch in `run()` doesn't
  handle it yet, `run()` exits with "No artifact assembler for dashboard" and
  bootstrap captures that as a per-dashboard failure — the right behavior

**Sort order:** alphabetical by `dashboard_id`. Consistent across OS; no dependency
on filesystem ordering.

---

## 4. Shared vs Separate run_id / report_ts

**Recommendation: one shared `report_ts` for all dashboards in the bootstrap run.**

The existing `run()` function derives `run_id` from `report_ts`:

```python
run_id = re.sub(r"[^a-zA-Z0-9]", "", report_ts)
# "2026-03-10T14:00:00Z" → "20260310T140000Z"
```

The artifact path is `artifacts/{client}/{env}/runs/{run_id}/{dashboard_id}/` —
multiple dashboards can coexist under the same `run_id` directory.

**Benefits of one shared `report_ts`:**

- All dashboards produce the same `run_id` — they appear as a coherent group in
  `run_history.json`, sorted together (same run_id, ascending dashboard_id)
- SQL metric windows (`{report_ts}` placeholder in SQL) are anchored to the same
  instant — metrics across dashboards are comparable
- Easier to audit: "these five entries all came from one bootstrap at 14:00:00"

**If independent:**

- Each `run()` call generates its own `report_ts` (subsecond differences if run
  on the same machine)
- `run_id` values differ by 1–2 seconds — run_history entries don't group cleanly
- SQL windows are anchored to slightly different instants

**Implementation:** `bootstrap()` generates `report_ts` once before the loop and
passes it to each `run(report_ts, ...)` call. The existing `run()` signature
already accepts `report_ts` as the first positional argument — zero change needed.

---

## 5. CLI Design

### Command shape

```
publisher bootstrap [--client CLIENT] [--env ENV]
```

Both flags are optional and default to `"default"` / `"local"` (matching the
existing `run` subcommand behavior where `--client` defaults to `None` → `"default"`
and where `--env local` is the standard dev invocation).

### Full invocation examples

```bash
# Default scope (development)
publisher bootstrap

# Named client, default env
publisher bootstrap --client contexture

# Named client and env
publisher bootstrap --client contexture --env prod
```

### Rationale for a new subcommand (not a flag on `run`)

The codebase already uses argparse subparsers. A new `bootstrap` subcommand:
- is readable and self-documenting (`publisher run` vs `publisher bootstrap`)
- separates "run one dashboard" from "initialize a full scope"
- keeps `run`'s required `--dashboard` flag without carving out a special case

---

## 6. Execution Flow

```
bootstrap(client, env)
  ├─ Compute report_ts (once — shared by all dashboards)
  ├─ Discover dashboards: discover_dashboards() → ["dlq_operations", "pipeline_health"]
  ├─ Print: "Bootstrapping scope {client}/{env} — {N} dashboards"
  │
  ├─ For each dashboard_id in discovered order:
  │   ├─ Print: "  [{i}/{N}] Running {dashboard_id} ..."
  │   ├─ try:
  │   │   run(report_ts, env=env, dashboard=dashboard_id, client=client)
  │   │   results.append((dashboard_id, "SUCCESS", None))
  │   └─ except SystemExit as exc:
  │       results.append((dashboard_id, "FAILED", exc.code))
  │       (continue to next dashboard)
  │
  └─ Print summary (see §8)
      └─ sys.exit(1) if any dashboard failed, else sys.exit(0)
```

**Note on `_rebuild_run_history()`:** Each `run()` call already invokes
`_rebuild_run_history()` at its end. For a bootstrap with N dashboards this
means N rebuilds. All rebuilds are idempotent — each scans the same `runs/`
directory and produces the same correct output. For Phase 1 with 2 dashboards
the overhead is negligible. A future optimization would add a
`skip_history_rebuild` flag to `run()` and call `_rebuild_run_history()` once
after the loop, but this is not needed in Phase 1.

---

## 7. Failure Handling

**Recommendation: continue and summarize.**

The `run()` function calls `sys.exit(1)` on any hard failure (missing Parquet,
schema validation error, unknown dashboard). `SystemExit` is catchable in Python.
Bootstrap wraps each `run()` call in `try/except SystemExit` and records the
outcome without terminating.

**Why continue-and-summarize:**

- Partial results are valid — successfully generated dashboards have correct,
  validated artifacts and are visible in `run_history.json`
- A single failing dashboard (e.g., an unimplemented new dashboard) should not
  block all other dashboards from being bootstrapped
- The operator sees the complete picture in one run — easy to diagnose and re-run
  the failing dashboard alone with `publisher run`

**Exit behavior:**

- Exit 0 if all dashboards succeeded
- Exit 1 if one or more dashboards failed
- Per-dashboard failure reason is printed (the exit code from `sys.exit()` in
  `run()` carries the reason implicitly; stderr output from `run()` provides
  the human-readable error message)

---

## 8. Output Summary

After all dashboards complete:

```
Bootstrap complete — 2/2 dashboards succeeded.
  ✓ dlq_operations
  ✓ pipeline_health

  run_id  : 20260310T140000Z
  scope   : contexture/local
  history : artifacts/contexture/local/current/run_history.json
```

On partial failure:

```
Bootstrap complete — 1/2 dashboards succeeded.
  ✓ dlq_operations
  ✗ pipeline_health  (exit code 1)

  run_id  : 20260310T140000Z
  scope   : contexture/local
  history : artifacts/contexture/local/current/run_history.json

1 dashboard(s) failed. Re-run individually with:
  publisher run --client contexture --env local --dashboard pipeline_health
```

---

## 9. Files to Modify

### `src/publisher/main.py`

Add two functions after the existing `_rebuild_run_history()` block and before
the `run()` function:

```python
def discover_dashboards() -> list[str]:
    """Return sorted list of dashboard IDs found in DASHBOARDS_DIR.
    A valid dashboard directory contains a dashboard.json config file.
    """
    ids = []
    for name in sorted(os.listdir(DASHBOARDS_DIR)):
        config_path = os.path.join(DASHBOARDS_DIR, name, "dashboard.json")
        if os.path.isfile(config_path):
            ids.append(name)
    return ids


def bootstrap(*, env: str, client: str | None = None) -> None:
    """Initialize a full client/env scope by running all supported dashboards.

    Uses a shared report_ts so all dashboards land in the same run_id bucket.
    Continues past individual failures and prints a summary at the end.
    Exits 0 if all dashboards succeeded, 1 if any failed.
    """
    client_id = client or "default"
    env_id    = env

    report_ts = (
        datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )
    run_id = re.sub(r"[^a-zA-Z0-9]", "", report_ts)

    dashboards_list = discover_dashboards()
    n = len(dashboards_list)
    print(f"Bootstrapping scope {client_id}/{env_id} — {n} dashboard(s)  run_id={run_id}")

    results = []
    for i, dashboard_id in enumerate(dashboards_list, start=1):
        print(f"  [{i}/{n}] {dashboard_id} ...")
        try:
            run(report_ts, env=env_id, dashboard=dashboard_id, client=client_id)
            results.append((dashboard_id, True))
        except SystemExit:
            results.append((dashboard_id, False))

    # Summary
    succeeded = sum(1 for _, ok in results if ok)
    failed    = n - succeeded
    print(f"\nBootstrap complete — {succeeded}/{n} dashboard(s) succeeded.")
    for dashboard_id, ok in results:
        mark = "✓" if ok else "✗"
        print(f"  {mark} {dashboard_id}")

    history_path = os.path.join(
        ARTIFACTS_BASE_DIR, client_id, env_id, "current", "run_history.json"
    )
    print(f"\n  run_id  : {run_id}")
    print(f"  scope   : {client_id}/{env_id}")
    print(f"  history : {history_path}")

    if failed:
        print(f"\n{failed} dashboard(s) failed. Re-run individually with:")
        for dashboard_id, ok in results:
            if not ok:
                print(f"  publisher run --client {client_id} --env {env_id} --dashboard {dashboard_id}")
        sys.exit(1)
```

### `src/publisher/cli.py`

Add a `bootstrap` subparser alongside the existing `run` subparser:

```python
bootstrap_cmd = sub.add_parser("bootstrap", help="Initialize a full client/env scope")
bootstrap_cmd.add_argument(
    "--env",
    default="local",
    help="Deployment environment (default: local)",
)
bootstrap_cmd.add_argument(
    "--client",
    default=None,
    help="Client identifier (default: default)",
)
```

Add handling in the `if args.command` block:

```python
elif args.command == "bootstrap":
    publisher_main.bootstrap(env=args.env, client=args.client)
```

### Unchanged

- `run()` function — no changes
- `_rebuild_run_history()` — no changes
- All validators
- All dashboard configs
- Portal code

---

## 10. Verification Plan

### Manual

```bash
# 1. Bootstrap the default scope
publisher bootstrap --client default --env local
# Expected: 2/2 succeeded; run_history.json written; portal loads at /default/local/...

# 2. Bootstrap a new scope (no prior artifacts)
publisher bootstrap --client contexture --env local
# Expected: 2/2 succeeded; artifacts/contexture/local/ created;
#           run_history.json has 2 entries with same run_id

# 3. Verify run_history.json groups both dashboards under one run_id
cat artifacts/contexture/local/current/run_history.json
# Expected: 2 entries; same run_id; dashboard_id: dlq_operations and pipeline_health

# 4. Portal navigation
# Open http://localhost:5173/contexture/local/dlq_operations
# Expected: dashboard loads normally

# 5. Re-run to verify idempotency (run_history grows correctly)
publisher bootstrap --client contexture --env local
# Expected: 4 entries in run_history.json (2 runs × 2 dashboards); new run_id differs
```

### Failure behavior

```bash
# Temporarily rename a dashboard config to trigger failure
mv dashboards/pipeline_health/dashboard.json dashboards/pipeline_health/dashboard.json.bak
publisher bootstrap --client test --env local
# Expected: 1/2 succeeded; dlq_operations succeeds; pipeline_health fails;
#           exit code 1; re-run suggestion printed
mv dashboards/pipeline_health/dashboard.json.bak dashboards/pipeline_health/dashboard.json
```

### Scope isolation

```bash
publisher bootstrap --client alpha --env prod
publisher bootstrap --client beta --env prod
# Expected: artifacts/alpha/prod/ and artifacts/beta/prod/ are independent;
#           each has its own run_history.json; no cross-contamination
```

### Build / test

```bash
# Publisher tests (if/when a test suite exists)
cd portal && npm test
# Must still pass — portal code is unchanged
```

---

## 11. Non-Goals

| Excluded | Reason |
|----------|--------|
| Scheduler / cron integration | Phase 1 is a one-shot CLI command |
| Running multiple scopes in one command | Out of scope; call bootstrap per scope |
| Parallel dashboard execution | Sequential is correct for POC; 2 dashboards completes in < 2s |
| Dynamic client metadata service | Phase 1 uses explicit `--client` flag |
| Permission / auth gating | No auth model in this POC |
| Selective dashboard lists (`--dashboards dlq,pipeline`) | Phase 1 runs all or nothing |
| Dry-run mode | Not needed for Phase 1 |
| Backend REST API for triggering bootstrap | CLI only in Phase 1 |
