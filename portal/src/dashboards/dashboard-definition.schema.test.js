/**
 * dashboard-definition.schema.test.js
 *
 * Regression gate: validates all three production definition.json files
 * against dashboard-definition.schema.json using ajv (devDependency only).
 *
 * These tests catch schema drift — if a definition.json introduces a field
 * shape that violates the contract, the test fails before code review.
 */
import { describe, it, expect } from "vitest";
import Ajv from "ajv";

import schema       from "./dashboard-definition.schema.json";
import dlqDef       from "./dlq_operations/definition.json";
import pipelineDef  from "./pipeline_health/definition.json";
import sentToUdmDef from "./sent_to_udm/definition.json";

// strict: false — we own the schema; ajv strict mode adds no value here
const ajv      = new Ajv({ strict: false });
const validate = ajv.compile(schema);

// ---------------------------------------------------------------------------
// Production definitions — must always pass (regression gate)
// ---------------------------------------------------------------------------

describe("schema — production definitions", () => {
  it("dlq_operations/definition.json is valid", () => {
    const valid = validate(dlqDef);
    expect(valid, JSON.stringify(validate.errors, null, 2)).toBe(true);
  });

  it("pipeline_health/definition.json is valid", () => {
    const valid = validate(pipelineDef);
    expect(valid, JSON.stringify(validate.errors, null, 2)).toBe(true);
  });

  it("sent_to_udm/definition.json is valid", () => {
    const valid = validate(sentToUdmDef);
    expect(valid, JSON.stringify(validate.errors, null, 2)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Structural positives — minimal valid definition
// ---------------------------------------------------------------------------

describe("schema — minimal valid definition", () => {
  it("accepts a minimal definition with all required top-level fields", () => {
    const minimal = {
      id: "test_dashboard",
      title: "Test",
      schema_version: "1.0.0",
      layout: {
        sections: [{ id: "kpis", widget_ids: ["w1"] }],
      },
      widgets: [
        { id: "w1", type: "kpi_card", data_source: { artifact: "summary.json", field: "val" } },
      ],
      filters: [],
      defaults: { section: "kpis" },
    };
    expect(validate(minimal)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Negative tests — field type violations caught by the schema
// ---------------------------------------------------------------------------

describe("schema — negative tests", () => {
  it("rejects schema_version as a number (must be a string)", () => {
    const bad = {
      id: "test",
      title: "Test",
      schema_version: 1,       // ← number, not string
      layout: { sections: [{ id: "s1", widget_ids: ["w1"] }] },
      widgets: [{ id: "w1", type: "kpi_card", data_source: { artifact: "summary.json", field: "v" } }],
      filters: [],
      defaults: { section: "s1" },
    };
    expect(validate(bad)).toBe(false);
    expect(validate.errors).not.toBeNull();
  });

  it("rejects schema_version that does not match semver pattern", () => {
    const bad = {
      id: "test",
      title: "Test",
      schema_version: "v1.0",  // ← missing patch segment, has prefix
      layout: { sections: [{ id: "s1", widget_ids: ["w1"] }] },
      widgets: [{ id: "w1", type: "kpi_card", data_source: { artifact: "summary.json", field: "v" } }],
      filters: [],
      defaults: { section: "s1" },
    };
    expect(validate(bad)).toBe(false);
  });

  it("rejects a widget data_source.artifact that does not end in .json", () => {
    const bad = {
      id: "test",
      title: "Test",
      schema_version: "1.0.0",
      layout: { sections: [{ id: "s1", widget_ids: ["w1"] }] },
      widgets: [
        { id: "w1", type: "kpi_card", data_source: { artifact: "summary.csv", field: "val" } },
      ],
      filters: [],
      defaults: { section: "s1" },
    };
    expect(validate(bad)).toBe(false);
  });

  it("rejects a section layout.type that is not an allowed value", () => {
    const bad = {
      id: "test",
      title: "Test",
      schema_version: "1.0.0",
      layout: {
        sections: [{ id: "s1", widget_ids: ["w1"], layout: { type: "carousel" } }],
      },
      widgets: [
        { id: "w1", type: "kpi_card", data_source: { artifact: "summary.json", field: "val" } },
      ],
      filters: [],
      defaults: { section: "s1" },
    };
    expect(validate(bad)).toBe(false);
  });

  it("rejects a column format that is not an allowed value", () => {
    const bad = {
      id: "test",
      title: "Test",
      schema_version: "1.0.0",
      layout: { sections: [{ id: "s1", widget_ids: ["w1"] }] },
      widgets: [
        {
          id: "w1",
          type: "generic_table",
          data_source: { artifact: "rows.json", field: "rows" },
          columns: [{ field: "name", header: "Name", format: "currency" }],
        },
      ],
      filters: [],
      defaults: { section: "s1" },
    };
    expect(validate(bad)).toBe(false);
  });

  it("rejects a definition missing the required 'id' field", () => {
    const bad = {
      title: "Test",
      schema_version: "1.0.0",
      layout: { sections: [{ id: "s1", widget_ids: ["w1"] }] },
      widgets: [{ id: "w1", type: "kpi_card", data_source: { artifact: "summary.json", field: "v" } }],
      filters: [],
      defaults: { section: "s1" },
    };
    expect(validate(bad)).toBe(false);
  });

  it("rejects a definition with an empty widgets array", () => {
    const bad = {
      id: "test",
      title: "Test",
      schema_version: "1.0.0",
      layout: { sections: [{ id: "s1", widget_ids: ["w1"] }] },
      widgets: [],              // ← minItems: 1
      filters: [],
      defaults: { section: "s1" },
    };
    expect(validate(bad)).toBe(false);
  });
});
