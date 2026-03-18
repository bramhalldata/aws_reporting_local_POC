/**
 * widgetRegistry — maps DashboardDefinition widget type strings to React
 * components and their propsAdapter functions.
 *
 * -------------------------------------------------------------------------
 * Entry contract
 * -------------------------------------------------------------------------
 *
 * @typedef {Object} WidgetRegistryEntry
 * @property {React.ComponentType} component
 *   The React component to render.
 * @property {function(widget: Object, data: *, filterState: Object): Object} propsAdapter
 *   Maps the widget definition and extracted artifact data to component props.
 *   - widget:      the full widget definition object from definition.json
 *   - data:        the artifact value after data_source.field extraction
 *                  (scalar for kpi_card; array for tables/charts; object for full payload)
 *   - filterState: { [filterId]: value } map from useFilterState; may be undefined.
 *                  Existing adapters that ignore this argument are unaffected.
 *
 * Note: entry shape is not enforced at runtime. An incorrect entry
 * (e.g. misspelled key) will fail silently at render time — verify by
 * loading the dashboard after adding a new type.
 *
 * -------------------------------------------------------------------------
 * How to add a new widget type
 * -------------------------------------------------------------------------
 *
 * 1. Create a component in portal/src/components/<TypeName>.jsx
 * 2. Import it below
 * 3. Add an entry to widgetRegistry:
 *      my_type: {
 *        component: MyComponent,
 *        propsAdapter: (widget, data) => ({ ...props }),
 *      }
 * 4. Reference the type string in a definition.json widget entry
 * 5. No changes to DashboardRenderer or WidgetRenderer are required
 *
 * -------------------------------------------------------------------------
 * Type catalog
 * -------------------------------------------------------------------------
 *
 * Registered types:
 *
 *   kpi_card         → KpiCard           data: scalar (number or string)
 *   line_chart       → TrendChart        data: array of { date: string, [dataKey]: number }
 *   data_table       → TopSitesTable     data: array of { site: string, failures: number }
 *   exceptions_table → ExceptionsTable   data: array of { failure_type: string, count: number }
 *   generic_table    → GenericTable      data: array of row objects; column config in widget.columns
 *
 * PLANNED (not yet registered — add entries when components exist):
 *   bar_chart    → future BarChart component
 *   text_block   → future TextBlock component
 *   alert_panel  → future AlertPanel component
 */
import KpiCard         from "./components/KpiCard.jsx";
import TrendChart      from "./components/TrendChart.jsx";
import TopSitesTable   from "./components/TopSitesTable.jsx";
import ExceptionsTable from "./components/ExceptionsTable.jsx";
import GenericTable    from "./components/GenericTable.jsx";
import { metricCatalog } from "./metricCatalog.js";

// ---------------------------------------------------------------------------
// evaluateThresholds — returns the tone of the first matching threshold rule,
// or null if no rule matches or the value is not a number.
// ---------------------------------------------------------------------------
function evaluateThresholds(thresholds, value) {
  if (!Array.isArray(thresholds) || typeof value !== "number") return null;
  for (const rule of thresholds) {
    const match =
      rule.op === ">=" ? value >= rule.value :
      rule.op === ">"  ? value >  rule.value :
      rule.op === "<=" ? value <= rule.value :
      rule.op === "<"  ? value <  rule.value :
      rule.op === "==" ? value === rule.value :
      false;
    if (match) return rule.tone;
  }
  return null;
}

export const widgetRegistry = {
  kpi_card: {
    component: KpiCard,
    propsAdapter: (widget, data) => {
      // Resolve catalog defaults when widget.metric is set.
      const catalogEntry = widget.metric ? metricCatalog[widget.metric] : null;

      // Label: catalog → widget.title override
      const label = widget.title ?? catalogEntry?.label;

      // Tone: catalog default → threshold override → kpi_config.tone override
      const catalogTone      = catalogEntry?.tone ?? "neutral";
      const thresholdTone    = evaluateThresholds(catalogEntry?.thresholds, data);
      const { tone: configTone, footnote, delta, sparklineData } = widget.kpi_config ?? {};
      const tone = configTone ?? thresholdTone ?? catalogTone;

      // Footnote: catalog default → kpi_config.footnote override
      const resolvedFootnote = footnote ?? catalogEntry?.footnote;

      // Datetime values: format to short locale string and use a smaller font size.
      const formatter = catalogEntry?.formatter;
      let value = data;
      let valueFontSize;
      if (formatter === "datetime" && value != null) {
        value = new Date(value).toLocaleString(undefined, {
          month: "short", day: "numeric", year: "numeric",
          hour: "2-digit", minute: "2-digit",
        });
        valueFontSize = "1.4rem";
      } else if (formatter === "date_string" && value != null) {
        value = String(value).slice(0, 10);
        valueFontSize = "1.4rem";
      }

      return { label, value, tone, footnote: resolvedFootnote, delta, sparklineData, valueFontSize };
    },
  },

  line_chart: {
    component: TrendChart,
    propsAdapter: (widget, data) => ({
      days: data,
      dataKey:    widget.line_chart_config?.data_key,
      chartTitle: widget.line_chart_config?.title,
      subtitle:   widget.line_chart_config?.subtitle,
    }),
  },

  data_table: {
    component: TopSitesTable,
    propsAdapter: (widget, data) => ({
      title: widget.title,
      sites: data,
    }),
  },

  exceptions_table: {
    component: ExceptionsTable,
    propsAdapter: (widget, data) => ({
      exceptions: data,
      title: widget.title,
    }),
  },

  generic_table: {
    component: GenericTable,
    propsAdapter: (widget, data) => ({
      title:        widget.title,
      rows:         data,
      columns:      widget.columns ?? [],
      totals:       widget.totals ?? false,
      emptyMessage: widget.empty_message,
    }),
  },

  // PLANNED (not yet registered):
  // bar_chart, text_block, alert_panel
};
