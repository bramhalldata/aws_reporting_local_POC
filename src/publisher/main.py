"""
main.py — dlq_operations Publisher

Implements the publisher layer of the reporting pipeline.

Pipeline:
  Parquet (data/parquet/) → DuckDB (sql/athena_views.sql) → JSON artifacts (artifacts/)

Architecture rules enforced here:
  - Metrics are defined in sql/athena_views.sql, not in this file.
  - This file only executes queries, assembles results, validates, and writes.
  - report_ts and generated_at are each computed once and shared across all artifacts.

In production, this service runs in ECS/Fargate, queries AWS Athena, and writes to S3.

Run: python src/publisher/main.py
"""

import glob
import json
import os
import re
import shutil
import sys
from datetime import datetime, timezone

# Ensure the 'validators' subpackage resolves whether main.py is run directly
# (python src/publisher/main.py) or imported as part of the installed package.
_publisher_dir = os.path.dirname(os.path.abspath(__file__))
if _publisher_dir not in sys.path:
    sys.path.insert(0, _publisher_dir)

import duckdb
import jsonschema

from validators import (
    exceptions_schema,
    manifest_schema,
    pipeline_health_failure_types_schema,
    pipeline_health_summary_schema,
    run_history_schema,
    summary_schema,
    top_sites_schema,
    trend_30d_schema,
)

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PARQUET_PATH = os.path.join(REPO_ROOT, "data", "parquet", "ccd_failures.parquet")
SQL_PATH = os.path.join(REPO_ROOT, "sql", "athena_views.sql")
DASHBOARDS_DIR = os.path.join(REPO_ROOT, "dashboards")
ARTIFACTS_BASE_DIR = os.path.join(REPO_ROOT, "artifacts")

SCHEMA_VERSION = "1.2.0"

# ---------------------------------------------------------------------------
# SQL parsing
# ---------------------------------------------------------------------------

def parse_sql_blocks(sql_text: str) -> dict[str, str]:
    """Extract named query blocks from the SQL file.

    Blocks are delimited by:
        -- [block_name]
        ... SQL ...
        -- [end]
    """
    pattern = re.compile(
        r"--\s*\[(?P<name>\w+)\]\s*\n(?P<body>.*?)--\s*\[end\]",
        re.DOTALL,
    )
    blocks = {}
    for match in pattern.finditer(sql_text):
        name = match.group("name").strip()
        body = match.group("body").strip()
        if name != "end":
            blocks[name] = body
    return blocks


def load_dashboard_config(dashboard_id: str) -> dict:
    """Load and return the dashboard config from dashboards/<dashboard_id>/dashboard.json."""
    config_path = os.path.join(DASHBOARDS_DIR, dashboard_id, "dashboard.json")
    if not os.path.exists(config_path):
        print(f"ERROR: Dashboard config not found: {config_path}", file=sys.stderr)
        sys.exit(1)
    with open(config_path, encoding="utf-8") as f:
        return json.load(f)


def validate_required_blocks(blocks: dict[str, str], required_blocks: set[str]) -> None:
    """Fail fast if any required SQL block is missing."""
    missing = required_blocks - blocks.keys()
    if missing:
        missing_list = ", ".join(sorted(missing))
        print(f"ERROR: Missing required SQL blocks in {SQL_PATH}: {missing_list}", file=sys.stderr)
        sys.exit(1)


# ---------------------------------------------------------------------------
# Run history index
# ---------------------------------------------------------------------------

