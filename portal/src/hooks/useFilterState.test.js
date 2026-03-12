// Tests for resolveFilterState — the pure resolution logic extracted from
// useFilterState. Testing the pure function avoids the need for a React Router
// context or @testing-library/react, keeping tests fast and framework-free.
import { describe, it, expect } from "vitest";
import { resolveFilterState } from "./useFilterState.js";

// Helper: build a URLSearchParams from a plain record.
function qs(record = {}) {
  return new URLSearchParams(record);
}

const baseFilters = [
  { id: "client", type: "url_param", param: "client" },
  { id: "env",    type: "url_param", param: "env"    },
];

describe("resolveFilterState", () => {
  it("reads filter values from path params", () => {
    const result = resolveFilterState(
      baseFilters,
      { client: "acme", env: "prod" },
      qs()
    );
    expect(result.client).toBe("acme");
    expect(result.env).toBe("prod");
  });

  it("reads filter values from query params when not in path params", () => {
    const result = resolveFilterState(
      baseFilters,
      {},
      qs({ client: "beta", env: "staging" })
    );
    expect(result.client).toBe("beta");
    expect(result.env).toBe("staging");
  });

  it("path params take precedence over query params of the same name", () => {
    const result = resolveFilterState(
      baseFilters,
      { client: "path-client" },
      qs({ client: "query-client" })
    );
    expect(result.client).toBe("path-client");
  });

  it("applies the declared default when param is absent", () => {
    const filters = [
      { id: "date_range", type: "url_param", param: "date_range", default: "7d" },
    ];
    const result = resolveFilterState(filters, {}, qs());
    expect(result.date_range).toBe("7d");
  });

  it("returns null when param is absent and no default is declared", () => {
    const result = resolveFilterState(baseFilters, {}, qs());
    expect(result.client).toBeNull();
    expect(result.env).toBeNull();
  });

  it("query param overrides default when present", () => {
    const filters = [
      { id: "date_range", type: "url_param", param: "date_range", default: "7d" },
    ];
    const result = resolveFilterState(filters, {}, qs({ date_range: "30d" }));
    expect(result.date_range).toBe("30d");
  });

  it("returns an empty object when filters array is empty", () => {
    const result = resolveFilterState([], {}, qs());
    expect(result).toEqual({});
  });

  it("returns an empty object when filters is undefined", () => {
    const result = resolveFilterState(undefined, {}, qs());
    expect(result).toEqual({});
  });

  it("unknown filter type is silently skipped (no key added to state)", () => {
    const filters = [
      { id: "unknown_filter", type: "future_type", param: "x" },
    ];
    const result = resolveFilterState(filters, {}, qs());
    expect(result.unknown_filter).toBeUndefined();
    expect(Object.keys(result)).toHaveLength(0);
  });

  it("resolves multiple filters with mixed sources independently", () => {
    const filters = [
      { id: "client",     type: "url_param", param: "client" },
      { id: "date_range", type: "url_param", param: "date_range", default: "7d" },
      { id: "region",     type: "url_param", param: "region" },
    ];
    const result = resolveFilterState(
      filters,
      { client: "path-client" },
      qs({ date_range: "14d" })
    );
    expect(result.client).toBe("path-client");
    expect(result.date_range).toBe("14d");
    expect(result.region).toBeNull();
  });
});
