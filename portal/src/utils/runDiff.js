/**
 * runDiff.js — Type-specific run comparison utilities.
 *
 * Design: Each artifact type has an explicit comparator function grounded in
 * its published JSON schema. No generic recursive diff — new comparators are
 * added deliberately when schema contracts are known.
 *
 * Comparator inputs and outputs are plain objects with no side-effects,
 * making them straightforward to unit-test.
 *
 * Verified key fields (from src/publisher/validators/):
 *   top_sites       → sites[]      : { site, failures }
 *   exceptions      → exceptions[] : { failure_type, count }
 *   failure_types   → failure_types[]: { failure_type, count }
 *   summary (dlq)   → failures_last_24h, failures_last_7d
 *   summary (ph)    → total_documents_last_24h, active_sites_last_24h
 */

// ---------------------------------------------------------------------------
// Summary comparator
// ---------------------------------------------------------------------------

// Metadata fields and non-numeric fields to skip in summary comparison.
const SUMMARY_SKIP = new Set([
  "schema_version",
  "generated_at",
  "report_ts",
  "latest_event_timestamp", // pipeline_health: timestamp string, not comparable
  "top_sites",              // dlq_operations: compared separately via top_sites artifact
]);

/**
 * compareSummary — compare all numeric fields present in either summary object.
 *
 * Guards against fields missing from one or both objects (schema drift,
 * different dashboard versions). Only fields present as numbers in at least
 * one object are included.
 *
 * @param {object} baseData  - Parsed summary.json from the base run
 * @param {object} targetData - Parsed summary.json from the target run
 * @returns {Array<{field, base, target, delta}>}
 *   base/target are null when the field is absent in that run.
 *   delta is null when either value is missing.
 */
export function compareSummary(baseData, targetData) {
  const allKeys = new Set([...Object.keys(baseData), ...Object.keys(targetData)]);
  const result = [];

  for (const key of allKeys) {
    if (SUMMARY_SKIP.has(key)) continue;

    const bVal = baseData[key];
    const tVal = targetData[key];

    // Skip if neither value is numeric (e.g. unexpected string field)
    if (typeof bVal !== "number" && typeof tVal !== "number") continue;

    const base   = typeof bVal === "number" ? bVal : null;
    const target = typeof tVal === "number" ? tVal : null;
    const delta  = base !== null && target !== null ? target - base : null;

    result.push({ field: key, base, target, delta });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Set-diff comparator (reusable for top_sites, exceptions, failure_types)
// ---------------------------------------------------------------------------

/**
 * compareByKeyCount — diff two arrays of {key, count} items.
 *
 * Returns four buckets:
 *   added    — present in target, absent in base
 *   removed  — present in base, absent in target
 *   changed  — present in both, count differs (sorted by |delta| descending)
 *   unchanged — present in both, same count
 *
 * @param {Array}  baseItems   - Array of objects from base artifact
 * @param {Array}  targetItems - Array of objects from target artifact
 * @param {string} keyField    - Field name used as the unique key (e.g. "site", "failure_type")
 * @param {string} countField  - Field name holding the numeric count (e.g. "failures", "count")
 */
export function compareByKeyCount(baseItems, targetItems, keyField, countField) {
  const baseMap   = new Map((baseItems   ?? []).map(item => [item[keyField], item[countField]]));
  const targetMap = new Map((targetItems ?? []).map(item => [item[keyField], item[countField]]));

  const added     = [];
  const removed   = [];
  const changed   = [];
  const unchanged = [];

  for (const [key, tCount] of targetMap) {
    if (!baseMap.has(key)) {
      added.push({ key, count: tCount });
    } else {
      const bCount = baseMap.get(key);
      const delta  = tCount - bCount;
      if (delta !== 0) {
        changed.push({ key, base: bCount, target: tCount, delta });
      } else {
        unchanged.push({ key, count: tCount });
      }
    }
  }

  for (const [key, bCount] of baseMap) {
    if (!targetMap.has(key)) {
      removed.push({ key, count: bCount });
    }
  }

  // Largest absolute change first — most interesting entries at the top.
  changed.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return { added, removed, changed, unchanged };
}

// ---------------------------------------------------------------------------
// Whitelist — explicit list of comparable artifact types
// ---------------------------------------------------------------------------

/**
 * COMPARE_WHITELIST — Phase 1 comparable artifact types.
 *
 * trend_30d is intentionally excluded: comparing daily time-series arrays
 * row-by-row produces noise rather than signal and requires chart overlay
 * (deferred to Phase 2).
 */
export const COMPARE_WHITELIST = [
  {
    type:    "summary",
    label:   "Summary",
    compare: compareSummary,
  },
  {
    type:    "top_sites",
    label:   "Top Sites",
    compare: (base, target) =>
      compareByKeyCount(base.sites, target.sites, "site", "failures"),
  },
  {
    type:    "exceptions",
    label:   "Exceptions",
    compare: (base, target) =>
      compareByKeyCount(base.exceptions, target.exceptions, "failure_type", "count"),
  },
  {
    type:    "failure_types",
    label:   "Failure Types",
    compare: (base, target) =>
      compareByKeyCount(base.failure_types, target.failure_types, "failure_type", "count"),
  },
];