def _rebuild_run_history(generated_at: str, *, client_id: str, env_id: str) -> None:
    """Scan artifacts/{client_id}/{env_id}/runs/ and rebuild run_history.json.

    Called at the end of every successful publisher run. Reads all manifest.json
    files under the scoped runs directory, assembles a sorted list of run entries,
    validates against run_history_schema, and writes to the scoped current/ directory.

    On validation failure, logs a warning and returns without writing — dashboard
    artifacts are already committed at this point and should not be invalidated.
    """
    runs = []
    runs_dir = os.path.join(ARTIFACTS_BASE_DIR, client_id, env_id, "runs")
    pattern = os.path.join(runs_dir, "*", "*", "manifest.json")
    for manifest_path in sorted(glob.glob(pattern)):
        try:
            with open(manifest_path, encoding="utf-8") as f:
                m = json.load(f)
            # Extract dashboard_id from path: runs/<run_id>/<dashboard_id>/manifest.json
            parts = os.path.normpath(manifest_path).split(os.sep)
            dashboard_id = parts[-2]
            # Enrich bare artifact filenames (from manifest) into structured objects.
            # type is derived by stripping .json — a future phase may define it explicitly
            # in dashboard.json if a richer taxonomy is needed.
            artifact_objects = [
                {
                    "name": filename,
                    "type": filename.replace(".json", ""),
                    "path": f"{client_id}/{env_id}/runs/{m['run_id']}/{dashboard_id}/{filename}",
                }
                for filename in m["artifacts"]
            ]
            runs.append({
                "run_id":         m["run_id"],
                "dashboard_id":   dashboard_id,
                "report_ts":      m["report_ts"],
                "generated_at":   m["generated_at"],
                "status":         m["status"],
                "artifacts":      artifact_objects,
                "schema_version": m["schema_version"],
            })
        except (KeyError, json.JSONDecodeError):
            pass  # Skip malformed or incomplete manifests

    # Sort: run_id descending (most recent first); within same run_id, dashboard_id ascending.
    # Two-sort approach: stable sort on secondary key first, then primary key descending.
    runs.sort(key=lambda r: r["dashboard_id"])
    runs.sort(key=lambda r: r["run_id"], reverse=True)

    run_history = {
        "schema_version": "1.2.0",
        "client_id":      client_id,
        "env_id":         env_id,
        "generated_at":   generated_at,
        "runs":           runs,
    }

    try:
        run_history_schema.validate(run_history)
    except jsonschema.ValidationError as exc:
        print(
            f"WARNING: run_history.json schema validation failed — history not updated: {exc.message}",
            file=sys.stderr,
        )
        return

    current_dir = os.path.join(ARTIFACTS_BASE_DIR, client_id, env_id, "current")
    os.makedirs(current_dir, exist_ok=True)
    history_path = os.path.join(current_dir, "run_history.json")
    with open(history_path, "w", encoding="utf-8") as f:
        json.dump(run_history, f, indent=2, sort_keys=True)

    print(f"  history        : {history_path} ({len(runs)} entries)")


# ---------------------------------------------------------------------------
# Publisher pipeline
# ---------------------------------------------------------------------------

