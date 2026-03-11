/**
 * runHealth.js — Deterministic run health classification.
 *
 * Classifies a run comparison as one of:
 *   Critical (4) — large regression or data quality failure
 *   Warning  (3) — notable degradation or new failure categories
 *   Stable   (2) — no significant change
 *   Healthy  (1) — meaningful improvement in key metrics
 *   Unknown  (0) — insufficient data to classify
 *
 * Design principles:
 *   - Pure function: same inputs → same output, every time
 *   - No LLM involvement: every label is the result of named rules with explicit thresholds
 *   - Reads from comparison outputs (runDiff.js) — never from raw artifacts
 *   - Max severity wins: if Warning and Healthy both fire, result is Warning
 *
 * Failure field heuristic (Phase 1):
 *   Summary fields whose name contains "failure" (case-insensitive) are treated as
 *   failure metrics. Examples: failures_last_24h, failures_last_7d.
 *   An increase in a failure metric is bad; a decrease is good.
 *   Other numeric summary fields (total_documents_last_24h, active_sites_last_24h)
 *   are not evaluated by failure-specific rules in Phase 1.
 *
 * Usable data definition (for Unknown fallback):
 *   Usable data exists when at least one of the following is true:
 *     (a) summaryDeltas has at least one delta entry (numeric field compared)
 *     (b) any set-diff result (top_sites / exceptions / failure_types) is non-null
 *   If neither condition is met, no rules can produce meaningful signal → Unknown.
 */

// ---------------------------------------------------------------------------
// Severity constants
// ---------------------------------------------------------------------------

export const SEVERITY = {
  UNKNOWN:  0,
  HEALTHY:  1,
  STABLE:   2,
  WARNING:  3,
  CRITICAL: 4,
};

const SEVERITY_TO_CLASS = {
  [SEVERITY.UNKNOWN]:  "Unknown",
  [SEVERITY.HEALTHY]:  "Healthy",
  [SEVERITY.STABLE]:   "Stable",
  [SEVERITY.WARNING]:  "Warning",
  [SEVERITY.CRITICAL]: "Critical",
};

// ---------------------------------------------------------------------------
// Threshold constants (exported — Phase 2 may introduce per-dashboard overrides)
// ---------------------------------------------------------------------------

export const HEALTH_THRESHOLDS = {
  FAILURE_CRITICAL_RATIO:     1.0,   // delta/base > 1.0  → Critical (more than doubled)
  FAILURE_WARNING_RATIO:      0.25,  // delta/base > 0.25 → Warning  (25%+ increase)
  FAILURE_HEALTHY_RATIO:     -0.20,  // delta/base < -0.20 → Healthy  (20%+ reduction)
  NEW_FAILURE_TYPES_CRITICAL: 3,     // >= 3 new failure types → Critical
  // NOTE: WARNING fires only when added.length is >= 1 AND < CRITICAL threshold
  // This ensures the two new-failure-type rules are mutually exclusive.
};

// ---------------------------------------------------------------------------
// Internal normalization
// ---------------------------------------------------------------------------

/**
 * isFailureField — Phase 1 heuristic: a summary field is a failure metric if its
 * name contains "failure" (case-insensitive).
 *
 * Matches:  failures_last_24h, failures_last_7d, total_failure_count, etc.
 * Excludes: total_documents_last_24h, active_sites_last_24h, etc.
 */
function isFailureField(fieldName) {
  return fieldName.toLowerCase().includes("failure");
}

/**
 * buildHealthInput — normalize the raw comparisons array into classifier inputs.
 *
 * @param {Array} comparisons - Items from RunCompare loadCompare()
 * @returns {object} { summaryDeltas, setDiffs, artifactErrors, hasUsableData }
 */
