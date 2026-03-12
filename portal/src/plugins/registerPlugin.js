/**
 * registerPlugin — registers a dashboard plugin into the platform registries.
 *
 * A plugin is a plain object that contributes any combination of dashboards,
 * widget types, metric definitions, and widget presets.  All fields are optional.
 *
 * -------------------------------------------------------------------------
 * Plugin object shape
 * -------------------------------------------------------------------------
 *
 * @typedef {Object} DashboardPlugin
 *
 * @property {Array<{id: string, label: string, component: React.ComponentType}>} [dashboards]
 *   Dashboard registry entries.  Each id must be unique across all registered dashboards.
 *   Adding an entry automatically creates a route and a NavBar tab.
 *
 * @property {Record<string, import("../widgetRegistry.js").WidgetRegistryEntry>} [widgets]
 *   Widget type definitions keyed by widget type string (e.g. "kpi_card").
 *   Entry shape: { component: React.ComponentType, propsAdapter: (widget, data, filterState) => Object }
 *
 * @property {Record<string, Object>} [metrics]
 *   Metric catalog entries keyed by metric id.
 *   Entry shape: { label, formatter, tone, footnote, data_source_field, trend, thresholds }
 *   See portal/src/metricCatalog.js for the full entry shape and existing examples.
 *
 * @property {Record<string, Object>} [presets]
 *   Widget preset templates keyed by preset id.
 *   Entry shape: { type, metric, data_source, layout }
 *   See portal/src/dashboards/widgetPresets.js for existing examples.
 *
 * -------------------------------------------------------------------------
 * Collision behaviour
 * -------------------------------------------------------------------------
 *
 *   dashboards — duplicate id: console.warn + skip (duplicate routes would be unreachable)
 *   widgets    — duplicate key: console.warn + overwrite (intentional upgrades are allowed)
 *   metrics    — duplicate key: console.warn + overwrite
 *   presets    — duplicate key: console.warn + overwrite
 *
 * -------------------------------------------------------------------------
 * IMPORTANT: Direct registry mutation outside this function is unsupported.
 * -------------------------------------------------------------------------
 *
 * Plugins must use registerPlugin() to contribute entries.  Calling Object.assign()
 * or array.push() on registry objects directly bypasses collision guards and
 * leaves no documented extension point.
 *
 * -------------------------------------------------------------------------
 * Usage
 * -------------------------------------------------------------------------
 *
 * @example
 * // portal/src/plugins/my_plugin/index.js
 * import { registerPlugin } from "../registerPlugin.js";
 * import MyDashboard from "./MyDashboard.jsx";
 *
 * registerPlugin({
 *   dashboards: [{ id: "my_dashboard", label: "My Dashboard", component: MyDashboard }],
 * });
 *
 * @param {DashboardPlugin} plugin
 */

import { dashboardRegistry } from "../dashboards/index.js";
import { widgetRegistry }    from "../widgetRegistry.js";
import { metricCatalog }     from "../metricCatalog.js";
import { widgetPresets }     from "../dashboards/widgetPresets.js";

export function registerPlugin(plugin) {
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
