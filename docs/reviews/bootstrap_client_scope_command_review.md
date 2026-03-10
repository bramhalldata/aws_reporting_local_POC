# Bootstrap Client Scope Command — Plan Review

**Feature:** Bootstrap Client Scope Command
**Plan artifact:** `docs/plans/bootstrap_client_scope_command_plan.md`
**Date:** 2026-03-10
**Reviewer:** Claude Code
**Recommendation:** APPROVED WITH TWO NOTES

---

## 1. Feature Summary

**Assessment: Correct and well-scoped.**

The framing is accurate — this is an orchestration loop over the existing single-run
pipeline, not a new pipeline. The scope is minimal: two files modified, two new
functions, no changes to existing behavior.

---

## 2. Source of Dashboard List — Filesystem Discovery

**Assessment: Correct choice. One implementation note.**

Filesystem discovery (`os.listdir(DASHBOARDS_DIR)` filtered to subdirs containing
`dashboard.json`) is the right approach. It avoids introducing a third place to
register dashboards and naturally stays in sync with `load_dashboard_config()` —
the existing function that already reads from `DASHBOARDS_DIR`.

**Behavior when a discovered dashboard has no if/elif branch in `run()`:**

`run()` will call `sys.exit(1)` with "No artifact assembler for dashboard '{id}'".
Bootstrap catches `SystemExit`, marks it as failed, and continues. This is correct
— the operator sees the gap immediately and can add the assembler.

**Note 1 — `sorted()` on `os.listdir()`:**

The plan uses `for name in sorted(os.listdir(DASHBOARDS_DIR))`, which gives
alphabetical order: `["dlq_operations", "pipeline_health"]`. This is correct and
deterministic across OS. No concern.

**No concerns on discovery logic.**

---

## 3. Shared `report_ts` / `run_id`

**Assessment: Correct choice.**

A shared `report_ts` is the right call for a bootstrap command. The reasons are
sound:

- SQL metric windows are anchored to the same instant — metrics across dashboards
  are comparable
- All dashboards appear as a coherent group in `run_history.json` under the same
  `run_id`
- The existing `run(report_ts, ...)` signature accepts `report_ts` as a positional
  argument, so bootstrap just generates it once and passes the same value to each
  call — no change to `run()` needed

**Verify that the artifact path supports multiple dashboards per `run_id`:**

```
artifacts/{client}/{env}/runs/{run_id}/{dashboard_id}/
```

Yes — `run_id` is a directory; `dashboard_id` is a subdirectory within it. Multiple
dashboards coexist correctly under one `run_id`. Confirmed from path structure in
`main.py:358`.

**No concerns.**

---

## 4. CLI Design — New Subcommand

**Assessment: Correct. `bootstrap` as a subcommand is the right pattern.**

The existing CLI uses `argparse` subparsers (`run_cmd = sub.add_parser("run", ...)`).
Adding `bootstrap_cmd = sub.add_parser("bootstrap", ...)` follows the same pattern
cleanly.

Defaulting `--env` to `"local"` in the bootstrap subcommand is appropriate:
bootstrap is primarily a dev/demo tool. The `run` subcommand leaves `--env` required
(correct for explicit single-run use). Different defaults for different commands is
fine.

**No concerns.**

---

## 5. Execution Flow

**Assessment: Correct. One detail to verify.**

The loop structure is clean:
```
generate report_ts → discover → for each: try run() / except SystemExit → summary
```

**The `SystemExit` catch:**

`run()` calls `sys.exit(1)` on failures. In Python, `sys.exit(n)` raises
`SystemExit(n)`, which is catchable. The plan's `try/except SystemExit` is correct.

**Note 2 — stderr output from failed `run()` is still printed:**

When `run()` calls `sys.exit(1)`, it first prints an error to `sys.stderr`. This
output will appear interleaved with bootstrap's stdout output. This is acceptable
for Phase 1 — the operator sees the error reason inline. If cleaner separation is
desired in a future phase, `run()` could raise a custom exception instead of
calling `sys.exit()`, but that refactoring is out of scope here.

**The repeated `_rebuild_run_history()` call:**

`run()` calls `_rebuild_run_history()` at the end. In a 2-dashboard bootstrap, this
runs twice. Both calls are idempotent (they scan the same `runs/` directory). The
second call produces the canonical final state. This is correct behavior for Phase 1.
The plan correctly identifies this as a future optimization, not a current problem.

