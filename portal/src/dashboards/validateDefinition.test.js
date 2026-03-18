/**
 * validateDefinition.test.js
 *
 * Tests for the validateDefinition pure function.
 *
 * Coverage:
 *   - One failure case per check (checks 1–8)
 *   - A valid minimal definition passes all checks
 *   - Preset widget with no type passes check 7 (preset exemption)
 *   - All three production definition.json files pass (regression gate)
 */
import { describe, it, expect } from "vitest";
import { validateDefinition } from "./validateDefinition.js";

import dlqDef       from "./dlq_operations/definition.json";
import pipelineDef  from "./pipeline_health/definition.json";
import sentToUdmDef from "./sent_to_udm/definition.json";

// ---------------------------------------------------------------------------
// Shared minimal valid definition — used as a base for mutation tests
// ---------------------------------------------------------------------------

function makeValid() {
  return {
    id: "test_dashboard",
    schema_version: "1.0.0",
    layout: {
      sections: [
        { id: "kpis", widget_ids: ["kpi_a"] },
      ],
    },
    widgets: [
      {
        id: "kpi_a",
        type: "kpi_card",
        data_source: { artifact: "summary.json", field: "total" },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Happy path — minimal valid definition
// ---------------------------------------------------------------------------

describe("validateDefinition — valid definition", () => {
  it("returns valid: true for a minimal correct definition", () => {
    const result = validateDefinition(makeValid());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Check 1 — definition.id is a non-empty string
// ---------------------------------------------------------------------------

describe("validateDefinition — check 1: id", () => {
  it("fails when id is missing", () => {
    const def = makeValid();
    delete def.id;
    const result = validateDefinition(def);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("definition.id"))).toBe(true);
  });

  it("fails when id is an empty string", () => {
    const def = { ...makeValid(), id: "" };
    const result = validateDefinition(def);
    expect(result.valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Check 2 — definition.schema_version is a non-empty string
// ---------------------------------------------------------------------------

describe("validateDefinition — check 2: schema_version", () => {
  it("fails when schema_version is missing", () => {
    const def = makeValid();
    delete def.schema_version;
    const result = validateDefinition(def);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("schema_version"))).toBe(true);
  });

  it("fails when schema_version is a number", () => {
    const def = { ...makeValid(), schema_version: 1 };
    const result = validateDefinition(def);
    expect(result.valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Check 3 — layout.sections is a non-empty array
// ---------------------------------------------------------------------------

describe("validateDefinition — check 3: layout.sections", () => {
  it("fails when layout.sections is absent", () => {
    const def = makeValid();
    delete def.layout.sections;
    const result = validateDefinition(def);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("layout.sections"))).toBe(true);
  });

  it("fails when layout.sections is an empty array", () => {
    const def = { ...makeValid(), layout: { sections: [] } };
    const result = validateDefinition(def);
    expect(result.valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Check 4 — each section has a string id and non-empty widget_ids array
// ---------------------------------------------------------------------------

describe("validateDefinition — check 4: section shape", () => {
  it("fails when a section has no id", () => {
    const def = makeValid();
    def.layout.sections[0] = { widget_ids: ["kpi_a"] };
    const result = validateDefinition(def);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("non-empty string id"))).toBe(true);
  });

  it("fails when a section has an empty widget_ids array", () => {
    const def = makeValid();
    def.layout.sections[0].widget_ids = [];
    const result = validateDefinition(def);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("non-empty widget_ids"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Check 5 — every widget_id resolves to a widget entry
// ---------------------------------------------------------------------------

describe("validateDefinition — check 5: widget_id references", () => {
  it("fails when a section references a widget_id not in widgets array", () => {
    const def = makeValid();
    def.layout.sections[0].widget_ids = ["kpi_a", "nonexistent_widget"];
    const result = validateDefinition(def);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.includes("nonexistent_widget"))
    ).toBe(true);
  });

  it("includes the section id in the error message", () => {
    const def = makeValid();
    def.layout.sections[0].widget_ids = ["ghost"];
    const result = validateDefinition(def);
    expect(result.errors.some((e) => e.includes("kpis"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Check 6 — no duplicate widget.id values
// ---------------------------------------------------------------------------

describe("validateDefinition — check 6: duplicate widget ids", () => {
  it("fails when two widgets share the same id", () => {
    const def = makeValid();
    def.layout.sections[0].widget_ids = ["kpi_a", "kpi_b"];
    def.widgets = [
      { id: "kpi_a", type: "kpi_card", data_source: { artifact: "summary.json", field: "a" } },
      { id: "kpi_a", type: "kpi_card", data_source: { artifact: "summary.json", field: "b" } },
    ];
    // rename second reference so check 5 doesn't also fire
    def.layout.sections[0].widget_ids = ["kpi_a"];
    const result = validateDefinition(def);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Duplicate widget id"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Check 7 — non-preset widgets must have type and data_source.artifact
// ---------------------------------------------------------------------------

describe("validateDefinition — check 7: type and data_source presence", () => {
  it("fails when a non-preset widget has no type", () => {
    const def = makeValid();
    delete def.widgets[0].type;
    const result = validateDefinition(def);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("no preset and no type"))).toBe(true);
  });

  it("fails when data_source.artifact does not end in .json", () => {
    const def = makeValid();
    def.widgets[0].data_source.artifact = "summary.csv";
    const result = validateDefinition(def);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.includes("data_source.artifact"))
    ).toBe(true);
  });

  it("fails when a non-preset widget has no data_source at all", () => {
    const def = makeValid();
    delete def.widgets[0].data_source;
    const result = validateDefinition(def);
    expect(result.valid).toBe(false);
  });

  it("passes for a preset widget that has no type or data_source (preset exemption)", () => {
    const def = makeValid();
    def.widgets[0] = { id: "kpi_a", preset: "failures_24h_kpi" };
    const result = validateDefinition(def);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Check 8 — generic_table with totals: true must have an aggregate column
// ---------------------------------------------------------------------------

describe("validateDefinition — check 8: generic_table totals aggregate", () => {
  it("fails when generic_table has totals: true but no column has an aggregate", () => {
    const def = makeValid();
    def.widgets[0] = {
      id: "kpi_a",
      type: "generic_table",
      totals: true,
      data_source: { artifact: "rows.json", field: "rows" },
      columns: [
        { field: "name",  header: "Name" },
        { field: "count", header: "Count", format: "number" },
      ],
    };
    const result = validateDefinition(def);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.includes("totals: true but no column defines an aggregate"))
    ).toBe(true);
  });

  it("fails when all columns have aggregate: 'none'", () => {
    const def = makeValid();
    def.widgets[0] = {
      id: "kpi_a",
      type: "generic_table",
      totals: true,
      data_source: { artifact: "rows.json", field: "rows" },
      columns: [
        { field: "name",  header: "Name",  aggregate: "none" },
        { field: "count", header: "Count", aggregate: "none" },
      ],
    };
    const result = validateDefinition(def);
    expect(result.valid).toBe(false);
  });

  it("passes when generic_table has totals: true and at least one aggregate column", () => {
    const def = makeValid();
    def.widgets[0] = {
      id: "kpi_a",
      type: "generic_table",
      totals: true,
      data_source: { artifact: "rows.json", field: "rows" },
      columns: [
        { field: "region", header: "Region",    aggregate: "label" },
        { field: "count",  header: "Count", format: "number", aggregate: "sum" },
      ],
    };
    const result = validateDefinition(def);
    expect(result.valid).toBe(true);
  });

  it("passes when generic_table has totals: false with no aggregate columns", () => {
    const def = makeValid();
    def.widgets[0] = {
      id: "kpi_a",
      type: "generic_table",
      totals: false,
      data_source: { artifact: "rows.json", field: "rows" },
      columns: [
        { field: "name", header: "Name" },
      ],
    };
    const result = validateDefinition(def);
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Production definitions — regression gate (all three must pass)
// ---------------------------------------------------------------------------

describe("validateDefinition — production definitions", () => {
  it("dlq_operations/definition.json passes all checks", () => {
    const result = validateDefinition(dlqDef);
    expect(result.errors).toHaveLength(0);
    expect(result.valid).toBe(true);
  });

  it("pipeline_health/definition.json passes all checks", () => {
    const result = validateDefinition(pipelineDef);
    expect(result.errors).toHaveLength(0);
    expect(result.valid).toBe(true);
  });

  it("sent_to_udm/definition.json passes all checks", () => {
    const result = validateDefinition(sentToUdmDef);
    expect(result.errors).toHaveLength(0);
    expect(result.valid).toBe(true);
  });
});