def run(report_ts: str, *, env: str, dashboard: str, client: str | None = None) -> None:
    """Execute the full publish pipeline.

    Args:
        report_ts:  ISO-8601 UTC timestamp anchoring all SQL metric windows.
        env:        Deployment environment (e.g. 'local', 'prod').
                    'local' uses DuckDB + local Parquet (POC stack).
                    Future values will route to Athena + S3.
        dashboard:  Dashboard identifier to publish (e.g. 'dlq_operations').
        client:     Optional client identifier for multi-client deployments.
    """
    client_id = client or "default"
    env_id    = env
    artifacts_runs_dir    = os.path.join(ARTIFACTS_BASE_DIR, client_id, env_id, "runs")
    artifacts_current_dir = os.path.join(ARTIFACTS_BASE_DIR, client_id, env_id, "current")

    print(f"publisher run  env={env_id}  dashboard={dashboard}  client={client_id}")

    # 1. Load dashboard configuration
    config = load_dashboard_config(dashboard)
    required_blocks = set(config["sql_blocks"])
    artifact_list = config["artifacts"]  # drives manifest and current/ copy

    # 2. Validate Parquet source exists
    if not os.path.exists(PARQUET_PATH):
        print(
            f"ERROR: Parquet file not found: {PARQUET_PATH}\n"
            "Run: python data/generate_fixtures.py",
            file=sys.stderr,
        )
        sys.exit(1)

    # 3. Read and parse SQL
    with open(SQL_PATH, encoding="utf-8") as f:
        raw_sql = f.read()

    sql_with_ts = raw_sql.replace("{report_ts}", report_ts)
    blocks = parse_sql_blocks(sql_with_ts)
    validate_required_blocks(blocks, required_blocks)

    # 4. Connect DuckDB in-memory and register Parquet table
    con = duckdb.connect(database=":memory:")
    con.execute(f"CREATE TABLE ccd_failures AS SELECT * FROM read_parquet('{PARQUET_PATH}')")

    # generated_at is fixed once here; every artifact payload uses this same value.
    generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()

    # 5. Execute metric queries and assemble artifacts (dashboard-specific).
    #    Each branch produces artifacts_to_write: {filename: payload}.
    #    All metric logic lives in the SQL file; this code only transforms rows.
    if dashboard == "dlq_operations":
        failures_24h = con.execute(blocks["failures_last_24h"]).fetchone()[0]
        failures_7d = con.execute(blocks["failures_last_7d"]).fetchone()[0]

        top_sites_7d_rows = con.execute(blocks["top_sites_by_failures"]).fetchall()
        top_sites_7d = [{"site": row[0], "failures": row[1]} for row in top_sites_7d_rows]

        trend_rows = con.execute(blocks["trend_30d"]).fetchall()
        trend_days = [{"date": str(row[0]), "failures": int(row[1])} for row in trend_rows]

        top_sites_30d_rows = con.execute(blocks["top_sites_30d"]).fetchall()
        top_sites_30d = [{"site": row[0], "failures": row[1]} for row in top_sites_30d_rows]

        exceptions_rows = con.execute(blocks["exceptions_7d"]).fetchall()
        exceptions = [{"failure_type": row[0], "count": row[1]} for row in exceptions_rows]

        summary = {
            "schema_version": SCHEMA_VERSION,
            "generated_at": generated_at,
            "report_ts": report_ts,
            "failures_last_24h": int(failures_24h),
            "failures_last_7d": int(failures_7d),
            "top_sites": top_sites_7d,
        }
        try:
            summary_schema.validate(summary)
        except jsonschema.ValidationError as exc:
            print(f"ERROR: summary.json schema validation failed: {exc.message}", file=sys.stderr)
            sys.exit(1)

        trend_30d = {
            "schema_version": SCHEMA_VERSION,
            "generated_at": generated_at,
            "report_ts": report_ts,
            "days": trend_days,
        }
        try:
            trend_30d_schema.validate(trend_30d)
        except jsonschema.ValidationError as exc:
            print(f"ERROR: trend_30d.json schema validation failed: {exc.message}", file=sys.stderr)
            sys.exit(1)

        top_sites = {
            "schema_version": SCHEMA_VERSION,
            "generated_at": generated_at,
            "report_ts": report_ts,
            "window_days": 30,
            "sites": top_sites_30d,
        }
        try:
            top_sites_schema.validate(top_sites)
        except jsonschema.ValidationError as exc:
            print(f"ERROR: top_sites.json schema validation failed: {exc.message}", file=sys.stderr)
            sys.exit(1)

        exceptions_artifact = {
            "schema_version": SCHEMA_VERSION,
            "generated_at": generated_at,
            "report_ts": report_ts,
            "window_days": 7,
            "exceptions": exceptions,
        }
        try:
            exceptions_schema.validate(exceptions_artifact)
        except jsonschema.ValidationError as exc:
            print(f"ERROR: exceptions.json schema validation failed: {exc.message}", file=sys.stderr)
            sys.exit(1)

        artifacts_to_write = {
            "summary.json":    summary,
            "trend_30d.json":  trend_30d,
            "top_sites.json":  top_sites,
            "exceptions.json": exceptions_artifact,
        }

    elif dashboard == "pipeline_health":
        total_docs   = con.execute(blocks["pipeline_docs_24h"]).fetchone()[0]
        active_sites = con.execute(blocks["pipeline_active_sites_24h"]).fetchone()[0]
        latest_event = con.execute(blocks["pipeline_latest_event"]).fetchone()[0]
        ft_rows      = con.execute(blocks["pipeline_failures_by_type_24h"]).fetchall()
        failure_types_list = [{"failure_type": r[0], "count": r[1]} for r in ft_rows]

        ph_summary = {
            "schema_version": SCHEMA_VERSION,
            "generated_at": generated_at,
            "report_ts": report_ts,
            "total_documents_last_24h": int(total_docs),
            "active_sites_last_24h": int(active_sites),
            "latest_event_timestamp": str(latest_event),
        }
        try:
            pipeline_health_summary_schema.validate(ph_summary)
        except jsonschema.ValidationError as exc:
            print(f"ERROR: summary.json schema validation failed: {exc.message}", file=sys.stderr)
            sys.exit(1)

        ph_failure_types = {
            "schema_version": SCHEMA_VERSION,
            "generated_at": generated_at,
            "report_ts": report_ts,
            "window_days": 1,
            "failure_types": failure_types_list,
        }
        try:
            pipeline_health_failure_types_schema.validate(ph_failure_types)
        except jsonschema.ValidationError as exc:
            print(f"ERROR: failure_types.json schema validation failed: {exc.message}", file=sys.stderr)
            sys.exit(1)

        artifacts_to_write = {
            "summary.json":       ph_summary,
            "failure_types.json": ph_failure_types,
        }

    else:
        print(f"ERROR: No artifact assembler for dashboard '{dashboard}'", file=sys.stderr)
        sys.exit(1)

    con.close()

    # Derive run_id from report_ts — strip non-alphanumeric characters.
    # e.g. "2026-03-07T22:49:59Z" → "20260307T224959Z"
    run_id = re.sub(r"[^a-zA-Z0-9]", "", report_ts)
    run_dir = os.path.join(artifacts_runs_dir, run_id, dashboard)
    current_dir = os.path.join(artifacts_current_dir, dashboard)

    # 6. Build and validate manifest.json (artifact list sourced from dashboard config)
    manifest = {
        "schema_version": SCHEMA_VERSION,
        "run_id": run_id,
        "generated_at": generated_at,
        "report_ts": report_ts,
        "status": "SUCCESS",
        "artifacts": artifact_list,
    }
    try:
        manifest_schema.validate(manifest)
    except jsonschema.ValidationError as exc:
        print(f"ERROR: manifest.json schema validation failed: {exc.message}", file=sys.stderr)
        sys.exit(1)

    # 7. Write artifacts to the versioned run folder (payload artifacts first, manifest last).
    os.makedirs(run_dir, exist_ok=True)

    def write_artifact(filename: str, payload: dict) -> None:
        path = os.path.join(run_dir, filename)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, sort_keys=True)

    for filename, payload in artifacts_to_write.items():
        write_artifact(filename, payload)
    write_artifact("manifest.json", manifest)

    # 8. Copy run folder to artifacts/current/<dashboard>/ so the portal reads stable URLs.
    os.makedirs(current_dir, exist_ok=True)
    for filename in artifact_list + ["manifest.json"]:
        shutil.copy2(os.path.join(run_dir, filename), os.path.join(current_dir, filename))

    # 9. Report
    print("Publisher complete.")
    print(f"  dashboard      : {dashboard}")
    print(f"  run_id         : {run_id}")
    print(f"  report_ts      : {report_ts}")
    print(f"  generated_at   : {generated_at}")
    print(f"  artifacts      : {list(artifacts_to_write.keys())}")
    print(f"  run folder     : {run_dir}")
    print(f"  current folder : {current_dir}")

    # 10. Rebuild run history index.
    _rebuild_run_history(generated_at, client_id=client_id, env_id=env_id)


if __name__ == "__main__":
    # Compute report_ts once for the entire run.
    # All SQL metric windows and all artifact timestamps are anchored to these values.
    report_ts = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    run(report_ts, env="local", dashboard="dlq_operations", client="default")
