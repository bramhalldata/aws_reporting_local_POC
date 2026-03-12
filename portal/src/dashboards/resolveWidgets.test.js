import { describe, it, expect, vi } from "vitest";
import { resolveWidgets } from "./resolveWidgets.js";

const presets = {
  failures_24h_kpi: {
    type: "kpi_card",
    metric: "failures_last_24h",
    data_source: { artifact: "summary.json", field: "failures_last_24h" },
    layout: { col: 0, row: 0, w: 6, h: 2 },
  },
  failures_7d_kpi: {
    type: "kpi_card",
    metric: "failures_last_7d",
    data_source: { artifact: "summary.json", field: "failures_last_7d" },
    layout: { col: 6, row: 0, w: 6, h: 2 },
  },
};

describe("resolveWidgets", () => {
  it("applies preset fields to a widget that references a preset", () => {
    const widgets = [{ id: "failures_24h", preset: "failures_24h_kpi" }];
    const [result] = resolveWidgets(widgets, presets);

    expect(result.id).toBe("failures_24h");
    expect(result.type).toBe("kpi_card");
    expect(result.metric).toBe("failures_last_24h");
    expect(result.data_source).toEqual({ artifact: "summary.json", field: "failures_last_24h" });
    expect(result.layout).toEqual({ col: 0, row: 0, w: 6, h: 2 });
    expect(result.preset).toBeUndefined();
  });

  it("local id always overrides any id that could come from the preset", () => {
    const widgets = [{ id: "my_local_id", preset: "failures_24h_kpi" }];
    const [result] = resolveWidgets(widgets, presets);
    expect(result.id).toBe("my_local_id");
  });

  it("local layout replaces preset layout entirely (shallow merge)", () => {
    const localLayout = { col: 0, row: 0, w: 4, h: 3 };
    const widgets = [{ id: "failures_24h", preset: "failures_24h_kpi", layout: localLayout }];
    const [result] = resolveWidgets(widgets, presets);

    expect(result.layout).toEqual(localLayout);
    expect(result.layout.w).toBe(4); // local wins
  });

  it("local fields override preset fields", () => {
    const widgets = [
      { id: "failures_24h", preset: "failures_24h_kpi", metric: "custom_metric" },
    ];
    const [result] = resolveWidgets(widgets, presets);
    expect(result.metric).toBe("custom_metric");
  });

  it("passes through a widget with no preset field unchanged", () => {
    const widget = {
      id: "inline_widget",
      type: "data_table",
      title: "My Table",
      data_source: { artifact: "top_sites.json", field: "sites" },
      layout: { col: 0, row: 0, w: 12, h: 4 },
    };
    const [result] = resolveWidgets([widget], presets);
    expect(result).toEqual(widget);
  });

  it("strips the preset key from the resolved widget", () => {
    const widgets = [{ id: "failures_24h", preset: "failures_24h_kpi" }];
    const [result] = resolveWidgets(widgets, presets);
    expect(Object.keys(result)).not.toContain("preset");
  });

  it("resolves multiple widgets independently", () => {
    const widgets = [
      { id: "a", preset: "failures_24h_kpi" },
      { id: "b", preset: "failures_7d_kpi" },
      { id: "c", type: "data_table", data_source: { artifact: "top_sites.json", field: "sites" }, layout: {} },
    ];
    const results = resolveWidgets(widgets, presets);

    expect(results[0].metric).toBe("failures_last_24h");
    expect(results[1].metric).toBe("failures_last_7d");
    expect(results[2].type).toBe("data_table");
  });

  it("passes through a widget with an unknown preset (strips preset key, emits warning)", () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const widgets = [{ id: "w1", preset: "nonexistent_preset" }];
    const [result] = resolveWidgets(widgets, presets);

    expect(result.id).toBe("w1");
    expect(result.preset).toBeUndefined();
    expect(result.type).toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("nonexistent_preset")
    );
    consoleSpy.mockRestore();
  });
});
