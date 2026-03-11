import { describe, test, expect } from "vitest";
import { classifyRunHealth, SEVERITY } from "./runHealth.js";

// ---------------------------------------------------------------------------
// Helpers — build minimal comparisons arrays for testing
// ---------------------------------------------------------------------------

function makeSummaryComp(deltas, opts = {}) {
  return {
    type:        "summary",
    diffResult:  deltas,
    diffError:   opts.diffError   ?? null,
    bFetchError: opts.bFetchError ?? null,
    tFetchError: opts.tFetchError ?? null,
    bArtifact:   {},
    tArtifact:   {},
  };
}

function makeSetDiffComp(type, diff, opts = {}) {
  return {
    type,
    diffResult:  diff,
    diffError:   opts.diffError   ?? null,
    bFetchError: opts.bFetchError ?? null,
    tFetchError: opts.tFetchError ?? null,
    bArtifact:   {},
    tArtifact:   {},
  };
}

function emptySetDiff() {
  return { added: [], removed: [], changed: [], unchanged: [] };
}

// ---------------------------------------------------------------------------
// Critical — failure doubled or more
// ---------------------------------------------------------------------------

describe("classifyRunHealth — Critical", () => {
  test("CRITICAL_FAILURE_SPIKE when failures_last_24h doubles", () => {
    const result = classifyRunHealth([
      makeSummaryComp([{ field: "failures_last_24h", base: 42, target: 90, delta: 48 }]),
    ]);
    expect(result.classification).toBe("Critical");
    expect(result.severity).toBe(SEVERITY.CRITICAL);
    expect(result.triggered_rules).toContain("CRITICAL_FAILURE_SPIKE");
  });

  test("CRITICAL_FAILURE_SPIKE when failures_last_7d more than doubles", () => {
    const result = classifyRunHealth([
      makeSummaryComp([{ field: "failures_last_7d", base: 100, target: 220, delta: 120 }]),
    ]);
    expect(result.classification).toBe("Critical");
    expect(result.triggered_rules).toContain("CRITICAL_FAILURE_SPIKE");
  });

  test("CRITICAL_MANY_NEW_FAILURE_TYPES when 3+ new types in exceptions", () => {
    const result = classifyRunHealth([
      makeSummaryComp([]),
      makeSetDiffComp("exceptions", {
        ...emptySetDiff(),
        added: [
          { key: "timeout_error", count: 5 },
          { key: "auth_failure", count: 3 },
          { key: "rate_limit", count: 1 },
        ],
      }),
    ]);
    expect(result.classification).toBe("Critical");
    expect(result.triggered_rules).toContain("CRITICAL_MANY_NEW_FAILURE_TYPES");
    expect(result.triggered_rules).not.toContain("WARNING_NEW_FAILURE_TYPE");
  });

  test("CRITICAL_MANY_NEW_FAILURE_TYPES when types spread across exceptions and failure_types", () => {
    const result = classifyRunHealth([
      makeSummaryComp([]),
      makeSetDiffComp("exceptions",    { ...emptySetDiff(), added: [{ key: "type_a", count: 1 }, { key: "type_b", count: 2 }] }),
      makeSetDiffComp("failure_types", { ...emptySetDiff(), added: [{ key: "type_c", count: 1 }] }),
    ]);
    expect(result.classification).toBe("Critical");
    expect(result.triggered_rules).toContain("CRITICAL_MANY_NEW_FAILURE_TYPES");
    expect(result.triggered_rules).not.toContain("WARNING_NEW_FAILURE_TYPE");
  });
});

// ---------------------------------------------------------------------------
// Warning
// ---------------------------------------------------------------------------

