import DlqOperations  from "./dlq_operations/DlqOperations.jsx";
import PipelineHealth from "./pipeline_health/PipelineHealth.jsx";
import SentToUdm     from "./sent_to_udm/SentToUdm.jsx";

/**
 * dashboardRegistry — single source of truth for all registered dashboards.
 *
 * @typedef {Object} DashboardRegistryEntry
 * @property {string}              id         Route segment and unique key.
 * @property {string}              label      NavBar tab label.
 * @property {React.ComponentType} component  View component rendered at this route.
 *
 * Array order controls NavBar tab order.
 *
 * To add a dashboard:
 *   1. Create the view component in a new dashboards/<id>/ folder.
 *   2. Import it above.
 *   3. Add one entry to dashboardRegistry below.
 *   No other files need to change.
 */
export const dashboardRegistry = [
  { id: "dlq_operations",  label: "DLQ Operations",  component: DlqOperations  },
  { id: "pipeline_health", label: "Pipeline Health", component: PipelineHealth },
  { id: "sent_to_udm",     label: "CCD Sent to UDM", component: SentToUdm     },
];
