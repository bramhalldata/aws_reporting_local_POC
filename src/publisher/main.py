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
ARTIFACTS_RUNS_DIR = os.path.join(REPO_ROOT, "artifacts", "runs")
ARTIFACTS_CURRENT_DIR = os.path.join(REPO_ROOT, "artifacts", "current")

SCHEMA_VERSION = "1.1.0"

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
    print(f"publisher run  env={env}  dashboard={dashboard}  client={client}")

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

    # 5. Execute all metric queries (all metric logic is in the SQL file)
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

    con.close()

    # generated_at is fixed once here; every artifact payload uses this same value.
    generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()

    # 6. Build and validate summary.json
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

    # 7. Build and validate trend_30d.json
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

    # 8. Build and validate top_sites.json
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

    # 9. Build and validate exceptions.json
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

    # Derive run_id from report_ts — strip non-alphanumeric characters.
    # e.g. "2026-03-07T22:49:59Z" → "20260307T224959Z"
    run_id = re.sub(r"[^a-zA-Z0-9]", "", report_ts)
    run_dir = os.path.join(ARTIFACTS_RUNS_DIR, run_id, dashboard)
    current_dir = os.path.join(ARTIFACTS_CURRENT_DIR, dashboard)

    # 10. Build and validate manifest.json (artifact list sourced from dashboard config)
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

    # 11. Write artifacts to the versioned run folder (payload artifacts first, manifest last).
    os.makedirs(run_dir, exist_ok=True)

    def write_artifact(filename: str, payload: dict) -> str:
        path = os.path.join(run_dir, filename)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, sort_keys=True)
        return path

    write_artifact("summary.json", summary)
    write_artifact("trend_30d.json", trend_30d)
    write_artifact("top_sites.json", top_sites)
    write_artifact("exceptions.json", exceptions_artifact)
    write_artifact("manifest.json", manifest)

    # 12. Copy run folder to artifacts/current/<dashboard>/ so the portal reads stable URLs.
    os.makedirs(current_dir, exist_ok=True)
    copy_files = artifact_list + ["manifest.json"]
    for filename in copy_files:
        shutil.copy2(os.path.join(run_dir, filename), os.path.join(current_dir, filename))

    # 13. Report
    print("Publisher complete.")
    print(f"  dashboard          : {dashboard}")
    print(f"  run_id             : {run_id}")
    print(f"  report_ts          : {report_ts}")
    print(f"  generated_at       : {generated_at}")
    print(f"  failures_last_24h  : {failures_24h}")
    print(f"  failures_last_7d   : {failures_7d}")
    print(f"  trend_30d days     : {len(trend_days)}")
    print(f"  top_sites (30d)    : {len(top_sites_30d)} sites")
    print(f"  exception types    : {len(exceptions)}")
    print(f"  run folder         : {run_dir}")
    print(f"  current folder     : {current_dir}")


if __name__ == "__main__":
    # Compute report_ts once for the entire run.
    # All SQL metric windows and all artifact timestamps are anchored to these values.
    report_ts = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    run(report_ts, env="local", dashboard="dlq_operations", client=None)
