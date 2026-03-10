import { describe, it, expect } from "vitest";
import { compareSummary, compareByKeyCount } from "./runDiff.js";

// ---------------------------------------------------------------------------
// compareSummary
// ---------------------------------------------------------------------------

describe("compareSummary", () => {
  it("computes deltas for fields present in both objects", () => {
    const base   = { schema_version: "1.0.0", generated_at: "2026-03-09T12:00:00Z", report_ts: "2026-03-09T12:00:00Z", failures_last_24h: 18, failures_last_7d: 143 };
    const target = { schema_version: "1.0.0", generated_at: "2026-03-09T18:00:00Z", report_ts: "2026-03-09T18:00:00Z", failures_last_24h: 22, failures_last_7d: 130 };

    const result = compareSummary(base, target);

    expect(result).toHaveLength(2);
    const f24 = result.find(r => r.field === "failures_last_24h");
    expect(f24).toEqual({ field: "failures_last_24h", base: 18, target: 22, delta: 4 });
    const f7d = result.find(r => r.field === "failures_last_7d");
    expect(f7d).toEqual({ field: "failures_last_7d", base: 143, target: 130, delta: -13 });
  });

  it("skips metadata fields (schema_version, generated_at, report_ts)", () => {
    const base   = { schema_version: "1.0.0", generated_at: "ts", report_ts: "ts", failures_last_24h: 5 };
    const target = { schema_version: "1.0.0", generated_at: "ts", report_ts: "ts", failures_last_24h: 10 };

    const result = compareSummary(base, target);
    const fields = result.map(r => r.field);

    expect(fields).not.toContain("schema_version");
    expect(fields).not.toContain("generated_at");
    expect(fields).not.toContain("report_ts");
    expect(fields).toContain("failures_last_24h");
  });

  it("skips top_sites array (compared separately via top_sites artifact)", () => {
    const base   = { failures_last_24h: 5, top_sites: [{ site: "a", failures: 3 }] };
    const target = { failures_last_24h: 8, top_sites: [{ site: "b", failures: 1 }] };

    const result = compareSummary(base, target);
    const fields = result.map(r => r.field);

    expect(fields).not.toContain("top_sites");
    expect(fields).toContain("failures_last_24h");
  });

  it("skips latest_event_timestamp (pipeline_health: non-comparable timestamp string)", () => {
    const base   = { total_documents_last_24h: 100, latest_event_timestamp: "2026-03-09T12:00:00Z" };
    const target = { total_documents_last_24h: 120, latest_event_timestamp: "2026-03-09T18:00:00Z" };

    const result = compareSummary(base, target);
    const fields = result.map(r => r.field);

    expect(fields).not.toContain("latest_event_timestamp");
    expect(fields).toContain("total_documents_last_24h");
  });

  it("returns null base when field is missing from base run (schema drift guard)", () => {
    const base   = { failures_last_24h: 18 };
    const target = { failures_last_24h: 22, failures_last_7d: 130 };

    const result = compareSummary(base, target);
    const f7d = result.find(r => r.field === "failures_last_7d");

    expect(f7d).toEqual({ field: "failures_last_7d", base: null, target: 130, delta: null });
  });

  it("returns null target when field is missing from target run (schema drift guard)", () => {
    const base   = { failures_last_24h: 18, failures_last_7d: 143 };
    const target = { failures_last_24h: 22 };

    const result = compareSummary(base, target);
    const f7d = result.find(r => r.field === "failures_last_7d");

    expect(f7d).toEqual({ field: "failures_last_7d", base: 143, target: null, delta: null });
  });

  it("returns empty array when both summaries contain only metadata", () => {
    const base   = { schema_version: "1.0.0", generated_at: "ts", report_ts: "ts" };
    const target = { schema_version: "1.0.0", generated_at: "ts", report_ts: "ts" };

    expect(compareSummary(base, target)).toEqual([]);
  });

  it("returns zero delta when values are equal", () => {
    const base   = { failures_last_24h: 18 };
    const target = { failures_last_24h: 18 };

    const result = compareSummary(base, target);
    expect(result[0]).toEqual({ field: "failures_last_24h", base: 18, target: 18, delta: 0 });
  });
});

