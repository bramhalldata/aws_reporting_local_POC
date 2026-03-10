import { describe, test, expect } from "vitest";
import { buildAnomalyPayload } from "./anomalyPayload.js";

// Sample comparator outputs matching the shapes produced by runDiff.js
const SUMMARY_RESULT = [
  { field: "failures_last_24h", base: 42, target: 67, delta: 25 },
  { field: "failures_last_7d",  base: 180, target: 220, delta: 40 },
];

const TOP_SITES_RESULT = {
  added:     [{ key: "site_new", count: 12 }],
  removed:   [{ key: "site_old", count: 3 }],
  changed:   [{ key: "site_x", base: 5, target: 30, delta: 25 }],
  unchanged: [{ key: "site_stable", count: 7 }],
};

const EXCEPTIONS_RESULT = {
  added:     [],
  removed:   [{ key: "timeout", count: 2 }],
  changed:   [],
  unchanged: [{ key: "connection_reset", count: 5 }],
};

describe("buildAnomalyPayload", () => {
  test("includes scope and run identity fields", () => {
    const payload = buildAnomalyPayload(
      "default", "local", "dlq_operations",
      "20260309T140000Z", "20260310T181111Z",
      {}, [],
    );
    expect(payload.client_id).toBe("default");
    expect(payload.env_id).toBe("local");
    expect(payload.dashboard_id).toBe("dlq_operations");
    expect(payload.base_run_id).toBe("20260309T140000Z");
    expect(payload.target_run_id).toBe("20260310T181111Z");
  });

  test("includes summary_deltas when summary comparator result is present", () => {
    const payload = buildAnomalyPayload(
      "default", "local", "dlq_operations",
      "base", "target",
      { summary: SUMMARY_RESULT },
    );
    expect(payload.summary_deltas).toEqual(SUMMARY_RESULT);
  });

  test("excludes summary_deltas when summary result is absent", () => {
    const payload = buildAnomalyPayload(
      "default", "local", "dlq_operations",
      "base", "target",
      { top_sites: TOP_SITES_RESULT },
    );
    expect(payload.summary_deltas).toBeUndefined();
  });

  test("includes top_sites_diff without unchanged array", () => {
    const payload = buildAnomalyPayload(
      "default", "local", "dlq_operations",
      "base", "target",
      { top_sites: TOP_SITES_RESULT },
    );
    expect(payload.top_sites_diff).toBeDefined();
    expect(payload.top_sites_diff.added).toEqual(TOP_SITES_RESULT.added);
    expect(payload.top_sites_diff.removed).toEqual(TOP_SITES_RESULT.removed);
    expect(payload.top_sites_diff.changed).toEqual(TOP_SITES_RESULT.changed);
    expect(payload.top_sites_diff.unchanged).toBeUndefined();
  });

  test("includes exceptions_diff without unchanged array", () => {
    const payload = buildAnomalyPayload(
      "default", "local", "dlq_operations",
      "base", "target",
      { exceptions: EXCEPTIONS_RESULT },
    );
    expect(payload.exceptions_diff).toBeDefined();
    expect(payload.exceptions_diff.unchanged).toBeUndefined();
  });

  test("includes failure_types_diff without unchanged array", () => {
    const payload = buildAnomalyPayload(
      "default", "local", "dlq_operations",
      "base", "target",
      { failure_types: { added: [], removed: [], changed: [], unchanged: [] } },
    );
    expect(payload.failure_types_diff).toBeDefined();
    expect(payload.failure_types_diff.unchanged).toBeUndefined();
  });

  test("lists missing_artifacts correctly", () => {
    const payload = buildAnomalyPayload(
      "default", "local", "dlq_operations",
      "base", "target",
      { summary: SUMMARY_RESULT },
      ["top_sites", "trend_30d"],
    );
    expect(payload.missing_artifacts).toEqual(["top_sites", "trend_30d"]);
  });

  test("missing_artifacts defaults to empty array", () => {
    const payload = buildAnomalyPayload(
      "default", "local", "dlq_operations",
      "base", "target",
      {},
    );
    expect(payload.missing_artifacts).toEqual([]);
  });

  test("handles all whitelisted types together", () => {
    const payload = buildAnomalyPayload(
      "default", "local", "dlq_operations",
      "base", "target",
      {
        summary:       SUMMARY_RESULT,
        top_sites:     TOP_SITES_RESULT,
        exceptions:    EXCEPTIONS_RESULT,
        failure_types: { added: [], removed: [], changed: [], unchanged: [] },
      },
    );
    expect(payload.summary_deltas).toBeDefined();
    expect(payload.top_sites_diff).toBeDefined();
    expect(payload.exceptions_diff).toBeDefined();
    expect(payload.failure_types_diff).toBeDefined();
  });

  test("handles null compareResults gracefully", () => {
    const payload = buildAnomalyPayload(
      "default", "local", "dlq_operations",
      "base", "target",
      null,
    );
    expect(payload.summary_deltas).toBeUndefined();
    expect(payload.top_sites_diff).toBeUndefined();
    expect(payload.missing_artifacts).toEqual([]);
  });

  test("handles empty compareResults gracefully", () => {
    const payload = buildAnomalyPayload(
      "default", "local", "dlq_operations",
      "base", "target",
      {},
    );
    expect(payload.summary_deltas).toBeUndefined();
    expect(payload.top_sites_diff).toBeUndefined();
  });

  test("does not include unexpected keys from compareResults", () => {
    const payload = buildAnomalyPayload(
      "default", "local", "dlq_operations",
      "base", "target",
      { trend_30d: { some: "data" }, summary: SUMMARY_RESULT },
    );
    // trend_30d is not in the whitelist of extracted keys
    expect(payload.trend_30d_diff).toBeUndefined();
    expect(payload.summary_deltas).toBeDefined();
  });

  test("payload is serializable to JSON", () => {
    const payload = buildAnomalyPayload(
      "default", "local", "dlq_operations",
      "base", "target",
      { summary: SUMMARY_RESULT, top_sites: TOP_SITES_RESULT },
      ["trend_30d"],
    );
    expect(() => JSON.stringify(payload)).not.toThrow();
  });
});
