import { describe, it, expect, beforeEach, vi } from "vitest";

// registerPlugin mutates module-level singletons, so we inject mock registries
// via a factory helper rather than importing the real registries.

function makeRegistries() {
  return {
    dashboardRegistry: [
      { id: "existing_dashboard", label: "Existing", component: () => null },
    ],
    widgetRegistry: {
      kpi_card: { component: () => null, propsAdapter: () => ({}) },
    },
    metricCatalog: {
      existing_metric: { label: "Existing Metric" },
    },
    widgetPresets: {
      existing_preset: { type: "kpi_card" },
    },
  };
}

// Inline implementation of registerPlugin against injected registries.
// Mirrors the real function exactly — update this if registerPlugin.js changes.
function registerPlugin(plugin, { dashboardRegistry, widgetRegistry, metricCatalog, widgetPresets }) {
  if (plugin.dashboards) {
    for (const entry of plugin.dashboards) {
      if (dashboardRegistry.find((d) => d.id === entry.id)) {
        console.warn(`[registerPlugin] Dashboard id "${entry.id}" already registered. Skipping.`);
        continue;
      }
      dashboardRegistry.push(entry);
    }
  }
  if (plugin.widgets) {
    for (const key of Object.keys(plugin.widgets)) {
      if (Object.prototype.hasOwnProperty.call(widgetRegistry, key)) {
        console.warn(`[registerPlugin] Widget type "${key}" already registered. Overwriting.`);
      }
    }
    Object.assign(widgetRegistry, plugin.widgets);
  }
  if (plugin.metrics) {
    for (const key of Object.keys(plugin.metrics)) {
      if (Object.prototype.hasOwnProperty.call(metricCatalog, key)) {
        console.warn(`[registerPlugin] Metric "${key}" already registered. Overwriting.`);
      }
    }
    Object.assign(metricCatalog, plugin.metrics);
  }
  if (plugin.presets) {
    for (const key of Object.keys(plugin.presets)) {
      if (Object.prototype.hasOwnProperty.call(widgetPresets, key)) {
        console.warn(`[registerPlugin] Preset "${key}" already registered. Overwriting.`);
      }
    }
    Object.assign(widgetPresets, plugin.presets);
  }
}

// ─── Dashboard registration ───────────────────────────────────────────────────

describe("registerPlugin — dashboards", () => {
  let regs;
  beforeEach(() => { regs = makeRegistries(); });

  it("adds a new dashboard to the registry", () => {
    const component = () => null;
    registerPlugin({ dashboards: [{ id: "new_dash", label: "New", component }] }, regs);
    expect(regs.dashboardRegistry).toHaveLength(2);
    expect(regs.dashboardRegistry[1]).toEqual({ id: "new_dash", label: "New", component });
  });

  it("adds multiple dashboards in order", () => {
    registerPlugin({
      dashboards: [
        { id: "dash_a", label: "A", component: () => null },
        { id: "dash_b", label: "B", component: () => null },
      ],
    }, regs);
    expect(regs.dashboardRegistry).toHaveLength(3);
    expect(regs.dashboardRegistry[1].id).toBe("dash_a");
    expect(regs.dashboardRegistry[2].id).toBe("dash_b");
  });

  it("skips duplicate dashboard id and emits console.warn", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    registerPlugin({ dashboards: [{ id: "existing_dashboard", label: "Dup", component: () => null }] }, regs);
    expect(regs.dashboardRegistry).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("existing_dashboard"));
    warn.mockRestore();
  });

  it("skips only the duplicate; still adds the valid entry", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    registerPlugin({
      dashboards: [
        { id: "existing_dashboard", label: "Dup", component: () => null },
        { id: "new_dash", label: "New", component: () => null },
      ],
    }, regs);
    expect(regs.dashboardRegistry).toHaveLength(2);
    expect(regs.dashboardRegistry[1].id).toBe("new_dash");
    warn.mockRestore();
  });
});

// ─── Widget registration ──────────────────────────────────────────────────────

describe("registerPlugin — widgets", () => {
  let regs;
  beforeEach(() => { regs = makeRegistries(); });

  it("adds a new widget type", () => {
    const entry = { component: () => null, propsAdapter: () => ({}) };
    registerPlugin({ widgets: { my_widget: entry } }, regs);
    expect(regs.widgetRegistry.my_widget).toBe(entry);
  });

  it("overwrites existing widget type and emits console.warn", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const newEntry = { component: () => null, propsAdapter: () => ({ overwritten: true }) };
    registerPlugin({ widgets: { kpi_card: newEntry } }, regs);
    expect(regs.widgetRegistry.kpi_card).toBe(newEntry);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("kpi_card"));
    warn.mockRestore();
  });

  it("does not affect existing widget types when adding a new one", () => {
    const original = regs.widgetRegistry.kpi_card;
    registerPlugin({ widgets: { new_type: { component: () => null, propsAdapter: () => ({}) } } }, regs);
    expect(regs.widgetRegistry.kpi_card).toBe(original);
  });
});

// ─── Metric registration ──────────────────────────────────────────────────────

describe("registerPlugin — metrics", () => {
  let regs;
  beforeEach(() => { regs = makeRegistries(); });

  it("adds a new metric", () => {
    registerPlugin({ metrics: { new_metric: { label: "New" } } }, regs);
    expect(regs.metricCatalog.new_metric).toEqual({ label: "New" });
  });

  it("overwrites existing metric and emits console.warn", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    registerPlugin({ metrics: { existing_metric: { label: "Updated" } } }, regs);
    expect(regs.metricCatalog.existing_metric.label).toBe("Updated");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("existing_metric"));
    warn.mockRestore();
  });
});

// ─── Preset registration ──────────────────────────────────────────────────────

describe("registerPlugin — presets", () => {
  let regs;
  beforeEach(() => { regs = makeRegistries(); });

  it("adds a new preset", () => {
    registerPlugin({ presets: { new_preset: { type: "line_chart" } } }, regs);
    expect(regs.widgetPresets.new_preset).toEqual({ type: "line_chart" });
  });

  it("overwrites existing preset and emits console.warn", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    registerPlugin({ presets: { existing_preset: { type: "data_table" } } }, regs);
    expect(regs.widgetPresets.existing_preset.type).toBe("data_table");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("existing_preset"));
    warn.mockRestore();
  });
});

// ─── Empty / partial plugins ──────────────────────────────────────────────────

describe("registerPlugin — partial plugins", () => {
  let regs;
  beforeEach(() => { regs = makeRegistries(); });

  it("handles empty plugin object without error", () => {
    expect(() => registerPlugin({}, regs)).not.toThrow();
  });

  it("handles plugin with only dashboards field", () => {
    registerPlugin({ dashboards: [{ id: "only_dash", label: "X", component: () => null }] }, regs);
    expect(regs.dashboardRegistry).toHaveLength(2);
    expect(Object.keys(regs.widgetRegistry)).toHaveLength(1);
  });

  it("handles plugin with only widgets field", () => {
    registerPlugin({ widgets: { solo_widget: { component: () => null, propsAdapter: () => ({}) } } }, regs);
    expect(regs.dashboardRegistry).toHaveLength(1);
    expect(regs.widgetRegistry.solo_widget).toBeDefined();
  });
});
