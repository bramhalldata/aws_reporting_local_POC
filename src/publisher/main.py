"""
main.py — dlq_operations Publisher

Implements the publisher layer of the reporting pipeline.

Pipeline:
  Parquet (data/parquet/) → DuckDB (sql/athena_views.sql) → JSON artifacts (artifacts/)

Architecture rules enforced here:
  - Metrics are defined in sql/athena_views.sql, not in this file.
  - This file only executes queries, assembles results, validates, and writes.
  - report_ts is computed once and injected into all queries so runs are deterministic.

In production, this service runs in ECS/Fargate, queries AWS Athena, and writes to S3.

Run: python src/publisher/main.py
"""

import json
import os
import re
import sys
from datetime import datetime, timezone

import duckdb
import jsonschema

from validators import manifest_schema, summary_schema

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PARQUET_PATH = os.path.join(REPO_ROOT, "data", "parquet", "ccd_failures.parquet")
SQL_PATH = os.path.join(REPO_ROOT, "sql", "athena_views.sql")
ARTIFACTS_DIR = os.path.join(REPO_ROOT, "artifacts")

REQUIRED_BLOCKS = {"failures_last_24h", "failures_last_7d", "top_sites_by_failures"}

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

def run(report_ts: str) -> None:
    """Execute the full publish pipeline for a given report_ts."""

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

    # 4. Execute metric queries (all metric logic is in the SQL file)
    failures_24h = con.execute(blocks["failures_last_24h"]).fetchone()[0]
    failures_7d = con.execute(blocks["failures_last_7d"]).fetchone()[0]
    top_sites_rows = con.execute(blocks["top_sites_by_failures"]).fetchall()
    top_sites = [{"site": row[0], "failures": row[1]} for row in top_sites_rows]

    con.close()

    generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()

    # 5. Build and validate summary.json
    summary = {
        "schema_version": SCHEMA_VERSION,
        "generated_at": generated_at,
        "report_ts": report_ts,
        "failures_last_24h": int(failures_24h),
        "failures_last_7d": int(failures_7d),
        "top_sites": top_sites,
    }
    try:
        summary_schema.validate(summary)
    except jsonschema.ValidationError as exc:
        print(f"ERROR: summary.json schema validation failed: {exc.message}", file=sys.stderr)
        sys.exit(1)

    # 6. Build and validate manifest.json
    manifest = {
        "schema_version": SCHEMA_VERSION,
        "generated_at": generated_at,
        "status": "ok",
        "artifacts": ["summary.json"],
    }
    try:
        manifest_schema.validate(manifest)
    except jsonschema.ValidationError as exc:
        print(f"ERROR: manifest.json schema validation failed: {exc.message}", file=sys.stderr)
        sys.exit(1)

    # 7. Write artifacts (summary first, then manifest as the index)
    os.makedirs(ARTIFACTS_DIR, exist_ok=True)

    summary_path = os.path.join(ARTIFACTS_DIR, "summary.json")
    manifest_path = os.path.join(ARTIFACTS_DIR, "manifest.json")

    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2, sort_keys=True)

    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, sort_keys=True)

    # 8. Report
    print(f"Publisher complete.")
    print(f"  report_ts          : {report_ts}")
    print(f"  failures_last_24h  : {failures_24h}")
    print(f"  failures_last_7d   : {failures_7d}")
    print(f"  top_sites          : {len(top_sites)} sites")
    print(f"  artifacts/summary.json  -> {summary_path}")
    print(f"  artifacts/manifest.json -> {manifest_path}")


if __name__ == "__main__":
    # Compute report_ts once for the entire run.
    # All SQL metric windows are anchored to this timestamp.
    report_ts = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    run(report_ts)
