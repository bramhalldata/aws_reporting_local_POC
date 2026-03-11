"""
generate_demo_data.py — Synthetic Demo Data Generator

Creates realistic, scenario-driven run sequences for the two highest-value failure
families, enabling meaningful demos of Run Comparison, Health Classification, and
AI anomaly analysis.

Scenarios:
  1. XPath regression   → dlq_operations  dashboard, contexture/local
  2. No Valid MRN drift → pipeline_health  dashboard, contexture/local

Each scenario produces 4 runs (baseline → degradation_onset → sustained_peak → remediation).

Usage:
    python scripts/generate_demo_data.py

All artifacts are validated against existing schemas before write.
Re-running is idempotent: existing contexture/local runs are cleared and rebuilt.

Integration:
    _rebuild_run_history and _rebuild_platform_manifest are inlined from
    src/publisher/main.py to avoid importing duckdb (not needed here).
    Validators are imported directly from src/publisher/validators/.
"""

import glob as glob_module
import json
import os
import re
import shutil
import sys
from datetime import date, datetime, timedelta, timezone

# ---------------------------------------------------------------------------
# Path setup — add src/publisher/ to sys.path so validators can be imported
# ---------------------------------------------------------------------------

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
PUBLISHER_DIR = os.path.join(REPO_ROOT, "src", "publisher")
if PUBLISHER_DIR not in sys.path:
    sys.path.insert(0, PUBLISHER_DIR)

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

ARTIFACTS_BASE_DIR = os.path.join(REPO_ROOT, "artifacts")
SCHEMA_VERSION = "1.2.0"

# ---------------------------------------------------------------------------
# XPath failure type pool (realistic CCD field extraction error messages)
# ---------------------------------------------------------------------------

XPATH_FAILURE_TYPES = [
    "No match found for XPath 'CustodianName' with input 'Castle Valley Childrens Clinic'",
    "No match found for XPath 'AuthorName' with input 'Orthopedic Centers of Colorado, LLC'",
    "No match found for XPath 'ServicePerformerAddress2' with input '6801 S YOSEMITE STREET, CENTENNIAL, CO, 80112-1406, US'",
    "No match found for XPath 'ProviderOrganizationName' with input 'Miramont Family Medicine-Snow Mesa'",
    "No match found for XPath 'CustodianName' with input 'UCHealth Poudre Valley Hospital'",
    "No match found for XPath 'FacilityName' with input 'Banner Fort Collins Medical Center'",
    "No match found for XPath 'AuthorName' with input 'SCL Health St. Francis Medical Center'",
    "No match found for XPath 'PatientAddress' with input '2750 ARAPAHOE RD, LAFAYETTE, CO, 80026, US'",
]

# ---------------------------------------------------------------------------
# No Valid MRN failure type pool (realistic OID whitelist mismatch messages)
# ---------------------------------------------------------------------------

MRN_FAILURE_TYPES = [
    "No valid MRN found with provided whitelisted. MRNs in document: [2.16.840.1.113883.3.9620.2]",
    "No valid MRN found with provided whitelisted. MRNs in document: [Mrn,Interface Mapping External ID,Id,2.16.840.1.113883.4.1]",
    "No valid MRN found with provided whitelisted. MRNs in document: [1.2.840.113619.21.1.8411625035966477652.2.1.1.1]",
    "No valid MRN found with provided whitelisted. MRNs in document: [2.16.840.1.113883.3.9620.1,2.16.840.1.113883.4.1]",
    "No valid MRN found with provided whitelisted. MRNs in document: [2.16.840.1.113883.3.1239.5.1.3.1.2.2]",
]

# ---------------------------------------------------------------------------
# Scenario definitions
#
# All values are explicit data literals — no stochastic generation.
# offset_days: days before TODAY (2026-03-10) at which the run was produced.
# ---------------------------------------------------------------------------

