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

  // -------------------------------------------------------------------------
  // Test 8 — date_string formatter slices value to 10 chars and sets font size
  // -------------------------------------------------------------------------
  it("date_string formatter slices value to 10 chars and sets valueFontSize", () => {
    // earliest_event_ts uses formatter: "date_string"
    const widget = { metric: "earliest_event_ts", data_source: {} };
    const props = adapter(widget, "2025-01-10T00:00:00Z");

    expect(props.value).toBe("2025-01-10");
    expect(props.valueFontSize).toBe("1.4rem");
  });

  // -------------------------------------------------------------------------
  // Test 9 — datetime formatter preserves existing behaviour
  // -------------------------------------------------------------------------
  it("datetime formatter converts ISO string to locale date+time string", () => {
    // latest_event_timestamp uses formatter: "datetime"
    const widget = { metric: "latest_event_timestamp", data_source: {} };
    const isoValue = "2026-03-10T14:30:00Z";
    const props = adapter(widget, isoValue);

    // Value must be a non-empty string produced by toLocaleString — not the raw ISO
    expect(typeof props.value).toBe("string");
    expect(props.value).not.toBe(isoValue);
    expect(props.value.length).toBeGreaterThan(0);
    expect(props.valueFontSize).toBe("1.4rem");
  });

  // -------------------------------------------------------------------------
  // Test 10 — total_ccds_sent metric resolves label and footnote
  // -------------------------------------------------------------------------
  it("total_ccds_sent resolves correct label and footnote", () => {
    const widget = { metric: "total_ccds_sent", data_source: {} };
    const props = adapter(widget, 4200);

    expect(props.label).toBe("Total CCDs Sent");
    expect(props.footnote).toBe("All time");
    expect(props.value).toBe(4200);
    expect(props.tone).toBe("neutral");
  });

  // -------------------------------------------------------------------------
  // Test 11 — earliest_event_ts metric: formatter is date_string, output is
  //           a 10-character date string
  // -------------------------------------------------------------------------
  it("earliest_event_ts resolves date_string formatter and produces a 10-char date", () => {
    const widget = { metric: "earliest_event_ts", data_source: {} };
    const props = adapter(widget, "2025-01-10");

    expect(props.label).toBe("First CCD Sent");
    expect(props.value).toBe("2025-01-10");
    expect(props.value).toHaveLength(10);
    expect(props.valueFontSize).toBe("1.4rem");
  });
});