function buildHealthInput(comparisons) {
  const summaryComp   = comparisons.find(c => c.type === "summary");
  const summaryDeltas = Array.isArray(summaryComp?.diffResult) ? summaryComp.diffResult : [];

  const setDiffs = {
    top_sites:     comparisons.find(c => c.type === "top_sites")?.diffResult     ?? null,
    exceptions:    comparisons.find(c => c.type === "exceptions")?.diffResult    ?? null,
    failure_types: comparisons.find(c => c.type === "failure_types")?.diffResult ?? null,
  };

  // Artifact errors: fetch failed OR compare() threw, for any whitelisted type
  const artifactErrors = comparisons
    .filter(c => c.bFetchError || c.tFetchError || c.diffError)
    .map(c => c.type);

  // Usable data: at least one delta entry OR at least one non-null set-diff
  const hasUsableData =
    summaryDeltas.length > 0 ||
    Object.values(setDiffs).some(d => d !== null);

  return { summaryDeltas, setDiffs, artifactErrors, hasUsableData };
}

// ---------------------------------------------------------------------------
// Rule definitions
// ---------------------------------------------------------------------------

/**
 * RULES — array of named rule evaluators.
 *
 * Rules are evaluated in sequence. All triggered rules contribute to the final
 * classification. The highest severity among triggered rules wins.
 *
 * Each rule: { id, severity, evaluate(input) → {triggered, reason} }
 */