describe("classifyRunHealth — Warning", () => {
  test("WARNING_FAILURE_INCREASE when failures up 30%", () => {
    const result = classifyRunHealth([
      makeSummaryComp([{ field: "failures_last_24h", base: 100, target: 130, delta: 30 }]),
    ]);
    expect(result.classification).toBe("Warning");
    expect(result.triggered_rules).toContain("WARNING_FAILURE_INCREASE");
  });

  test("WARNING_FAILURE_INCREASE at exactly 25% boundary", () => {
    // delta/base = 0.25 is not strictly greater than FAILURE_WARNING_RATIO (0.25)
    // so this should NOT trigger WARNING_FAILURE_INCREASE
    const result = classifyRunHealth([
      makeSummaryComp([{ field: "failures_last_24h", base: 100, target: 125, delta: 25 }]),
    ]);
    expect(result.triggered_rules).not.toContain("WARNING_FAILURE_INCREASE");
  });

  test("WARNING_FAILURE_INCREASE just above 25% boundary", () => {
    const result = classifyRunHealth([
      makeSummaryComp([{ field: "failures_last_24h", base: 100, target: 126, delta: 26 }]),
    ]);
    expect(result.classification).toBe("Warning");
    expect(result.triggered_rules).toContain("WARNING_FAILURE_INCREASE");
  });

  test("WARNING_FAILURES_APPEARED when base = 0 and target > 0", () => {
    const result = classifyRunHealth([
      makeSummaryComp([{ field: "failures_last_24h", base: 0, target: 5, delta: 5 }]),
    ]);
    expect(result.classification).toBe("Warning");
    expect(result.triggered_rules).toContain("WARNING_FAILURES_APPEARED");
  });

  test("WARNING_NEW_FAILURE_TYPE when 1 new failure type", () => {
    const result = classifyRunHealth([
      makeSummaryComp([]),
      makeSetDiffComp("exceptions", {
        ...emptySetDiff(),
        added: [{ key: "connection_timeout", count: 3 }],
      }),
    ]);
    expect(result.classification).toBe("Warning");
    expect(result.triggered_rules).toContain("WARNING_NEW_FAILURE_TYPE");
    expect(result.triggered_rules).not.toContain("CRITICAL_MANY_NEW_FAILURE_TYPES");
  });

  test("WARNING_NEW_FAILURE_TYPE when 2 new failure types (below critical threshold)", () => {
    const result = classifyRunHealth([
      makeSummaryComp([]),
      makeSetDiffComp("failure_types", {
        ...emptySetDiff(),
        added: [{ key: "type_a", count: 1 }, { key: "type_b", count: 2 }],
      }),
    ]);
    expect(result.classification).toBe("Warning");
    expect(result.triggered_rules).toContain("WARNING_NEW_FAILURE_TYPE");
    expect(result.triggered_rules).not.toContain("CRITICAL_MANY_NEW_FAILURE_TYPES");
  });

  test("WARNING_ARTIFACT_ERROR when bFetchError present", () => {
    const result = classifyRunHealth([
      makeSummaryComp([]),
      makeSetDiffComp("top_sites", null, { bFetchError: "HTTP 404" }),
    ]);
    expect(result.classification).toBe("Warning");
    expect(result.triggered_rules).toContain("WARNING_ARTIFACT_ERROR");
  });

  test("WARNING_ARTIFACT_ERROR when diffError present", () => {
    const result = classifyRunHealth([
      makeSummaryComp([], { diffError: "TypeError: cannot read property" }),
    ]);
    expect(result.classification).toBe("Warning");
    expect(result.triggered_rules).toContain("WARNING_ARTIFACT_ERROR");
  });
});

// ---------------------------------------------------------------------------
// Stable
// ---------------------------------------------------------------------------