**No blocking concerns.**

---

## 6. Failure Handling — Continue and Summarize

**Assessment: Correct approach for this use case.**

Continue-and-summarize is the right choice for a bootstrap command:
- Successfully generated dashboards have valid artifacts and are immediately usable
- A single failure (e.g., a new unimplemented dashboard) doesn't block the rest
- The operator sees the full picture and knows exactly which dashboard to re-run

The re-run suggestion at the end of failure output is a good addition:
```
publisher run --client contexture --env local --dashboard pipeline_health
```
This is immediately actionable.

Exit code behavior (0 = all success, 1 = any failure) is correct.

**No concerns.**

---

## 7. Output Summary Format

**Assessment: Adequate for Phase 1.**

The proposed output format is clear and readable. The per-dashboard ✓/✗ markers,
the `run_id`, scope, and history path are the right elements to display.

One minor observation: the `run()` function also prints output for each dashboard
run (`"Publisher complete."`, artifact paths, etc.). This output will appear inline
within the bootstrap output, between the `[i/N]` header lines. For Phase 1 this is
fine — verbose output is useful during onboarding. A future phase could add a
`--quiet` flag to suppress per-dashboard output.

**No concerns.**

---

## 8. Files to Modify

**Assessment: Minimal and correct.**

Two files: `main.py` and `cli.py`. No other files touched. The proposed code for
both files is consistent with the existing patterns in each file.

**`discover_dashboards()`** placement: after `_rebuild_run_history()`, before
`run()` — correct. It's a standalone helper that `bootstrap()` depends on.

**`bootstrap()`** placement: after `discover_dashboards()`, before `run()` — correct.

**`cli.py` additions**: the `bootstrap_cmd` subparser and `elif args.command == "bootstrap"`
handler follow the exact pattern of the existing `run_cmd` block.

**No concerns.**

---

## 9. Verification Plan

**Assessment: Adequate. Covers the key cases.**

The 5 manual test cases cover:
- Happy path for default scope
- New scope creation (no prior artifacts)
- `run_history.json` grouping verification
- Portal navigation after bootstrap
- Idempotency (re-run adds new entries without corrupting history)

The failure behavior test (temporarily renaming `dashboard.json`) is a realistic
simulation of a missing assembler. The scope isolation test with `alpha/prod` and
`beta/prod` confirms the client/env scoping is correct.

**Missing test case:** The plan does not test bootstrapping when `DASHBOARDS_DIR`
itself does not exist (e.g., running from a wrong working directory). This is a
startup failure, not a per-dashboard failure, and `os.listdir()` will raise
`FileNotFoundError` rather than `SystemExit`. For Phase 1 this is acceptable —
the existing `run()` function has the same vulnerability (it calls
`load_dashboard_config()` which also reads from `DASHBOARDS_DIR`). Not blocking.

---

## 10. Non-Goals

**Assessment: Correct and well-bounded.**

The exclusions are appropriate. Parallel execution, selective dashboard lists,
dry-run mode, and backend API are all reasonable Phase 2+ concerns. The Phase 1
footprint stays small.

---

## Summary Assessment

| Section | Status |
|---------|--------|
| Feature framing | ✓ Correct — thin wrapper over existing run() |
| Dashboard list source | ✓ Filesystem discovery; no duplicate list |
| Shared report_ts | ✓ Correct; shared run_id groups entries cleanly |
| CLI design | ✓ New subcommand; consistent with existing pattern |
| Execution flow | ✓ Correct; SystemExit catch is valid Python |
| Failure handling | ✓ Continue-and-summarize; exit code correct |
| Output format | ✓ Adequate for Phase 1 |
| Files to modify | ✓ Minimal (2 files) |
| Verification | ✓ Adequate; one minor gap (DASHBOARDS_DIR missing) |
| Non-goals | ✓ Appropriate Phase 1 boundaries |

**Recommendation: APPROVED WITH TWO NOTES**

The plan is sound, minimal, and architecturally correct. Proceed to implementation
with these notes:

1. **`stderr` interleaving:** Per-dashboard error messages from `run()` will appear
   inline in bootstrap output. This is acceptable for Phase 1. No action required.

2. **`_rebuild_run_history()` called N times:** With 2 dashboards this is a
   non-issue. Document this in a comment in `bootstrap()` so a future implementor
   knows where to add the optimization if needed. A one-line comment is sufficient.
