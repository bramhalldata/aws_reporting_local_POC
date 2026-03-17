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
    sent_to_udm_lifetime_detail_schema,
    sent_to_udm_recent_detail_30d_schema,
    sent_to_udm_region_summary_schema,
    sent_to_udm_summary_schema,
    sent_to_udm_trend_30d_schema,
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
# Platform manifest — global capability registry
# ---------------------------------------------------------------------------

def _rebuild_platform_manifest(generated_at: str) -> None:
    """Scan all scoped run_history.json files and rebuild artifacts/platform-manifest.json.

    Called at the end of every publisher run, after _rebuild_run_history().
    Uses a 2-wildcard glob (artifacts/{client}/{env}/current/run_history.json) which
    correctly targets only v1.2.0 scoped histories — root-level legacy files are excluded.

    The manifest reflects actual artifact presence on disk, not portal scopes config.
    A scope configured in the portal but not bootstrapped does not appear here.

    Phase 1 note: this function is called once per dashboard during a bootstrap run.
    All calls are idempotent; the overhead is negligible at current scale.
    A future optimization is to call this once after the loop in bootstrap() by adding
    a skip_platform_manifest flag to run().
    """
    clients_map: dict[str, dict[str, list]] = {}

    pattern = os.path.join(ARTIFACTS_BASE_DIR, "*", "*", "current", "run_history.json")
    for history_path in sorted(glob.glob(pattern)):
        # Extract client_id and env_id from path.
        # Path structure: .../artifacts/{client}/{env}/current/run_history.json
        # os.path.normpath converts separators to os.sep before splitting.
        parts     = os.path.normpath(history_path).split(os.sep)
        env_id    = parts[-3]
        client_id = parts[-4]

        try:
            with open(history_path, encoding="utf-8") as f:
                hist = json.load(f)
            if not isinstance(hist.get("runs"), list):
                continue  # skip scopes with malformed run_history
        except (json.JSONDecodeError, OSError):
            continue  # skip unreadable or malformed files

        # Collect the latest successful run per dashboard.
        # Runs are already sorted most-recent-first by _rebuild_run_history().
        seen: dict[str, dict] = {}
        for run in hist["runs"]:
            dashboard_id = run.get("dashboard_id")
            if not dashboard_id or run.get("status") != "SUCCESS":
                continue
            if dashboard_id not in seen:
                seen[dashboard_id] = {
                    "dashboard_id":   dashboard_id,
                    "latest_run_id":  run["run_id"],
                    "artifact_types": sorted(a["type"] for a in run.get("artifacts", [])),
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

    # Written to artifacts/ root — a static, global URL served by Vite and CloudFront.
    # Future production note: ensure appropriate cache-control headers for this file.
    manifest_path = os.path.join(ARTIFACTS_BASE_DIR, "platform-manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, sort_keys=True)

    scope_count = sum(len(clients_map[c]) for c in clients_map)
    print(f"  platform-manifest: {manifest_path} ({len(clients)} client(s), {scope_count} scope(s))")


# ---------------------------------------------------------------------------
# Dashboard discovery
# ---------------------------------------------------------------------------

def discover_dashboards() -> list[str]:
    """Return sorted list of dashboard IDs found in DASHBOARDS_DIR.

    A valid dashboard directory contains a dashboard.json config file.
    Stays in sync with load_dashboard_config() — both use DASHBOARDS_DIR as
    the canonical source, so no separate dashboard list is needed.
    """
    ids = []
    for name in sorted(os.listdir(DASHBOARDS_DIR)):
        config_path = os.path.join(DASHBOARDS_DIR, name, "dashboard.json")
        if os.path.isfile(config_path):
            ids.append(name)
    return ids


# ---------------------------------------------------------------------------
# Bootstrap — initialize a full client/env scope
# ---------------------------------------------------------------------------

def bootstrap(*, env: str, client: str | None = None) -> None:
    """Initialize a full client/env scope by running all discovered dashboards.

    Uses a shared report_ts so all dashboards produce the same run_id and
    appear as a coherent group in run_history.json.

    Continues past individual dashboard failures and prints a summary at the
    end. Exits 0 if all dashboards succeeded, 1 if any failed.
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
    print(f"Bootstrapping scope {client_id}/{env_id} -- {n} dashboard(s)  run_id={run_id}")

    # Note: run() calls _rebuild_run_history() at the end of each dashboard.
    # With N dashboards this triggers N rebuilds. All are idempotent and fast
    # for the current dashboard count. Future optimization: add a
    # skip_history_rebuild flag to run() and call _rebuild_run_history() once
    # after the loop.
    results = []
    for i, dashboard_id in enumerate(dashboards_list, start=1):
        print(f"  [{i}/{n}] {dashboard_id} ...")
        try:
            run(report_ts, env=env_id, dashboard=dashboard_id, client=client_id)
            results.append((dashboard_id, True))
        except SystemExit:
            results.append((dashboard_id, False))

    succeeded = sum(1 for _, ok in results if ok)
    failed    = n - succeeded

    print(f"\nBootstrap complete -- {succeeded}/{n} dashboard(s) succeeded.")
    for dashboard_id, ok in results:
        mark = "OK  " if ok else "FAIL"
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
                print(
                    f"  publisher run --client {client_id} --env {env_id}"
                    f" --dashboard {dashboard_id}"
                )
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

    elif dashboard == "sent_to_udm":
        udm_parquet_path = os.path.join(REPO_ROOT, "data", "parquet", "ccd_sent_to_udm.parquet")
        if not os.path.exists(udm_parquet_path):
            print(
                f"ERROR: Parquet file not found: {udm_parquet_path}\n"
                "Run: python data/generate_fixtures.py",
                file=sys.stderr,
            )
            sys.exit(1)
        con.execute(
            f"CREATE TABLE ccd_sent_to_udm AS SELECT * FROM read_parquet('{udm_parquet_path}')"
        )

        # sent_to_udm_summary returns a single row with 7 columns.
        # Column order matches the SQL contract in sql/athena_views.sql — do not reorder.
        # 0: total_regions_active  1: total_sites_active  2: total_ccds_sent
        # 3: earliest_event_ts     4: latest_event_ts
        # 5: regions_active_30d    6: sites_active_30d
        summary_row = con.execute(blocks["sent_to_udm_summary"]).fetchone()
        udm_summary = {
            "schema_version":       SCHEMA_VERSION,
            "generated_at":         generated_at,
            "report_ts":            report_ts,
            "total_regions_active": int(summary_row[0]),
            "total_sites_active":   int(summary_row[1]),
            "total_ccds_sent":      int(summary_row[2]),
            "earliest_event_ts":    str(summary_row[3]),
            "latest_event_ts":      str(summary_row[4]),
            "regions_active_30d":   int(summary_row[5]),
            "sites_active_30d":     int(summary_row[6]),
        }
        try:
            sent_to_udm_summary_schema.validate(udm_summary)
        except jsonschema.ValidationError as exc:
            print(f"ERROR: summary.json schema validation failed: {exc.message}", file=sys.stderr)
            sys.exit(1)

        region_rows = con.execute(blocks["sent_to_udm_region_summary"]).fetchall()
        udm_region_summary = {
            "schema_version": SCHEMA_VERSION,
            "generated_at":   generated_at,
            "report_ts":      report_ts,
            "regions": [
                {
                    "region":     row[0],
                    "site_count": int(row[1]),
                    "ccd_count":  int(row[2]),
                    "first_seen": str(row[3]),
                    "last_seen":  str(row[4]),
                }
                for row in region_rows
            ],
        }
        try:
            sent_to_udm_region_summary_schema.validate(udm_region_summary)
        except jsonschema.ValidationError as exc:
            print(f"ERROR: region_summary.json schema validation failed: {exc.message}", file=sys.stderr)
            sys.exit(1)

        trend_rows = con.execute(blocks["sent_to_udm_trend_30d"]).fetchall()
        udm_trend_30d = {
            "schema_version": SCHEMA_VERSION,
            "generated_at":   generated_at,
            "report_ts":      report_ts,
            "days": [{"date": str(row[0]), "ccd_count": int(row[1])} for row in trend_rows],
        }
        try:
            sent_to_udm_trend_30d_schema.validate(udm_trend_30d)
        except jsonschema.ValidationError as exc:
            print(f"ERROR: trend_30d.json schema validation failed: {exc.message}", file=sys.stderr)
            sys.exit(1)

        lifetime_rows = con.execute(blocks["sent_to_udm_lifetime_detail"]).fetchall()
        udm_lifetime_detail = {
            "schema_version": SCHEMA_VERSION,
            "generated_at":   generated_at,
            "report_ts":      report_ts,
            "rows": [
                {
                    "region":     row[0],
                    "site":       row[1],
                    "ccd_count":  int(row[2]),
                    "first_seen": str(row[3]),
                    "last_seen":  str(row[4]),
                }
                for row in lifetime_rows
            ],
        }
        try:
            sent_to_udm_lifetime_detail_schema.validate(udm_lifetime_detail)
        except jsonschema.ValidationError as exc:
            print(f"ERROR: lifetime_detail.json schema validation failed: {exc.message}", file=sys.stderr)
            sys.exit(1)

        recent_rows = con.execute(blocks["sent_to_udm_recent_detail_30d"]).fetchall()
        udm_recent_detail_30d = {
            "schema_version": SCHEMA_VERSION,
            "generated_at":   generated_at,
            "report_ts":      report_ts,
            "window_days":    30,
            "rows": [
                {
                    "region":         row[0],
                    "site":           row[1],
                    "ccd_count":      int(row[2]),
                    "first_seen_30d": str(row[3]),
                    "last_seen_30d":  str(row[4]),
                }
                for row in recent_rows
            ],
        }
        try:
            sent_to_udm_recent_detail_30d_schema.validate(udm_recent_detail_30d)
        except jsonschema.ValidationError as exc:
            print(f"ERROR: recent_detail_30d.json schema validation failed: {exc.message}", file=sys.stderr)
            sys.exit(1)

        artifacts_to_write = {
            "summary.json":           udm_summary,
            "region_summary.json":    udm_region_summary,
            "trend_30d.json":         udm_trend_30d,
            "lifetime_detail.json":   udm_lifetime_detail,
            "recent_detail_30d.json": udm_recent_detail_30d,
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

    # 11. Rebuild global platform manifest.
    # Called once per dashboard; during bootstrap this triggers N rebuilds (one per dashboard).
    # All rebuilds are idempotent and fast at current scale. See bootstrap() for future
    # optimization note.
    _rebuild_platform_manifest(generated_at)


if __name__ == "__main__":
    # Compute report_ts once for the entire run.
    # All SQL metric windows and all artifact timestamps are anchored to these values.
    report_ts = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    run(report_ts, env="local", dashboard="dlq_operations", client="default")
