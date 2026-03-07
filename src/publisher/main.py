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
ARTIFACTS_DIR = os.path.join(REPO_ROOT, "artifacts")

REQUIRED_BLOCKS = {
    "failures_last_24h",
    "failures_last_7d",
    "top_sites_by_failures",
    "trend_30d",
    "top_sites_30d",
    "exceptions_7d",
}

SCHEMA_VERSION = "1.0.0"

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


def validate_required_blocks(blocks: dict[str, str]) -> None:
    """Fail fast if any required SQL block is missing."""
    missing = REQUIRED_BLOCKS - blocks.keys()
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

    # 1. Validate Parquet source exists
    if not os.path.exists(PARQUET_PATH):
        print(
            f"ERROR: Parquet file not found: {PARQUET_PATH}\n"
            "Run: python data/generate_fixtures.py",
            file=sys.stderr,
        )
        sys.exit(1)

    # 2. Read and parse SQL
    with open(SQL_PATH, encoding="utf-8") as f:
        raw_sql = f.read()

    sql_with_ts = raw_sql.replace("{report_ts}", report_ts)
    blocks = parse_sql_blocks(sql_with_ts)
    validate_required_blocks(blocks)

    # 3. Connect DuckDB in-memory and register Parquet table
    con = duckdb.connect(database=":memory:")
    con.execute(f"CREATE TABLE ccd_failures AS SELECT * FROM read_parquet('{PARQUET_PATH}')")

    # 4. Execute all metric queries (all metric logic is in the SQL file)
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

    # 5. Build and validate summary.json
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

    # 6. Build and validate trend_30d.json
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

    # 7. Build and validate top_sites.json
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

    # 8. Build and validate exceptions.json
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

    # 9. Build and validate manifest.json
    manifest = {
        "schema_version": SCHEMA_VERSION,
        "generated_at": generated_at,
        "report_ts": report_ts,
        "status": "SUCCESS",
        "artifacts": ["summary.json", "trend_30d.json", "top_sites.json", "exceptions.json"],
    }
    try:
        manifest_schema.validate(manifest)
    except jsonschema.ValidationError as exc:
        print(f"ERROR: manifest.json schema validation failed: {exc.message}", file=sys.stderr)
        sys.exit(1)

    # 10. Write artifacts (payload artifacts first, then manifest as the index)
    os.makedirs(ARTIFACTS_DIR, exist_ok=True)

    def write_artifact(filename: str, payload: dict) -> str:
        path = os.path.join(ARTIFACTS_DIR, filename)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, sort_keys=True)
        return path

    summary_path = write_artifact("summary.json", summary)
    trend_path = write_artifact("trend_30d.json", trend_30d)
    top_sites_path = write_artifact("top_sites.json", top_sites)
    exceptions_path = write_artifact("exceptions.json", exceptions_artifact)
    manifest_path = write_artifact("manifest.json", manifest)

    # 11. Report
    print("Publisher complete.")
    print(f"  report_ts          : {report_ts}")
    print(f"  generated_at       : {generated_at}")
    print(f"  failures_last_24h  : {failures_24h}")
    print(f"  failures_last_7d   : {failures_7d}")
    print(f"  trend_30d days     : {len(trend_days)}")
    print(f"  top_sites (30d)    : {len(top_sites_30d)} sites")
    print(f"  exception types    : {len(exceptions)}")
    print(f"  -> {summary_path}")
    print(f"  -> {trend_path}")
    print(f"  -> {top_sites_path}")
    print(f"  -> {exceptions_path}")
    print(f"  -> {manifest_path}")


if __name__ == "__main__":
    # Compute report_ts once for the entire run.
    # All SQL metric windows and all artifact timestamps are anchored to these values.
    report_ts = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    run(report_ts, env="local", dashboard="dlq_operations", client=None)