const RULES = [
  // ── Summary delta rules (failure fields only) ────────────────────────────

  {
    id:       "CRITICAL_FAILURE_SPIKE",
    severity: SEVERITY.CRITICAL,
    evaluate({ summaryDeltas }) {
      const triggered = [];
      for (const { field, base, target, delta } of summaryDeltas) {
        if (!isFailureField(field)) continue;
        if (base === null || base === 0 || delta === null) continue;
        if (delta / base > HEALTH_THRESHOLDS.FAILURE_CRITICAL_RATIO) {
          triggered.push(`${field} more than doubled (${base} → ${target}, +${delta})`);
        }
      }
      return triggered.length > 0
        ? { triggered: true,  reason: triggered.join("; ") }
        : { triggered: false, reason: null };
    },
  },

  {
    id:       "WARNING_FAILURE_INCREASE",
    severity: SEVERITY.WARNING,
    evaluate({ summaryDeltas }) {
      const triggered = [];
      for (const { field, base, target, delta } of summaryDeltas) {
        if (!isFailureField(field)) continue;
        if (base === null || base === 0 || delta === null) continue;
        const ratio = delta / base;
        if (ratio > HEALTH_THRESHOLDS.FAILURE_WARNING_RATIO &&
            ratio <= HEALTH_THRESHOLDS.FAILURE_CRITICAL_RATIO) {
          const pct = Math.round(ratio * 100);
          triggered.push(`${field} increased ${pct}% (${base} → ${target})`);
        }
      }
      return triggered.length > 0
        ? { triggered: true,  reason: triggered.join("; ") }
        : { triggered: false, reason: null };
    },
  },

  {
    id:       "HEALTHY_FAILURE_REDUCTION",
    severity: SEVERITY.HEALTHY,
    evaluate({ summaryDeltas }) {
      const triggered = [];
      for (const { field, base, target, delta } of summaryDeltas) {
        if (!isFailureField(field)) continue;
        if (base === null || base === 0 || delta === null) continue;
        const ratio = delta / base;
        if (ratio < HEALTH_THRESHOLDS.FAILURE_HEALTHY_RATIO) {
          const pct = Math.round(Math.abs(ratio) * 100);
          triggered.push(`${field} reduced ${pct}% (${base} → ${target})`);
        }
      }
      return triggered.length > 0
        ? { triggered: true,  reason: triggered.join("; ") }
        : { triggered: false, reason: null };
    },
  },

  {
    id:       "WARNING_FAILURES_APPEARED",
    severity: SEVERITY.WARNING,
    evaluate({ summaryDeltas }) {
      // Handles base = 0 → target > 0; ratio-based rules cannot handle zero baseline.
      const triggered = [];
      for (const { field, base, target } of summaryDeltas) {
        if (!isFailureField(field)) continue;
        if (base === 0 && target > 0) {
          triggered.push(`${field} went from 0 to ${target} (new failures)`);
        }
      }
      return triggered.length > 0
        ? { triggered: true,  reason: triggered.join("; ") }
        : { triggered: false, reason: null };
    },
  },

  // ── Set-diff rules (new failure types — mutually exclusive) ──────────────
  //
  // Rules 5 and 6 are mutually exclusive by design:
  //   CRITICAL fires when added.length >= CRITICAL threshold (3)
  //   WARNING fires only when added.length < CRITICAL threshold
  // This ensures the same event is reported exactly once.

  {
    id:       "CRITICAL_MANY_NEW_FAILURE_TYPES",
    severity: SEVERITY.CRITICAL,
    evaluate({ setDiffs }) {
      const allAdded = [
        ...(setDiffs.exceptions?.added    ?? []),
        ...(setDiffs.failure_types?.added ?? []),
      ];
      if (allAdded.length >= HEALTH_THRESHOLDS.NEW_FAILURE_TYPES_CRITICAL) {
        const names = allAdded.map(a => a.key).join(", ");
        return {
          triggered: true,
          reason:    `${allAdded.length} new failure types appeared: ${names}`,
        };
      }
      return { triggered: false, reason: null };
    },
  },

  {
    id:       "WARNING_NEW_FAILURE_TYPE",
    severity: SEVERITY.WARNING,
    evaluate({ setDiffs }) {
      const allAdded = [
        ...(setDiffs.exceptions?.added    ?? []),
        ...(setDiffs.failure_types?.added ?? []),
      ];
      // Mutually exclusive with CRITICAL_MANY_NEW_FAILURE_TYPES:
      // only fires when count is below the critical threshold.
      if (allAdded.length >= 1 &&
          allAdded.length < HEALTH_THRESHOLDS.NEW_FAILURE_TYPES_CRITICAL) {
        const names = allAdded.map(a => a.key).join(", ");
        return {
          triggered: true,
          reason:    `${allAdded.length} new failure type(s): ${names}`,
        };
      }
      return { triggered: false, reason: null };
    },
  },

  // ── Artifact error rule ──────────────────────────────────────────────────
  //
  // Covers both fetch errors (bFetchError / tFetchError) and compare() errors
  // (diffError). Combined under a single rule for Phase 1 simplicity.

  {
    id:       "WARNING_ARTIFACT_ERROR",
    severity: SEVERITY.WARNING,
    evaluate({ artifactErrors }) {
      if (artifactErrors.length > 0) {
        return {
          triggered: true,
          reason:    `Artifact error for: ${artifactErrors.join(", ")}`,
        };
      }
      return { triggered: false, reason: null };
    },
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * classifyRunHealth — classify a run comparison as a deterministic health label.
 *
 * @param {Array} comparisons - The comparisons array from RunCompare.loadCompare().
 *   Each item: { type, diffResult, diffError, bFetchError, tFetchError, ... }
 *
 * @returns {{
 *   classification: "Critical"|"Warning"|"Stable"|"Healthy"|"Unknown",
 *   severity: 0|1|2|3|4,
 *   reasons: string[],
 *   triggered_rules: string[],
 * }}
 *
 * classification is always populated — never null.
 */
export function classifyRunHealth(comparisons) {
  if (!Array.isArray(comparisons) || comparisons.length === 0) {
    return {
      classification: "Unknown",
      severity:       SEVERITY.UNKNOWN,
      reasons:        ["No comparison data available."],
      triggered_rules: [],
    };
  }

  const input = buildHealthInput(comparisons);

  // Run all rules, collect triggered results
  const fired = [];
  for (const rule of RULES) {
    const result = rule.evaluate(input);
    if (result.triggered) {
      fired.push({ id: rule.id, severity: rule.severity, reason: result.reason });
    }
  }

  // Unknown fallback: no rules fired AND no usable data to evaluate
  if (fired.length === 0 && !input.hasUsableData) {
    return {
      classification: "Unknown",
      severity:       SEVERITY.UNKNOWN,
      reasons:        ["Insufficient comparison data to classify."],
      triggered_rules: [],
    };
  }

  // Stable: no rules fired but usable data exists — no significant changes detected
  if (fired.length === 0) {
    return {
      classification: "Stable",
      severity:       SEVERITY.STABLE,
      reasons:        ["No significant changes detected."],
      triggered_rules: [],
    };
  }

  // Aggregate: highest severity wins
  const maxSeverity = Math.max(...fired.map(r => r.severity));
  return {
    classification:  SEVERITY_TO_CLASS[maxSeverity],
    severity:        maxSeverity,
    reasons:         fired.map(r => r.reason),
    triggered_rules: fired.map(r => r.id),
  };
}
