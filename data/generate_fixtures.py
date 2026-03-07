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


def _random_timestamp(anchor: datetime, window_days: int) -> datetime:
    offset_seconds = random.randint(0, window_days * 24 * 3600)
    return anchor - timedelta(seconds=offset_seconds)


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


if __name__ == "__main__":
    main()