// ---------------------------------------------------------------------------
// compareByKeyCount
// ---------------------------------------------------------------------------

describe("compareByKeyCount", () => {
  const base = [
    { site: "alpha", failures: 10 },
    { site: "bravo", failures: 20 },
    { site: "charlie", failures: 5 },
  ];
  const target = [
    { site: "bravo",  failures: 25 },  // changed +5
    { site: "charlie", failures: 5 },  // unchanged
    { site: "delta",  failures: 8 },   // added
  ];

  it("correctly identifies added, removed, changed, and unchanged items", () => {
    const result = compareByKeyCount(base, target, "site", "failures");

    expect(result.added).toHaveLength(1);
    expect(result.added[0]).toEqual({ key: "delta", count: 8 });

    expect(result.removed).toHaveLength(1);
    expect(result.removed[0]).toEqual({ key: "alpha", count: 10 });

    expect(result.changed).toHaveLength(1);
    expect(result.changed[0]).toEqual({ key: "bravo", base: 20, target: 25, delta: 5 });

    expect(result.unchanged).toHaveLength(1);
    expect(result.unchanged[0]).toEqual({ key: "charlie", count: 5 });
  });

  it("sorts changed items by absolute delta descending", () => {
    const b = [
      { failure_type: "A", count: 10 },
      { failure_type: "B", count: 5 },
      { failure_type: "C", count: 100 },
    ];
    const t = [
      { failure_type: "A", count: 11 },  // delta +1
      { failure_type: "B", count: 2 },   // delta -3
      { failure_type: "C", count: 150 }, // delta +50
    ];

    const result = compareByKeyCount(b, t, "failure_type", "count");

    expect(result.changed[0].key).toBe("C");   // |50| largest
    expect(result.changed[1].key).toBe("B");   // |3|
    expect(result.changed[2].key).toBe("A");   // |1|
  });

  it("handles empty base array (all target items are added)", () => {
    const result = compareByKeyCount([], target, "site", "failures");

    expect(result.added).toHaveLength(target.length);
    expect(result.removed).toHaveLength(0);
    expect(result.changed).toHaveLength(0);
    expect(result.unchanged).toHaveLength(0);
  });

  it("handles empty target array (all base items are removed)", () => {
    const result = compareByKeyCount(base, [], "site", "failures");

    expect(result.removed).toHaveLength(base.length);
    expect(result.added).toHaveLength(0);
    expect(result.changed).toHaveLength(0);
    expect(result.unchanged).toHaveLength(0);
  });

  it("handles null base array gracefully", () => {
    const result = compareByKeyCount(null, target, "site", "failures");

    expect(result.added).toHaveLength(target.length);
    expect(result.removed).toHaveLength(0);
  });

  it("handles null target array gracefully", () => {
    const result = compareByKeyCount(base, null, "site", "failures");

    expect(result.removed).toHaveLength(base.length);
    expect(result.added).toHaveLength(0);
  });

  it("works with failure_type key field (exceptions and failure_types artifacts)", () => {
    const b = [{ failure_type: "TIMEOUT", count: 5 }, { failure_type: "AUTH", count: 2 }];
    const t = [{ failure_type: "TIMEOUT", count: 8 }, { failure_type: "CONN", count: 3 }];

    const result = compareByKeyCount(b, t, "failure_type", "count");

    expect(result.changed[0]).toEqual({ key: "TIMEOUT", base: 5, target: 8, delta: 3 });
    expect(result.removed[0]).toEqual({ key: "AUTH", count: 2 });
    expect(result.added[0]).toEqual({ key: "CONN", count: 3 });
  });

  it("returns all unchanged when base and target are identical", () => {
    const items = [{ site: "x", failures: 7 }, { site: "y", failures: 3 }];
    const result = compareByKeyCount(items, items, "site", "failures");

    expect(result.unchanged).toHaveLength(2);
    expect(result.added).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
    expect(result.changed).toHaveLength(0);
  });

  it("handles both arrays empty", () => {
    const result = compareByKeyCount([], [], "site", "failures");

    expect(result.added).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
    expect(result.changed).toHaveLength(0);
    expect(result.unchanged).toHaveLength(0);
  });
});