describe("classifyRunHealth — Stable", () => {
  test("Stable when failure change is within 25% threshold", () => {
    const result = classifyRunHealth([
      makeSummaryComp([{ field: "failures_last_24h", base: 100, target: 110, delta: 10 }]),
    ]);
    expect(result.classification).toBe("Stable");
    expect(result.triggered_rules).toHaveLength(0);
    expect(result.reasons).toContain("No significant changes detected.");
  });

  test("Stable when failures unchanged (delta = 0)", () => {
    const result = classifyRunHealth([
      makeSummaryComp([{ field: "failures_last_24h", base: 42, target: 42, delta: 0 }]),
    ]);
    expect(result.classification).toBe("Stable");
  });

  test("Stable when only non-failure summary fields present", () => {
    const result = classifyRunHealth([
      makeSummaryComp([
        { field: "total_documents_last_24h", base: 1000, target: 1050, delta: 50 },
        { field: "active_sites_last_24h",    base: 20,   target: 22,   delta: 2  },
      ]),
    ]);
    // Non-failure fields don't trigger failure rules → Stable (with usable data)
    expect(result.classification).toBe("Stable");
  });

  test("Stable when set-diffs have no added/removed/changed items", () => {
    const result = classifyRunHealth([
      makeSummaryComp([{ field: "failures_last_24h", base: 100, target: 105, delta: 5 }]),
      makeSetDiffComp("exceptions", emptySetDiff()),
    ]);
    expect(result.classification).toBe("Stable");
  });
});

// ---------------------------------------------------------------------------
// Healthy
// ---------------------------------------------------------------------------

describe("classifyRunHealth — Healthy", () => {
  test("Healthy when failures_last_24h reduced 25%", () => {
    const result = classifyRunHealth([
      makeSummaryComp([{ field: "failures_last_24h", base: 100, target: 75, delta: -25 }]),
    ]);
    expect(result.classification).toBe("Healthy");
    expect(result.triggered_rules).toContain("HEALTHY_FAILURE_REDUCTION");
  });

  test("Healthy when failures_last_7d reduced 30%", () => {
    const result = classifyRunHealth([
      makeSummaryComp([{ field: "failures_last_7d", base: 200, target: 140, delta: -60 }]),
    ]);
    expect(result.classification).toBe("Healthy");
  });

  test("Healthy does NOT fire at exactly -20% boundary (not strictly less than -0.20)", () => {
    const result = classifyRunHealth([
      makeSummaryComp([{ field: "failures_last_24h", base: 100, target: 80, delta: -20 }]),
    ]);
    expect(result.triggered_rules).not.toContain("HEALTHY_FAILURE_REDUCTION");
    expect(result.classification).toBe("Stable");
  });
});

// ---------------------------------------------------------------------------
// Warning wins over Healthy (max severity aggregation)
// ---------------------------------------------------------------------------

describe("classifyRunHealth — aggregation", () => {
  test("Warning wins over Healthy when both fire", () => {
    const result = classifyRunHealth([
      makeSummaryComp([
        { field: "failures_last_24h", base: 100, target: 75,  delta: -25  }, // Healthy
        { field: "failures_last_7d",  base: 100, target: 135, delta:  35  }, // Warning
      ]),
    ]);
    expect(result.classification).toBe("Warning");
    expect(result.triggered_rules).toContain("HEALTHY_FAILURE_REDUCTION");
    expect(result.triggered_rules).toContain("WARNING_FAILURE_INCREASE");
    expect(result.reasons.length).toBeGreaterThanOrEqual(2);
  });

  test("Critical wins over Warning and Healthy", () => {
    const result = classifyRunHealth([
      makeSummaryComp([
        { field: "failures_last_24h", base: 40,  target: 20,  delta: -20  }, // Healthy
        { field: "failures_last_7d",  base: 100, target: 210, delta: 110  }, // Critical
      ]),
    ]);
    expect(result.classification).toBe("Critical");
  });
});

// ---------------------------------------------------------------------------
// Mutual exclusivity — failure-type rules
// ---------------------------------------------------------------------------

