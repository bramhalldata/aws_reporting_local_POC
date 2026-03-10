import { describe, it, expect } from "vitest";
import { targetUrl, resolveEnv } from "./selectorNav.js";

const DASHBOARD_IDS = ["dlq_operations", "pipeline_health"];
const CLIENT = "default";
const ENV = "local";

// ─── targetUrl ────────────────────────────────────────────────────────────────

describe("targetUrl — route preservation", () => {
  it("preserves dashboard route when on a known dashboard page", () => {
    const result = targetUrl(
      "contexture", "prod",
      CLIENT, ENV,
      "/default/local/dlq_operations",
      DASHBOARD_IDS,
    );
    expect(result).toBe("/contexture/prod/dlq_operations");
  });

  it("preserves the second dashboard route", () => {
    const result = targetUrl(
      "contexture", "local",
      CLIENT, ENV,
      "/default/local/pipeline_health",
      DASHBOARD_IDS,
    );
    expect(result).toBe("/contexture/local/pipeline_health");
  });

  it("preserves /history when on the history list", () => {
    const result = targetUrl(
      "contexture", "prod",
      CLIENT, ENV,
      "/default/local/history",
      DASHBOARD_IDS,
    );
    expect(result).toBe("/contexture/prod/history");
  });

  it("resets to /history when on a run detail page", () => {
    const result = targetUrl(
      "contexture", "prod",
      CLIENT, ENV,
      "/default/local/history/20260309T120000Z/dlq_operations",
      DASHBOARD_IDS,
    );
    expect(result).toBe("/contexture/prod/history");
  });

  it("resets to /history when on the compare page", () => {
    const result = targetUrl(
      "contexture", "prod",
      CLIENT, ENV,
      "/default/local/history/compare",
      DASHBOARD_IDS,
    );
    expect(result).toBe("/contexture/prod/history");
  });

  it("resets to /history for unknown sub-routes", () => {
    const result = targetUrl(
      "contexture", "prod",
      CLIENT, ENV,
      "/default/local/something-unknown",
      DASHBOARD_IDS,
    );
    expect(result).toBe("/contexture/prod/history");
  });

  it("handles env-only switch on a dashboard page", () => {
    const result = targetUrl(
      CLIENT, "prod",
      CLIENT, ENV,
      "/default/local/dlq_operations",
      DASHBOARD_IDS,
    );
    expect(result).toBe("/default/prod/dlq_operations");
  });

  it("handles env-only switch on the history list", () => {
    const result = targetUrl(
      CLIENT, "prod",
      CLIENT, ENV,
      "/default/local/history",
      DASHBOARD_IDS,
    );
    expect(result).toBe("/default/prod/history");
  });
});

// ─── resolveEnv ───────────────────────────────────────────────────────────────

describe("resolveEnv — env fallback on client switch", () => {
  it("preserves current env when new client supports it", () => {
    const newClientEntry = { client: "contexture", envs: ["local", "prod"] };
    expect(resolveEnv(newClientEntry, "local")).toBe("local");
  });

  it("preserves prod env when new client supports it", () => {
    const newClientEntry = { client: "contexture", envs: ["local", "prod"] };
    expect(resolveEnv(newClientEntry, "prod")).toBe("prod");
  });

  it("falls back to first env when new client does not support current env", () => {
    // 'default' only has 'local'; user is currently on 'prod'
    const newClientEntry = { client: "default", envs: ["local"] };
    expect(resolveEnv(newClientEntry, "prod")).toBe("local");
  });

  it("returns null when newClientEntry is undefined (guard)", () => {
    expect(resolveEnv(undefined, "local")).toBeNull();
  });

  it("returns null when newClientEntry is null (guard)", () => {
    expect(resolveEnv(null, "local")).toBeNull();
  });

  it("returns null when envs array is empty (guard — never produce /undefined/ URL)", () => {
    const newClientEntry = { client: "broken", envs: [] };
    expect(resolveEnv(newClientEntry, "local")).toBeNull();
  });

  it("returns null when envs is missing (guard)", () => {
    const newClientEntry = { client: "broken" };
    expect(resolveEnv(newClientEntry, "local")).toBeNull();
  });
});
