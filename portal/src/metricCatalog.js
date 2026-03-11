/**
 * metricCatalog — centralised metric definitions for the reporting portal.
 *
 * Each entry defines the display semantics for one logical metric.
 * Widgets reference a metric by ID via the "metric" field in definition.json,
 * removing the need to duplicate label, tone, formatting rules, and footnotes
 * inline on every widget.
 *
 * -------------------------------------------------------------------------
 * Metric definition shape
 * -------------------------------------------------------------------------
 *
 * @typedef {Object} MetricDefinition
 * @property {string}            label             Eyebrow label rendered by KpiCard.
 * @property {string}            formatter         "number" | "string" | "currency" | "percent"
 * @property {string}            tone              Default tone: "neutral" | "positive" | "warning" | "critical"
 * @property {string|null}       footnote          Default footnote text (null = none).
 * @property {string|null}       data_source_field Advisory artifact field name.
 *                                                 Not enforced by the propsAdapter in this feature.
 *                                                 Present so the data-binding contract is visible.
 *                                                 Full auto-binding is deferred to a future feature.
 * @property {object|null}       trend             Reserved for Phase 6 trend arrows.
 *                                                 { direction: "up_good" | "down_good" }
 * @property {Array<object>}     thresholds        Ordered tone-override rules; first match wins.
 *                                                 Each rule: { op: ">=" | ">" | "<=" | "<" | "==", value: number, tone: string }
 *
 * -------------------------------------------------------------------------
 * Metric ID ↔ artifact field naming convention
 * -------------------------------------------------------------------------
 *
 * By convention, metric IDs match the artifact field name they represent
 * (e.g. metric "failures_last_24h" maps to summary.json["failures_last_24h"]).
 * This is a naming convention, not an enforcement mechanism.
 * The widget's data_source block remains the authoritative binding.
 *
 * -------------------------------------------------------------------------
 * How to add a new metric
 * -------------------------------------------------------------------------
 *
 * 1. Add an entry below with a unique camelCase or snake_case ID.
 * 2. Reference it in a definition.json widget: "metric": "<id>"
 * 3. The kpi_card propsAdapter in widgetRegistry.js will resolve it automatically.
 */

export const metricCatalog = {
  failures_last_24h: {
    label:             "Failures — last 24 h",
    formatter:         "number",
    tone:              "neutral",
    footnote:          "24-hour rolling window",
    data_source_field: "failures_last_24h",
    trend:             null,
    thresholds:        [],
  },

  failures_last_7d: {
    label:             "Failures — last 7 days",
    formatter:         "number",
    tone:              "neutral",
    footnote:          "7-day rolling window",
    data_source_field: "failures_last_7d",
    trend:             null,
    thresholds:        [],
  },

  total_documents_last_24h: {
    label:             "Documents — last 24 h",
    formatter:         "number",
    tone:              "neutral",
    footnote:          "24-hour rolling window",
    data_source_field: "total_documents_last_24h",
    trend:             null,
    thresholds:        [],
  },

  active_sites_last_24h: {
    label:             "Active Sites — last 24 h",
    formatter:         "number",
    tone:              "neutral",
    footnote:          "Sites with \u22651 event",
    data_source_field: "active_sites_last_24h",
    trend:             null,
    thresholds:        [],
  },

  latest_event_timestamp: {
    label:             "Latest Event",
    formatter:         "datetime",
    tone:              "neutral",
    footnote:          "Most recent pipeline event",
    data_source_field: "latest_event_timestamp",
    trend:             null,
    thresholds:        [],
  },
};
