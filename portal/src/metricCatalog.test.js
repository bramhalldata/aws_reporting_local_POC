import { describe, it, expect } from "vitest";
import { metricCatalog } from "./metricCatalog.js";
import { widgetRegistry } from "./widgetRegistry.js";

const adapter = widgetRegistry.kpi_card.propsAdapter;

// ---------------------------------------------------------------------------
// Test 1 — widget.metric matches a catalog entry
// ---------------------------------------------------------------------------
describe("metric catalog resolution", () => {
  it("resolves label, tone, and footnote from catalog when widget.metric is set", () => {
    const widget = { metric: "failures_last_24h", data_source: {} };
    const props = adapter(widget, 42);

    expect(props.label).toBe("Failures — last 24 h");
    expect(props.tone).toBe("neutral");
    expect(props.footnote).toBe("24-hour rolling window");
    expect(props.value).toBe(42);
  });

  // -------------------------------------------------------------------------
  // Test 2 — widget kpi_config.tone overrides catalog tone
  // -------------------------------------------------------------------------
  it("widget kpi_config.tone overrides catalog default tone", () => {
    const widget = {
      metric: "failures_last_24h",
      kpi_config: { tone: "warning" },
      data_source: {},
    };
    const props = adapter(widget, 10);

    expect(props.tone).toBe("warning");
    expect(props.label).toBe("Failures — last 24 h");
  });

  // -------------------------------------------------------------------------
  // Test 3 — widget.title overrides catalog label
  // -------------------------------------------------------------------------
  it("widget.title overrides catalog label when set alongside metric", () => {
    const widget = {
      metric: "failures_last_24h",
      title: "Custom Label",
      data_source: {},
    };
    const props = adapter(widget, 5);

    expect(props.label).toBe("Custom Label");
    expect(props.tone).toBe("neutral");
  });

  // -------------------------------------------------------------------------
  // Test 4 — unknown metric ID falls back gracefully
  // -------------------------------------------------------------------------
  it("falls back to widget.title and neutral tone when metric ID is unknown", () => {
    const widget = {
      metric: "nonexistent_metric",
      title: "Fallback Label",
      data_source: {},
    };
    const props = adapter(widget, 99);

    expect(props.label).toBe("Fallback Label");
    expect(props.tone).toBe("neutral");
    expect(props.value).toBe(99);
  });

  // -------------------------------------------------------------------------
  // Test 5 — widget.metric absent; behaves as before (backward compat)
  // -------------------------------------------------------------------------
  it("behaves as before when widget.metric is absent", () => {
    const widget = {
      title: "Legacy Widget",
      kpi_config: { tone: "positive", footnote: "legacy note" },
      data_source: {},
    };
    const props = adapter(widget, 7);

    expect(props.label).toBe("Legacy Widget");
    expect(props.tone).toBe("positive");
    expect(props.footnote).toBe("legacy note");
    expect(props.value).toBe(7);
  });

  // -------------------------------------------------------------------------
  // Test 6 — threshold rule triggered
  // -------------------------------------------------------------------------
  it("applies threshold tone when the rule is triggered", () => {
    // Temporarily inject a catalog entry with a threshold for this test.
    const savedEntry = metricCatalog.failures_last_24h;
    metricCatalog.failures_last_24h = {
      ...savedEntry,
      thresholds: [{ op: ">=", value: 100, tone: "critical" }],
    };

    const widget = { metric: "failures_last_24h", data_source: {} };
    const props = adapter(widget, 150);

    metricCatalog.failures_last_24h = savedEntry; // restore
    expect(props.tone).toBe("critical");
  });

  // -------------------------------------------------------------------------
  // Test 7 — threshold rule not triggered
  // -------------------------------------------------------------------------
  it("uses catalog default tone when threshold is not triggered", () => {
    const savedEntry = metricCatalog.failures_last_24h;
    metricCatalog.failures_last_24h = {
      ...savedEntry,
      thresholds: [{ op: ">=", value: 999999, tone: "critical" }],
    };

    const widget = { metric: "failures_last_24h", data_source: {} };
    const props = adapter(widget, 42);

    metricCatalog.failures_last_24h = savedEntry; // restore
    expect(props.tone).toBe("neutral");
  });
});