describe("classifyRunHealth — mutual exclusivity of failure-type rules", () => {
  test("exactly CRITICAL_MANY_NEW_FAILURE_TYPES fires (not both) when added.length >= 3", () => {
    const result = classifyRunHealth([
      makeSummaryComp([]),
      makeSetDiffComp("exceptions", {
        ...emptySetDiff(),
        added: [
          { key: "type_a", count: 1 },
          { key: "type_b", count: 2 },
          { key: "type_c", count: 3 },
        ],
      }),
    ]);
    expect(result.triggered_rules).toContain("CRITICAL_MANY_NEW_FAILURE_TYPES");
    expect(result.triggered_rules).not.toContain("WARNING_NEW_FAILURE_TYPE");
  });

  test("exactly WARNING_NEW_FAILURE_TYPE fires (not both) when added.length = 2", () => {
    const result = classifyRunHealth([
      makeSummaryComp([]),
      makeSetDiffComp("exceptions", {
        ...emptySetDiff(),
        added: [{ key: "type_a", count: 1 }, { key: "type_b", count: 2 }],
      }),
    ]);
    expect(result.triggered_rules).toContain("WARNING_NEW_FAILURE_TYPE");
    expect(result.triggered_rules).not.toContain("CRITICAL_MANY_NEW_FAILURE_TYPES");
  });
});

// ---------------------------------------------------------------------------
// Unknown
// ---------------------------------------------------------------------------

describe("classifyRunHealth — Unknown", () => {
  test("Unknown when comparisons is empty array", () => {
    const result = classifyRunHealth([]);
    expect(result.classification).toBe("Unknown");
    expect(result.severity).toBe(SEVERITY.UNKNOWN);
  });

  test("Unknown when comparisons is null/undefined", () => {
    expect(classifyRunHealth(null).classification).toBe("Unknown");
    expect(classifyRunHealth(undefined).classification).toBe("Unknown");
  });

  test("Unknown when all diffResults are null and no errors", () => {
    const result = classifyRunHealth([
      { type: "summary",       diffResult: null, diffError: null, bFetchError: null, tFetchError: null, bArtifact: null, tArtifact: null },
      { type: "top_sites",     diffResult: null, diffError: null, bFetchError: null, tFetchError: null, bArtifact: null, tArtifact: null },
      { type: "exceptions",    diffResult: null, diffError: null, bFetchError: null, tFetchError: null, bArtifact: null, tArtifact: null },
      { type: "failure_types", diffResult: null, diffError: null, bFetchError: null, tFetchError: null, bArtifact: null, tArtifact: null },
    ]);
    expect(result.classification).toBe("Unknown");
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("classifyRunHealth — edge cases", () => {
  test("null delta is skipped gracefully (does not trigger failure rules)", () => {
    const result = classifyRunHealth([
      makeSummaryComp([{ field: "failures_last_24h", base: null, target: 5, delta: null }]),
    ]);
    expect(result.triggered_rules).not.toContain("CRITICAL_FAILURE_SPIKE");
    expect(result.triggered_rules).not.toContain("WARNING_FAILURE_INCREASE");
  });

  test("base = 0 and target = 0 does not trigger any failure rule", () => {
    const result = classifyRunHealth([
      makeSummaryComp([{ field: "failures_last_24h", base: 0, target: 0, delta: 0 }]),
    ]);
    expect(result.triggered_rules).not.toContain("WARNING_FAILURES_APPEARED");
    expect(result.classification).toBe("Stable");
  });

  test("non-failure summary fields do not trigger failure rules", () => {
    const result = classifyRunHealth([
      makeSummaryComp([
        // Doubles, but NOT a failure field
        { field: "total_documents_last_24h", base: 100, target: 210, delta: 110 },
      ]),
    ]);
    expect(result.triggered_rules).not.toContain("CRITICAL_FAILURE_SPIKE");
    expect(result.classification).toBe("Stable");
  });

  test("tFetchError triggers WARNING_ARTIFACT_ERROR", () => {
    const result = classifyRunHealth([
      makeSummaryComp([]),
      makeSetDiffComp("failure_types", null, { tFetchError: "HTTP 500" }),
    ]);
    expect(result.triggered_rules).toContain("WARNING_ARTIFACT_ERROR");
  });
});
