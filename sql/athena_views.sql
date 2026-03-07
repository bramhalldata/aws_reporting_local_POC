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
-- Required blocks: failures_last_24h, failures_last_7d, top_sites_by_failures
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
