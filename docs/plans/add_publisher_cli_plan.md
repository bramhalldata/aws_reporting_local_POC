# Plan: Introduce Publisher CLI

## Context

The publisher was previously invoked as `python src/publisher/main.py`. This plan
introduces a stable CLI entry point — `publisher run --env local --dashboard dlq_operations`
— while keeping the existing direct invocation working as a backward-compatible fallback.
The design maps to the production pattern described in `docs/claude-startup-guide.md`:
`publisher --env prod --client acme_health`.

---

## Architecture Compliance

| Requirement | How it is met |
|-------------|--------------|
| Publisher remains deterministic | `report_ts` computed once before `run()` in CLI |
| Metric logic stays in SQL | `sql/athena_views.sql` and all validators unchanged |
| Artifact generation stays in publisher layer | `main.run()` logic unchanged; CLI is a thin wrapper |
| Local POC must still work | `python src/publisher/main.py` preserved as backward-compat fallback |
| Supports future per-client AWS deployment | `--env`, `--dashboard`, `--client` args on CLI; passed into `run()` |

---

## Impacted Layers

| Layer | Change |
|-------|--------|
| Publisher entry | NEW `src/publisher/cli.py` — argparse CLI, `run` subcommand |
| Project packaging | NEW `pyproject.toml` — installs `publisher` console script |
| Publisher pipeline | `src/publisher/main.py` — `run()` signature updated; `__main__` updated |
| Documentation | `README.md` — CLI install + run instructions; legacy path noted |
| SQL, validators, portal, artifacts | Unchanged |

---

## Files Changed

| File | Change |
|------|--------|
| `pyproject.toml` (new) | Project metadata + `publisher` console script entry point |
| `src/publisher/cli.py` (new) | argparse CLI with `run` subcommand |
| `src/publisher/main.py` | `run()` signature: adds `env`, `dashboard`, `client` kwargs |
| `README.md` | CLI invocation + `--env local` clarification; legacy path preserved |

---

## CLI Design

### Invocation (after `pip install -e .`)

```bash
publisher run --env local --dashboard dlq_operations
publisher run --env local --dashboard dlq_operations --client acme_health
```

### Arguments for `run`

| Argument | Required | Description |
|----------|----------|-------------|
| `--env` | Yes | Deployment environment (`local`, `prod`, …) |
| `--dashboard` | Yes | Dashboard to publish (`dlq_operations`, …) |
| `--client` | No | Client identifier for multi-client deployments |

Open strings (no `choices=`) — add new envs/dashboards without changing CLI code.

### `run()` signature in `src/publisher/main.py`

```python
def run(report_ts: str, *, env: str, dashboard: str, client: str | None = None) -> None:
```

`--env local` uses DuckDB + local Parquet. Future `env` values route to Athena + S3.

### `if __name__ == "__main__":` in `src/publisher/main.py`

```python
if __name__ == "__main__":
    report_ts = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    run(report_ts, env="local", dashboard="dlq_operations", client=None)
```

### `pyproject.toml`

```toml
[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"

[project]
name = "aws-reporting-publisher"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = ["duckdb>=0.10.0", "pyarrow>=14.0.0", "jsonschema>=4.21.0"]

[project.scripts]
publisher = "publisher.cli:main"

[tool.setuptools.packages.find]
where = ["src"]
```

---

## Migration Path

| Phase | Invocation | Notes |
|-------|-----------|-------|
| Before | `python src/publisher/main.py` | Still works; `__main__` passes `env="local"` etc. |
| After | `pip install -e .` then `publisher run --env local --dashboard dlq_operations` | Preferred |
| Production (future) | `publisher run --env prod --dashboard dlq_operations --client acme_health` | Routing added to `run()` |

---

## Verification Steps

1. `pip install -e .` — confirm `publisher` command registered
2. `publisher run --env local --dashboard dlq_operations` — exits 0; all artifacts written
3. Confirm header line: `publisher run  env=local  dashboard=dlq_operations  client=None`
4. `python src/publisher/main.py` — confirm legacy path still exits 0
5. `publisher --help` — shows `run` subcommand
6. `publisher run --help` — shows `--env`, `--dashboard`, `--client`
7. `publisher run --dashboard dlq_operations` (missing `--env`) — exits with argparse error