XPATH_SCENARIO = {
    "client_id": "contexture",
    "env_id":    "local",
    "dashboard": "dlq_operations",
    "runs": [
        {
            "label":        "baseline",
            "offset_days":  6,         # 2026-03-04
            "failures_24h": 8,
            "failures_7d":  52,
            # top_sites for summary.json (7-day window, must sum to failures_7d=52)
            "summary_top_sites": [
                {"site": "UCHealth Poudre Valley Hospital",     "failures": 19},
                {"site": "Castle Valley Childrens Clinic",       "failures": 11},
                {"site": "HealthONE Sky Ridge Medical Center",   "failures":  8},
                {"site": "Miramont Family Medicine-Snow Mesa",   "failures":  7},
                {"site": "Banner Fort Collins Medical Center",   "failures":  7},
            ],
            # sites for top_sites.json (30-day window)
            "top_sites_30d": [
                {"site": "UCHealth Poudre Valley Hospital",     "failures": 72},
                {"site": "Castle Valley Childrens Clinic",       "failures": 41},
                {"site": "HealthONE Sky Ridge Medical Center",   "failures": 31},
                {"site": "Miramont Family Medicine-Snow Mesa",   "failures": 28},
                {"site": "Banner Fort Collins Medical Center",   "failures": 27},
            ],
            # exceptions for exceptions.json (7-day window; 2 types — below Warning threshold)
            "exceptions": [
                {"failure_type": XPATH_FAILURE_TYPES[0], "count": 28},  # CustodianName/CastleValley
                {"failure_type": XPATH_FAILURE_TYPES[1], "count": 15},  # AuthorName/Orthopedic
                {"failure_type": XPATH_FAILURE_TYPES[7], "count":  9},  # PatientAddress
            ],
        },
        {
            "label":        "degradation_onset",
            "offset_days":  4,         # 2026-03-06
            "failures_24h": 67,
            "failures_7d":  148,
            "summary_top_sites": [
                {"site": "Castle Valley Childrens Clinic",               "failures": 42},
                {"site": "UCHealth Poudre Valley Hospital",               "failures": 35},
                {"site": "Orthopedic Centers of Colorado, LLC",           "failures": 28},
                {"site": "Miramont Family Medicine-Snow Mesa",             "failures": 25},
                {"site": "HealthONE Sky Ridge Medical Center",             "failures": 18},
            ],
            "top_sites_30d": [
                {"site": "Castle Valley Childrens Clinic",               "failures": 89},
                {"site": "UCHealth Poudre Valley Hospital",               "failures": 71},
                {"site": "Orthopedic Centers of Colorado, LLC",           "failures": 58},
                {"site": "Miramont Family Medicine-Snow Mesa",             "failures": 49},
                {"site": "HealthONE Sky Ridge Medical Center",             "failures": 38},
                {"site": "Banner Fort Collins Medical Center",             "failures": 27},
            ],
            # 5 types — at or above Warning threshold, below Critical (< 3 new vs baseline)
            "exceptions": [
                {"failure_type": XPATH_FAILURE_TYPES[0], "count": 58},  # CustodianName/CastleValley
                {"failure_type": XPATH_FAILURE_TYPES[1], "count": 41},  # AuthorName/Orthopedic
                {"failure_type": XPATH_FAILURE_TYPES[7], "count": 22},  # PatientAddress
                {"failure_type": XPATH_FAILURE_TYPES[4], "count": 18},  # CustodianName/UCHealth
                {"failure_type": XPATH_FAILURE_TYPES[2], "count":  9},  # ServicePerformerAddress2
            ],
        },
        {
            "label":        "sustained_peak",
            "offset_days":  2,         # 2026-03-08
            "failures_24h": 89,
            "failures_7d":  201,
            # Castle Valley moved to #1 — source-specific mapping regression
            "summary_top_sites": [
                {"site": "Castle Valley Childrens Clinic",               "failures": 72},
                {"site": "UCHealth Poudre Valley Hospital",               "failures": 49},
                {"site": "Orthopedic Centers of Colorado, LLC",           "failures": 31},
                {"site": "Miramont Family Medicine-Snow Mesa",             "failures": 26},
                {"site": "HealthONE Sky Ridge Medical Center",             "failures": 14},
                {"site": "SCL Health St. Francis Medical Center",          "failures":  9},
            ],
            "top_sites_30d": [
                {"site": "Castle Valley Childrens Clinic",               "failures": 141},
                {"site": "UCHealth Poudre Valley Hospital",               "failures":  95},
                {"site": "Orthopedic Centers of Colorado, LLC",           "failures":  61},
                {"site": "Miramont Family Medicine-Snow Mesa",             "failures":  49},
                {"site": "HealthONE Sky Ridge Medical Center",             "failures":  29},
                {"site": "SCL Health St. Francis Medical Center",          "failures":  18},
                {"site": "Banner Fort Collins Medical Center",             "failures":  15},
            ],
            # 6 types — triggers CRITICAL_MANY_NEW_FAILURE_TYPES vs baseline
            "exceptions": [
                {"failure_type": XPATH_FAILURE_TYPES[0], "count": 65},  # CustodianName/CastleValley
                {"failure_type": XPATH_FAILURE_TYPES[1], "count": 48},  # AuthorName/Orthopedic
                {"failure_type": XPATH_FAILURE_TYPES[4], "count": 38},  # CustodianName/UCHealth
                {"failure_type": XPATH_FAILURE_TYPES[2], "count": 22},  # ServicePerformerAddress2
                {"failure_type": XPATH_FAILURE_TYPES[3], "count": 16},  # ProviderOrganizationName
                {"failure_type": XPATH_FAILURE_TYPES[5], "count": 12},  # FacilityName/Banner
            ],
        },
        {
            "label":        "remediation",
            "offset_days":  0,         # 2026-03-10
            "failures_24h": 11,
            "failures_7d":  76,
            # UCHealth back to #1 — Castle Valley mapping fix deployed
            "summary_top_sites": [
                {"site": "UCHealth Poudre Valley Hospital",               "failures": 28},
                {"site": "Castle Valley Childrens Clinic",                "failures": 18},
                {"site": "Miramont Family Medicine-Snow Mesa",             "failures": 12},
                {"site": "HealthONE Sky Ridge Medical Center",             "failures": 10},
                {"site": "Banner Fort Collins Medical Center",             "failures":  8},
            ],
            "top_sites_30d": [
                {"site": "UCHealth Poudre Valley Hospital",               "failures":  95},
                {"site": "Castle Valley Childrens Clinic",                "failures":  85},
                {"site": "Orthopedic Centers of Colorado, LLC",           "failures":  58},
                {"site": "Miramont Family Medicine-Snow Mesa",             "failures":  39},
                {"site": "HealthONE Sky Ridge Medical Center",             "failures":  27},
                {"site": "Banner Fort Collins Medical Center",             "failures":  22},
            ],
            # 2 types — most failure types resolved; mapping fix deployed
            "exceptions": [
                {"failure_type": XPATH_FAILURE_TYPES[0], "count": 42},  # CustodianName/CastleValley
                {"failure_type": XPATH_FAILURE_TYPES[1], "count": 34},  # AuthorName/Orthopedic
            ],
        },
    ],
}

