/**
 * widgetPresets — shared widget binding templates for cross-dashboard reuse.
 *
 * A preset defines the stable binding for a widget: type, metric, data_source,
 * and default layout.  Dashboards reference a preset by ID via the "preset" field
 * in definition.json.  Dashboard-local fields override preset defaults (shallow merge).
 *
 * -------------------------------------------------------------------------
 * When to add a preset
 * -------------------------------------------------------------------------
 *
 * Only add a preset when the same widget binding (type + metric + data_source)
 * appears in two or more dashboards.  Dashboard-specific widgets should stay
 * inline in definition.json.
 *
 * -------------------------------------------------------------------------
 * Merge semantics
 * -------------------------------------------------------------------------
 *
 * resolved widget = { ...preset fields, ...dashboard-local fields }
 *
 * Merge is shallow: if "layout" is specified locally, the full local layout
 * object replaces the preset's layout (not field-by-field).
 *
 * The "id" field is always dashboard-local and is never set in a preset.
 *
 * -------------------------------------------------------------------------
 * How to add a new preset
 * -------------------------------------------------------------------------
 *
 * 1. Add an entry below with a descriptive snake_case ID.
 *    Convention: <metric_id>_kpi for KPI card presets.
 * 2. Reference it in a definition.json widget: { "id": "...", "preset": "<id>" }
 * 3. Override any field locally if the dashboard needs a different value.
 *
 * See docs/guides/add-dashboard.md for usage examples.
 */

export const widgetPresets = {
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
