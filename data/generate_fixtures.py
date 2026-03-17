"""
generate_fixtures.py

Represents the ETL layer boundary.
Generates a synthetic CCD failure dataset and writes it as a Parquet file.

In production this role is fulfilled by an ETL pipeline (Glue / Spark / Lambda)
that writes curated Parquet gold tables to S3.

Run: python data/generate_fixtures.py
"""

import os
import random
from datetime import datetime, timezone, timedelta

import pyarrow as pa
import pyarrow.parquet as pq

SEED = 42
random.seed(SEED)

SITES = ["site_alpha", "site_bravo", "site_charlie", "site_delta", "site_echo"]
FAILURE_TYPES = ["TIMEOUT", "AUTH_ERROR", "PARSE_FAILURE", "CONNECTION_RESET", "SCHEMA_MISMATCH"]

# Anchor the fixture data so rows fall within a predictable window.
# Rows are spread over the 10 days ending at this fixed point.
FIXTURE_ANCHOR = datetime(2026, 3, 7, 12, 0, 0, tzinfo=timezone.utc)
WINDOW_DAYS = 10
ROW_COUNT = 200

# ---------------------------------------------------------------------------
# ccd_sent_to_udm fixture constants
# ---------------------------------------------------------------------------

# Regions and their associated sites for the sent_to_udm fixture.
REGIONS = ["AZ", "CO", "WS", "UNKNOWN"]
REGION_SITES = {
    "AZ":      ["az_site_1", "az_site_2"],
    "CO":      ["co_site_1"],
    "WS":      ["ws_site_1", "ws_site_2"],
    "UNKNOWN": ["unknown_site_1"],
}

UDM_SEED        = 43
UDM_ROW_COUNT   = 300
UDM_WINDOW_DAYS = 60   # 60-day spread gives a meaningful lifetime vs 30d contrast


def _random_timestamp(anchor: datetime, window_days: int) -> datetime:
    offset_seconds = random.randint(0, window_days * 24 * 3600)
    return anchor - timedelta(seconds=offset_seconds)


def generate_sent_to_udm_rows(count: int) -> list[dict]:
    """Generate synthetic ccd_sent_to_udm rows.

    First 4 rows are seeded explicitly — one per region with timestamps inside the
    30-day window — guaranteeing all 4 regions appear in 30d queries regardless of
    the random distribution under UDM_SEED.

    Uses a separate Random(UDM_SEED) instance to avoid disturbing the global random
    state used by the ccd_failures generator.
    """
    rng = random.Random(UDM_SEED)
    all_region_sites = [
        (region, site)
        for region, sites in REGION_SITES.items()
        for site in sites
    ]
    rows = []

    # Guarantee: one row per region anchored 5 days before FIXTURE_ANCHOR.
    # With report_ts at runtime (~2026-03-17), the 30d window covers ~2026-02-15
    # to 2026-03-07. anchor - 5d = 2026-03-02, which falls inside that window.
    anchor_minus_5d = FIXTURE_ANCHOR - timedelta(days=5)
    for region in REGIONS:
        site = REGION_SITES[region][0]
        rows.append({
            "region":      region,
            "site":        site,
            "timestamp":   anchor_minus_5d,
            "document_id": f"ccd_{len(rows):06d}_{rng.randint(1000, 9999)}",
        })

    # Random rows: spread over UDM_WINDOW_DAYS (60 days) for lifetime vs 30d contrast.
    for i in range(len(rows), count):
        region, site = rng.choice(all_region_sites)
        offset_seconds = rng.randint(0, UDM_WINDOW_DAYS * 24 * 3600)
        ts = FIXTURE_ANCHOR - timedelta(seconds=offset_seconds)
        rows.append({
            "region":      region,
            "site":        site,
            "timestamp":   ts,
            "document_id": f"ccd_{i:06d}_{rng.randint(1000, 9999)}",
        })

    return rows


def generate_rows(count: int) -> list[dict]:
    rows = []
    for i in range(count):
        rows.append({
            "site": random.choice(SITES),
            "timestamp": _random_timestamp(FIXTURE_ANCHOR, WINDOW_DAYS),
            "failure_type": random.choice(FAILURE_TYPES),
            "document_id": f"doc_{i:06d}_{random.randint(1000, 9999)}",
        })
    return rows


def main():
    output_dir = os.path.join(os.path.dirname(__file__), "parquet")
    os.makedirs(output_dir, exist_ok=True)

    # ccd_failures
    output_path = os.path.join(output_dir, "ccd_failures.parquet")
    rows = generate_rows(ROW_COUNT)
    table = pa.table({
        "site": pa.array([r["site"] for r in rows], type=pa.string()),
        "timestamp": pa.array([r["timestamp"] for r in rows], type=pa.timestamp("us", tz="UTC")),
        "failure_type": pa.array([r["failure_type"] for r in rows], type=pa.string()),
        "document_id": pa.array([r["document_id"] for r in rows], type=pa.string()),
    })
    pq.write_table(table, output_path)
    print(f"Wrote {len(rows)} rows to {output_path}")

    # ccd_sent_to_udm
    udm_output_path = os.path.join(output_dir, "ccd_sent_to_udm.parquet")
    udm_rows = generate_sent_to_udm_rows(UDM_ROW_COUNT)
    udm_table = pa.table({
        "region":      pa.array([r["region"]      for r in udm_rows], type=pa.string()),
        "site":        pa.array([r["site"]        for r in udm_rows], type=pa.string()),
        "timestamp":   pa.array([r["timestamp"]   for r in udm_rows], type=pa.timestamp("us", tz="UTC")),
        "document_id": pa.array([r["document_id"] for r in udm_rows], type=pa.string()),
    })
    pq.write_table(udm_table, udm_output_path)
    print(f"Wrote {len(udm_rows)} rows to {udm_output_path}")


if __name__ == "__main__":
    main()