MRN_SCENARIO = {
    "client_id": "contexture",
    "env_id":    "local",
    "dashboard": "pipeline_health",
    "runs": [
        {
            "label":           "baseline",
            "offset_days":     6,          # 2026-03-04
            "total_docs_24h":  847,
            "active_sites_24h": 24,
            # 2 MRN types — occasional legacy OID mismatches, operationally normal
            "failure_types": [
                {"failure_type": MRN_FAILURE_TYPES[0], "count": 14},
                {"failure_type": MRN_FAILURE_TYPES[1], "count":  8},
            ],
        },
        {
            "label":           "degradation_onset",
            "offset_days":     4,          # 2026-03-06
            "total_docs_24h":  612,
            "active_sites_24h": 18,
            # 4 MRN types — whitelist update misconfigured; new OID patterns rejected
            "failure_types": [
                {"failure_type": MRN_FAILURE_TYPES[0], "count": 89},
                {"failure_type": MRN_FAILURE_TYPES[1], "count": 67},
                {"failure_type": MRN_FAILURE_TYPES[2], "count": 45},
                {"failure_type": MRN_FAILURE_TYPES[3], "count": 31},
            ],
        },
        {
            "label":           "sustained_peak",
            "offset_days":     2,          # 2026-03-08
            "total_docs_24h":  543,
            "active_sites_24h": 15,
            # 5 MRN types — 3 OID patterns consistently rejected across sites
            "failure_types": [
                {"failure_type": MRN_FAILURE_TYPES[0], "count": 121},
                {"failure_type": MRN_FAILURE_TYPES[1], "count":  98},
                {"failure_type": MRN_FAILURE_TYPES[2], "count":  72},
                {"failure_type": MRN_FAILURE_TYPES[3], "count":  54},
                {"failure_type": MRN_FAILURE_TYPES[4], "count":  38},
            ],
        },
        {
            "label":           "remediation",
            "offset_days":     0,          # 2026-03-10
            "total_docs_24h":  801,
            "active_sites_24h": 22,
            # 1 MRN type — whitelist corrected; volume recovers; residual legacy OID remains
            "failure_types": [
                {"failure_type": MRN_FAILURE_TYPES[0], "count": 9},
            ],
        },
    ],
}

