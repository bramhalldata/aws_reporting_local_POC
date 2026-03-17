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


-- =============================================================================
-- sent_to_udm blocks
-- Required blocks: sent_to_udm_summary, sent_to_udm_region_summary,
--                  sent_to_udm_trend_30d, sent_to_udm_lifetime_detail,
--                  sent_to_udm_recent_detail_30d
-- =============================================================================

-- [sent_to_udm_summary]
-- Returns a single row of lifetime and 30-day KPI scalars.
-- Column order is the authoritative contract with the publisher elif branch — do not reorder.
-- 0: total_regions_active  1: total_sites_active   2: total_ccds_sent
-- 3: earliest_event_ts     4: latest_event_ts
-- 5: regions_active_30d    6: sites_active_30d
SELECT
    COUNT(DISTINCT region)  AS total_regions_active,
    COUNT(DISTINCT site)    AS total_sites_active,
    COUNT(*)                AS total_ccds_sent,
    MIN(timestamp)          AS earliest_event_ts,
    MAX(timestamp)          AS latest_event_ts,
    COUNT(DISTINCT CASE
        WHEN timestamp >= TIMESTAMPTZ '{report_ts}' - INTERVAL 30 DAYS
         AND timestamp <= TIMESTAMPTZ '{report_ts}'
        THEN region
    END)                    AS regions_active_30d,
    COUNT(DISTINCT CASE
        WHEN timestamp >= TIMESTAMPTZ '{report_ts}' - INTERVAL 30 DAYS
         AND timestamp <= TIMESTAMPTZ '{report_ts}'
        THEN site
    END)                    AS sites_active_30d
FROM ccd_sent_to_udm;
-- [end]


-- [sent_to_udm_region_summary]
SELECT
    region,
    COUNT(DISTINCT site)  AS site_count,
    COUNT(*)              AS ccd_count,
    MIN(timestamp)        AS first_seen,
    MAX(timestamp)        AS last_seen
FROM ccd_sent_to_udm
GROUP BY region
ORDER BY region ASC;
-- [end]


-- [sent_to_udm_trend_30d]
-- Returns exactly 30 rows (one per day) including days with zero CCDs sent.
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
        COUNT(*) AS ccd_count
    FROM ccd_sent_to_udm
    WHERE timestamp >= TIMESTAMPTZ '{report_ts}' - INTERVAL 30 DAYS
      AND timestamp <= TIMESTAMPTZ '{report_ts}'
    GROUP BY CAST(timestamp AS DATE)
)
SELECT
    ds.date,
    COALESCE(dc.ccd_count, 0) AS ccd_count
FROM date_series ds
LEFT JOIN daily_counts dc ON ds.date = dc.date
ORDER BY ds.date ASC;
-- [end]


-- [sent_to_udm_lifetime_detail]
SELECT
    region,
    site,
    COUNT(*)       AS ccd_count,
    MIN(timestamp) AS first_seen,
    MAX(timestamp) AS last_seen
FROM ccd_sent_to_udm
GROUP BY region, site
ORDER BY region ASC, site ASC;
-- [end]


-- [sent_to_udm_recent_detail_30d]
SELECT
    region,
    site,
    COUNT(*)       AS ccd_count,
    MIN(timestamp) AS first_seen_30d,
    MAX(timestamp) AS last_seen_30d
FROM ccd_sent_to_udm
WHERE timestamp >= TIMESTAMPTZ '{report_ts}' - INTERVAL 30 DAYS
  AND timestamp <= TIMESTAMPTZ '{report_ts}'
GROUP BY region, site
ORDER BY region ASC, site ASC;
-- [end]
