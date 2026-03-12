/**
 * Plugin bootstrap — register dashboard plugins here.
 *
 * This file is imported by App.jsx as a side-effect.  All registerPlugin() calls
 * run at module evaluation time, before any React component renders.
 *
 * To add a plugin:
 *   1. Create portal/src/plugins/<plugin_name>/index.js exporting your plugin object.
 *   2. Import it below and call registerPlugin().
 *
 * Example:
 *
 *   import { registerPlugin }   from "./registerPlugin.js";
 *   import { myReportsPlugin }  from "./my_reports/index.js";
 *
 *   registerPlugin(myReportsPlugin);
 *
 * Convention: one registerPlugin() call per plugin module.
 * See portal/src/plugins/registerPlugin.js for the DashboardPlugin shape.
 */

// No plugins registered yet.
export {};