# ---------------------------------------------------------------------------
# ID and timestamp helpers
# ---------------------------------------------------------------------------

TODAY = date(2026, 3, 10)


def make_report_ts(offset_days: int) -> str:
    """Return an ISO-8601 UTC timestamp for (TODAY - offset_days) at 09:00 UTC."""
    run_date = TODAY - timedelta(days=offset_days)
    dt = datetime(run_date.year, run_date.month, run_date.day, 9, 0, 0, tzinfo=timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def make_run_id(report_ts: str) -> str:
    """Derive run_id from report_ts by stripping non-alphanumeric characters."""
    return re.sub(r"[^a-zA-Z0-9]", "", report_ts)


# ---------------------------------------------------------------------------
# Trend 30-day series builder
#
# Invariant: the last 7 entries sum to failures_7d (within rounding).
# Earlier 23 entries use a stable daily baseline (failures_7d // 7 // 2 per day).
# ---------------------------------------------------------------------------

def build_trend_30d(failures_7d: int, offset_days: int) -> list:
    """Build a 30-day trend series with the run date as the final day.

    The last 7 days sum to failures_7d. Earlier days use a stable baseline
    representing the pre-scenario period.

    Args:
        failures_7d: Total failures in the 7-day window ending on the run date.
        offset_days: Days before TODAY at which the run was produced.

    Returns:
        List of {"date": "YYYY-MM-DD", "failures": int} for 30 consecutive days.
    """
    run_date = TODAY - timedelta(days=offset_days)
    # Distribute failures_7d evenly across the last 7 days.
    # The final day gets any remainder to ensure the sum is exact.
    per_day = failures_7d // 7
    remainder = failures_7d - per_day * 6  # last (most recent) day absorbs remainder

    # Stable baseline for the earlier 23 days: half the daily average of the 7d window
    baseline = max(per_day // 2, 1)

    days = []
    for i in range(29, -1, -1):  # i=29 is oldest day; i=0 is run_date (most recent)
        day = run_date - timedelta(days=i)
        if i == 0:
            failures = remainder
        elif i < 7:
            failures = per_day
        else:
            failures = baseline
        days.append({"date": day.strftime("%Y-%m-%d"), "failures": failures})
    return days


# ---------------------------------------------------------------------------
# Artifact writers
# ---------------------------------------------------------------------------

def _write_json(path: str, payload: dict) -> None:
    """Write a JSON payload to path, creating parent directories as needed."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, sort_keys=True)


def _validate_and_write(path: str, payload: dict, validator_fn) -> None:
    """Validate payload against schema then write to path. Abort on validation failure."""
    try:
        validator_fn(payload)
    except jsonschema.ValidationError as exc:
        print(f"\nERROR: Schema validation failed for {os.path.basename(path)}: {exc.message}",
              file=sys.stderr)
        sys.exit(1)
    _write_json(path, payload)


def write_dlq_run(run_def: dict, client_id: str, env_id: str) -> str:
    """Write all artifacts for one dlq_operations run. Returns the run_id."""
    report_ts    = make_report_ts(run_def["offset_days"])
    generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    run_id       = make_run_id(report_ts)

    run_dir = os.path.join(ARTIFACTS_BASE_DIR, client_id, env_id, "runs", run_id, "dlq_operations")
    os.makedirs(run_dir, exist_ok=True)

    # summary.json
    summary = {
        "schema_version":    SCHEMA_VERSION,
        "generated_at":      generated_at,
        "report_ts":         report_ts,
        "failures_last_24h": run_def["failures_24h"],
        "failures_last_7d":  run_def["failures_7d"],
        "top_sites":         run_def["summary_top_sites"],
    }
    _validate_and_write(os.path.join(run_dir, "summary.json"), summary, summary_schema.validate)

    # trend_30d.json
    trend = {
        "schema_version": SCHEMA_VERSION,
        "generated_at":   generated_at,
        "report_ts":      report_ts,
        "days":           build_trend_30d(run_def["failures_7d"], run_def["offset_days"]),
    }
    _validate_and_write(os.path.join(run_dir, "trend_30d.json"), trend, trend_30d_schema.validate)

    # top_sites.json
    ts_artifact = {
        "schema_version": SCHEMA_VERSION,
        "generated_at":   generated_at,
        "report_ts":      report_ts,
        "window_days":    30,
        "sites":          run_def["top_sites_30d"],
    }
    _validate_and_write(os.path.join(run_dir, "top_sites.json"), ts_artifact, top_sites_schema.validate)

    # exceptions.json
    exc_artifact = {
        "schema_version": SCHEMA_VERSION,
        "generated_at":   generated_at,
        "report_ts":      report_ts,
        "window_days":    7,
        "exceptions":     run_def["exceptions"],
    }
    _validate_and_write(os.path.join(run_dir, "exceptions.json"), exc_artifact, exceptions_schema.validate)

    # manifest.json — artifact list matches dashboard.json "artifacts" field
    artifact_list = ["summary.json", "trend_30d.json", "top_sites.json", "exceptions.json"]
    manifest = {
        "schema_version": SCHEMA_VERSION,
        "run_id":         run_id,
        "generated_at":   generated_at,
        "report_ts":      report_ts,
        "status":         "SUCCESS",
        "artifacts":      artifact_list,
    }
    _validate_and_write(os.path.join(run_dir, "manifest.json"), manifest, manifest_schema.validate)

    # Update current/dlq_operations/ to point to this run
    current_dir = os.path.join(ARTIFACTS_BASE_DIR, client_id, env_id, "current", "dlq_operations")
    os.makedirs(current_dir, exist_ok=True)
    for filename in artifact_list + ["manifest.json"]:
        shutil.copy2(os.path.join(run_dir, filename), os.path.join(current_dir, filename))

    return run_id


def write_pipeline_health_run(run_def: dict, client_id: str, env_id: str) -> str:
    """Write all artifacts for one pipeline_health run. Returns the run_id."""
    report_ts    = make_report_ts(run_def["offset_days"])
    generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    run_id       = make_run_id(report_ts)

    run_dir = os.path.join(ARTIFACTS_BASE_DIR, client_id, env_id, "runs", run_id, "pipeline_health")
    os.makedirs(run_dir, exist_ok=True)

    # summary.json — pipeline_health schema (different fields from dlq_operations)
    run_date = TODAY - timedelta(days=run_def["offset_days"])
    latest_event = f"{run_date.strftime('%Y-%m-%d')}T08:59:00Z"

    ph_summary = {
        "schema_version":           SCHEMA_VERSION,
        "generated_at":             generated_at,
        "report_ts":                report_ts,
        "total_documents_last_24h": run_def["total_docs_24h"],
        "active_sites_last_24h":    run_def["active_sites_24h"],
        "latest_event_timestamp":   latest_event,
    }
    _validate_and_write(
        os.path.join(run_dir, "summary.json"),
        ph_summary,
        pipeline_health_summary_schema.validate,
    )

    # failure_types.json
    ft_artifact = {
        "schema_version": SCHEMA_VERSION,
        "generated_at":   generated_at,
        "report_ts":      report_ts,
        "window_days":    1,
        "failure_types":  run_def["failure_types"],
    }
    _validate_and_write(
        os.path.join(run_dir, "failure_types.json"),
        ft_artifact,
        pipeline_health_failure_types_schema.validate,
    )

    # manifest.json
    artifact_list = ["summary.json", "failure_types.json"]
    manifest = {
        "schema_version": SCHEMA_VERSION,
        "run_id":         run_id,
        "generated_at":   generated_at,
        "report_ts":      report_ts,
        "status":         "SUCCESS",
        "artifacts":      artifact_list,
    }
    _validate_and_write(os.path.join(run_dir, "manifest.json"), manifest, manifest_schema.validate)

    # Update current/pipeline_health/
    current_dir = os.path.join(ARTIFACTS_BASE_DIR, client_id, env_id, "current", "pipeline_health")
    os.makedirs(current_dir, exist_ok=True)
    for filename in artifact_list + ["manifest.json"]:
        shutil.copy2(os.path.join(run_dir, filename), os.path.join(current_dir, filename))

    return run_id


# ---------------------------------------------------------------------------
# Publisher rebuild functions
#
# Mirrored from src/publisher/main.py to avoid importing duckdb (not needed here).
# Behavior and output format are identical to the originals.
# ---------------------------------------------------------------------------

def _rebuild_run_history(generated_at: str, *, client_id: str, env_id: str) -> None:
    """Scan runs/ and rebuild run_history.json for a given client/env scope.

    Mirrors src/publisher/main._rebuild_run_history().
    """
    runs = []
    runs_dir = os.path.join(ARTIFACTS_BASE_DIR, client_id, env_id, "runs")
    pattern  = os.path.join(runs_dir, "*", "*", "manifest.json")

    for manifest_path in sorted(glob_module.glob(pattern)):
        try:
            with open(manifest_path, encoding="utf-8") as f:
                m = json.load(f)
            parts        = os.path.normpath(manifest_path).split(os.sep)
            dashboard_id = parts[-2]
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
            pass

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

    current_dir  = os.path.join(ARTIFACTS_BASE_DIR, client_id, env_id, "current")
    os.makedirs(current_dir, exist_ok=True)
    history_path = os.path.join(current_dir, "run_history.json")
    with open(history_path, "w", encoding="utf-8") as f:
        json.dump(run_history, f, indent=2, sort_keys=True)

    print(f"  run_history    : {history_path} ({len(runs)} entries)")


def _rebuild_platform_manifest(generated_at: str) -> None:
    """Rebuild artifacts/platform-manifest.json from all scoped run_history.json files.

    Mirrors src/publisher/main._rebuild_platform_manifest().
    """
    clients_map: dict = {}

    pattern = os.path.join(ARTIFACTS_BASE_DIR, "*", "*", "current", "run_history.json")
    for history_path in sorted(glob_module.glob(pattern)):
        parts     = os.path.normpath(history_path).split(os.sep)
        env_id    = parts[-3]
        client_id = parts[-4]

        try:
            with open(history_path, encoding="utf-8") as f:
                hist = json.load(f)
            if not isinstance(hist.get("runs"), list):
                continue
        except (json.JSONDecodeError, OSError):
            continue

        seen: dict = {}
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

    manifest_path = os.path.join(ARTIFACTS_BASE_DIR, "platform-manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, sort_keys=True)

    scope_count = sum(len(clients_map[c]) for c in clients_map)
    print(f"  platform-manifest: {manifest_path} ({len(clients)} client(s), {scope_count} scope(s))")


# ---------------------------------------------------------------------------
# Scope management
# ---------------------------------------------------------------------------

def clear_scope_runs(client_id: str, env_id: str) -> None:
    """Delete all existing runs for client_id/env_id. Warns before deleting."""
    runs_dir = os.path.join(ARTIFACTS_BASE_DIR, client_id, env_id, "runs")
    if os.path.isdir(runs_dir):
        run_count = len([
            d for d in os.listdir(runs_dir)
            if os.path.isdir(os.path.join(runs_dir, d))
        ])
        print(f"  Clearing {run_count} existing run(s) from {runs_dir}")
        shutil.rmtree(runs_dir)
    else:
        print(f"  No existing runs at {runs_dir} (fresh start)")


# ---------------------------------------------------------------------------
# Scenario generators
# ---------------------------------------------------------------------------

def generate_xpath_scenario() -> None:
    """Generate all 4 runs for the XPath regression scenario (dlq_operations)."""
    s         = XPATH_SCENARIO
    client_id = s["client_id"]
    env_id    = s["env_id"]
    runs      = s["runs"]
    n         = len(runs)

    print(f"\nWriting XPath scenario ({s['dashboard']})...")
    for i, run_def in enumerate(runs, start=1):
        run_id = write_dlq_run(run_def, client_id, env_id)
        print(f"  [{i}/{n}] {run_def['label']:<20} -> {run_id}  "
              f"(failures_24h={run_def['failures_24h']}, failures_7d={run_def['failures_7d']})")


def generate_mrn_scenario() -> None:
    """Generate all 4 runs for the No Valid MRN scenario (pipeline_health)."""
    s         = MRN_SCENARIO
    client_id = s["client_id"]
    env_id    = s["env_id"]
    runs      = s["runs"]
    n         = len(runs)

    print(f"\nWriting MRN scenario ({s['dashboard']})...")
    for i, run_def in enumerate(runs, start=1):
        run_id = write_pipeline_health_run(run_def, client_id, env_id)
        print(f"  [{i}/{n}] {run_def['label']:<20} -> {run_id}  "
              f"(docs_24h={run_def['total_docs_24h']}, sites={run_def['active_sites_24h']})")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    """Generate all demo scenarios and rebuild the run history index."""
    client_id = "contexture"
    env_id    = "local"

    print("=" * 60)
    print("Synthetic Demo Data Generator")
    print(f"Target scope : {client_id}/{env_id}")
    print(f"TODAY        : {TODAY}")
    print("=" * 60)

    # Step 1: Clear existing runs for the demo scope
    print(f"\nStep 1: Clear existing {client_id}/{env_id} runs")
    clear_scope_runs(client_id, env_id)

    # Step 2: Generate scenarios
    print("\nStep 2: Write scenario artifacts")
    generate_xpath_scenario()
    generate_mrn_scenario()

    # Step 3: Rebuild run history and platform manifest
    print("\nStep 3: Rebuild indices")
    generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    _rebuild_run_history(generated_at, client_id=client_id, env_id=env_id)
    _rebuild_platform_manifest(generated_at)

    print("\nDone. 8 runs written to artifacts/contexture/local/")
    print("\nVerification:")
    print(f"  1. cd portal && npm run dev")
    print(f"  2. Navigate to http://localhost:5173/{client_id}/{env_id}/history")
    print(f"  3. Compare baseline vs sustained_peak (dlq_operations) -> [Critical] badge")
    print(f"  4. Compare sustained_peak vs remediation (dlq_operations) -> [Healthy] badge")


if __name__ == "__main__":
    main()
