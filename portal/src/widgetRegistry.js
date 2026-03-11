/**
 * widgetRegistry — maps DashboardDefinition widget type strings to React
 * components and their propsAdapter functions.
 *
 * propsAdapter(widget, data) → props object
 *   widget — the widget definition object from definition.json
 *   data   — the extracted artifact value (scalar or array, per data_source.field)
 *
 * To add a new widget type: add an entry here. No changes to DashboardRenderer
 * are required unless the type needs special layout treatment.
 */
import KpiCard        from "./components/KpiCard.jsx";
import TrendChart     from "./components/TrendChart.jsx";
import TopSitesTable  from "./components/TopSitesTable.jsx";
import ExceptionsTable from "./components/ExceptionsTable.jsx";

export const widgetRegistry = {
  kpi_card: {
    component: KpiCard,
    propsAdapter: (widget, data) => ({
      label: widget.title,
      value: data,
    }),
  },

  line_chart: {
    component: TrendChart,
    propsAdapter: (_widget, data) => ({
      days: data,
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
};
