/**
 * anomalyPayload.js — Build a normalized LLM input payload from run comparison results.
 *
 * Design: pure function with no side-effects. Takes the already-computed diff
 * results from RunCompare (COMPARE_WHITELIST comparators) and produces a compact,
 * schema-constrained payload for the LLM.
 *
 * The LLM receives only pre-computed deltas — it cannot alter or recompute the
 * numbers displayed in the comparison tables. Deterministic diff remains the
 * source of truth.
 *
 * Payload size: typically < 2 KB (O(compared artifacts × changed items)).
 * The `unchanged` arrays are excluded — they add token cost with no interpretive value.
 */

/**
 * buildAnomalyPayload — construct the normalized diff payload for LLM inference.
 *
 * @param {string} clientId       - Client ID from URL params
 * @param {string} envId          - Environment ID from URL params
 * @param {string} dashboardId    - Dashboard ID from query params
 * @param {string} baseRunId      - Base run ID
 * @param {string} targetRunId    - Target run ID
 * @param {object} compareResults - Map of artifact type → comparator output
 *   Keys are artifact types from COMPARE_WHITELIST (e.g. "summary", "top_sites").
 *   Values are the output of the corresponding comparator function.
 * @param {string[]} missingArtifacts - Artifact types that could not be compared
 *   (present in whitelist but missing from one or both runs)
 * @returns {object} Normalized payload ready for JSON.stringify and LLM consumption
 */
export function buildAnomalyPayload(
  clientId,
  envId,
  dashboardId,
  baseRunId,
  targetRunId,
  compareResults,
  missingArtifacts = [],
) {
  const payload = {
    client_id:     clientId,
    env_id:        envId,
    dashboard_id:  dashboardId,
    base_run_id:   baseRunId,
    target_run_id: targetRunId,
    missing_artifacts: missingArtifacts,
  };

  // summary: compareSummary returns [{field, base, target, delta}]
  if (compareResults?.summary != null) {
    payload.summary_deltas = compareResults.summary;
  }

  // top_sites, exceptions, failure_types: compareByKeyCount returns
  //   {added, removed, changed, unchanged}
  // Exclude `unchanged` — adds token cost with no interpretive value.
  for (const key of ["top_sites", "exceptions", "failure_types"]) {
    if (compareResults?.[key] != null) {
      const { added, removed, changed } = compareResults[key];
      payload[`${key}_diff`] = { added, removed, changed };
    }
  }

  return payload;
}
