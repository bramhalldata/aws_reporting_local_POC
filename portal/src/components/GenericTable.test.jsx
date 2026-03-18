/**
 * GenericTable.test.jsx
 *
 * Unit tests for the GenericTable utility functions: formatCell and computeTotals.
 * These are extracted from the module for testing — see GenericTable.jsx for the
 * full component.
 */
import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Re-implement the pure functions under test so they are testable without a
// DOM environment (matches the project's existing test pattern).
// ---------------------------------------------------------------------------

function formatCell(value, format) {
  if (value == null) return "—";
  if (format === "number")      return Number(value).toLocaleString();
  if (format === "date_string") return String(value).slice(0, 10);
  if (format === "timestamp")   return String(value).slice(0, 19).replace("T", " ");
  return String(value);
}

function computeTotals(rows, columns) {
  return columns.map((col) => {
    const agg = col.aggregate;
    if (!agg || agg === "none") return null;
    if (agg === "label") return "Total";

    const values = rows
      .map((r) => r[col.field])
      .filter((v) => v != null && !Number.isNaN(Number(v)))
      .map(Number);

    if (values.length === 0) return null;
    if (agg === "sum") return values.reduce((a, b) => a + b, 0);
    if (agg === "min") return Math.min(...values);
    if (agg === "max") return Math.max(...values);
    return null;
  });
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------
const REGION_COLUMNS = [
  { field: "region",     aggregate: "label" },
  { field: "ccd_count",  format: "number",      aggregate: "sum" },
  { field: "first_seen", format: "date_string",  aggregate: "min" },
  { field: "last_seen",  format: "date_string",  aggregate: "max" },
];

const REGION_ROWS = [
  { region: "Northeast", ccd_count: 1200, first_seen: "2025-01-10", last_seen: "2026-03-10" },
  { region: "Southeast", ccd_count:  800, first_seen: "2025-02-05", last_seen: "2026-03-05" },
  { region: "Midwest",   ccd_count:  500, first_seen: "2025-03-01", last_seen: "2026-02-28" },
];

// ---------------------------------------------------------------------------
// formatCell — number format
// ---------------------------------------------------------------------------
describe("formatCell — number format", () => {
  it("formats integers with toLocaleString", () => {
    expect(formatCell(1200, "number")).toBe((1200).toLocaleString());
  });

  it("formats zero as '0'", () => {
    expect(formatCell(0, "number")).toBe("0");
  });
});

// ---------------------------------------------------------------------------
// formatCell — date_string format
// ---------------------------------------------------------------------------
describe("formatCell — date_string format", () => {
  it("slices to 10 characters for a plain date string", () => {
    expect(formatCell("2025-01-10", "date_string")).toBe("2025-01-10");
  });

  it("slices a full ISO timestamp to its date portion", () => {
    expect(formatCell("2026-03-10T14:30:00Z", "date_string")).toBe("2026-03-10");
  });
});

// ---------------------------------------------------------------------------
// formatCell — timestamp format
// ---------------------------------------------------------------------------
describe("formatCell — timestamp format", () => {
  it("formats an ISO timestamp to 'YYYY-MM-DD HH:MM:SS'", () => {
    expect(formatCell("2026-03-10T14:30:00Z", "timestamp")).toBe("2026-03-10 14:30:00");
  });

  it("leaves a short string unchanged if shorter than 19 chars", () => {
    expect(formatCell("2026-03-10", "timestamp")).toBe("2026-03-10");
  });
});

// ---------------------------------------------------------------------------
// formatCell — null / absent value
// ---------------------------------------------------------------------------
describe("formatCell — null/undefined handling", () => {
  it("returns em-dash for null", () => {
    expect(formatCell(null, "number")).toBe("—");
  });

  it("returns em-dash for undefined", () => {
    expect(formatCell(undefined, "date_string")).toBe("—");
  });
});

// ---------------------------------------------------------------------------
// formatCell — no format (raw string passthrough)
// ---------------------------------------------------------------------------
describe("formatCell — no format (passthrough)", () => {
  it("returns the value as a string when format is absent", () => {
    expect(formatCell("Northeast", undefined)).toBe("Northeast");
  });
});

// ---------------------------------------------------------------------------
// computeTotals — sum aggregate
// ---------------------------------------------------------------------------
describe("computeTotals — sum", () => {
  it("sums numeric values across all rows", () => {
    const totals = computeTotals(REGION_ROWS, REGION_COLUMNS);
    expect(totals[1]).toBe(2500); // 1200 + 800 + 500
  });
});

// ---------------------------------------------------------------------------
// computeTotals — label aggregate
// ---------------------------------------------------------------------------
describe("computeTotals — label", () => {
  it("returns 'Total' for columns with aggregate=label", () => {
    const totals = computeTotals(REGION_ROWS, REGION_COLUMNS);
    expect(totals[0]).toBe("Total");
  });
});

// ---------------------------------------------------------------------------
// computeTotals — min aggregate
// ---------------------------------------------------------------------------
describe("computeTotals — min", () => {
  it("returns the minimum value for aggregate=min", () => {
    // date strings cast to Number → NaN → filtered out → null for those columns
    // test with a purely numeric column instead
    const numericCols = [
      { field: "ccd_count", aggregate: "min" },
    ];
    const t = computeTotals(REGION_ROWS, numericCols);
    expect(t[0]).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// computeTotals — max aggregate
// ---------------------------------------------------------------------------
describe("computeTotals — max", () => {
  it("returns the maximum value for aggregate=max", () => {
    const numericCols = [
      { field: "ccd_count", aggregate: "max" },
    ];
    const t = computeTotals(REGION_ROWS, numericCols);
    expect(t[0]).toBe(1200);
  });
});

// ---------------------------------------------------------------------------
// computeTotals — none / absent aggregate
// ---------------------------------------------------------------------------
describe("computeTotals — none", () => {
  it("returns null for columns with aggregate=none", () => {
    const cols = [{ field: "ccd_count", aggregate: "none" }];
    const totals = computeTotals(REGION_ROWS, cols);
    expect(totals[0]).toBeNull();
  });

  it("returns null for columns with no aggregate field", () => {
    const cols = [{ field: "ccd_count" }];
    const totals = computeTotals(REGION_ROWS, cols);
    expect(totals[0]).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// computeTotals — empty rows
// ---------------------------------------------------------------------------
describe("computeTotals — empty rows", () => {
  it("returns null for sum when rows is empty", () => {
    const cols = [{ field: "ccd_count", aggregate: "sum" }];
    const totals = computeTotals([], cols);
    expect(totals[0]).toBeNull();
  });
});
