-- =============================================================================
-- athena_views.sql
--
-- LOCAL STAND-IN for AWS Athena reporting logic.
--
-- In production, these query definitions are expressed as Athena CREATE VIEW
-- statements or named queries executed against Parquet gold tables in S3.
-- Locally, they run against the same Parquet files via DuckDB.
--
-- PARAMETERIZATION
-- The publisher substitutes {report_ts} (an ISO-8601 UTC string) before
-- execution so that all metric windows are anchored to a single fixed point
-- in time.  Do NOT use now() or current_timestamp in these queries.
--
-- NAMED BLOCKS
-- The publisher parses named blocks delimited by:
--   -- [block_name]
--   ... SQL ...
--   -- [end]
--
-- Required blocks (dlq_operations):    failures_last_24h, failures_last_7d,
--                                       top_sites_by_failures, trend_30d,
--                                       top_sites_30d, exceptions_7d
-- Required blocks (pipeline_health):   pipeline_docs_24h, pipeline_active_sites_24h,
--                                       pipeline_latest_event, pipeline_failures_by_type_24h
-- =============================================================================


-- [failures_last_24h]
SELECT COUNT(*) AS failures_last_24h
FROM ccd_failures
WHERE timestamp >= TIMESTAMPTZ '{report_ts}' - INTERVAL 24 HOURS
  AND timestamp <= TIMESTAMPTZ '{report_ts}';
-- [end]


-- [failures_last_7d]
SELECT COUNT(*) AS failures_last_7d
FROM ccd_failures
WHERE timestamp >= TIMESTAMPTZ '{report_ts}' - INTERVAL 7 DAYS
  AND timestamp <= TIMESTAMPTZ '{report_ts}';
-- [end]


-- [top_sites_by_failures]
SELECT
    site,
    COUNT(*) AS failures
FROM ccd_failures
WHERE timestamp >= TIMESTAMPTZ '{report_ts}' - INTERVAL 7 DAYS
  AND timestamp <= TIMESTAMPTZ '{report_ts}'
GROUP BY site
ORDER BY failures DESC
LIMIT 10;
-- [end]


-- [trend_30d]
-- Returns exactly 30 rows (one per day) including days with zero failures.
-- GENERATE_SERIES produces the full date spine; LEFT JOIN fills zeros via COALESCE.
WITH date_series AS (
    SELECT CAST(generate_series AS DATE) AS date
    FROM GENERATE_SERIES(
        CAST(TIMESTAMPTZ '{report_ts}' - INTERVAL 29 DAYS AS TIMESTAMP),
        CAST(TIMESTAMPTZ '{report_ts}' AS TIMESTAMP),
        INTERVAL 1 DAY
    )
),
daily_counts AS (
    SELECT
        CAST(timestamp AS DATE) AS date,
        COUNT(*) AS failures
    FROM ccd_failures
    WHERE timestamp >= TIMESTAMPTZ '{report_ts}' - INTERVAL 30 DAYS
      AND timestamp <= TIMESTAMPTZ '{report_ts}'
    GROUP BY CAST(timestamp AS DATE)
)
SELECT
    ds.date,
    COALESCE(dc.failures, 0) AS failures
FROM date_series ds
LEFT JOIN daily_counts dc ON ds.date = dc.date
ORDER BY ds.date ASC;
-- [end]


-- [top_sites_30d]
SELECT
    site,
    COUNT(*) AS failures
FROM ccd_failures
WHERE timestamp >= TIMESTAMPTZ '{report_ts}' - INTERVAL 30 DAYS
  AND timestamp <= TIMESTAMPTZ '{report_ts}'
GROUP BY site
ORDER BY failures DESC
LIMIT 10;
-- [end]


-- [exceptions_7d]
SELECT
    failure_type,
    COUNT(*) AS count
FROM ccd_failures
WHERE timestamp >= TIMESTAMPTZ '{report_ts}' - INTERVAL 7 DAYS
  AND timestamp <= TIMESTAMPTZ '{report_ts}'
GROUP BY failure_type
ORDER BY count DESC;
-- [end]


-- =============================================================================
-- pipeline_health blocks
-- =============================================================================

-- [pipeline_docs_24h]
SELECT COUNT(DISTINCT document_id) AS total_documents
FROM ccd_failures
WHERE timestamp >= TIMESTAMPTZ '{report_ts}' - INTERVAL 24 HOURS
  AND timestamp <= TIMESTAMPTZ '{report_ts}';
-- [end]


-- [pipeline_active_sites_24h]
SELECT COUNT(DISTINCT site) AS active_sites
FROM ccd_failures
WHERE timestamp >= TIMESTAMPTZ '{report_ts}' - INTERVAL 24 HOURS
  AND timestamp <= TIMESTAMPTZ '{report_ts}';
-- [end]


-- [pipeline_latest_event]
SELECT MAX(timestamp) AS latest_event_timestamp
FROM ccd_failures;
-- [end]


-- [pipeline_failures_by_type_24h]
SELECT
    failure_type,
    COUNT(*) AS count
FROM ccd_failures
WHERE timestamp >= TIMESTAMPTZ '{report_ts}' - INTERVAL 24 HOURS
  AND timestamp <= TIMESTAMPTZ '{report_ts}'
GROUP BY failure_type
ORDER BY count DESC;
-- [end]
