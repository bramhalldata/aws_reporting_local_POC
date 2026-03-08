import DlqOperations from "./dlq_operations/DlqOperations.jsx";
import PipelineHealth from "./pipeline_health/PipelineHealth.jsx";

// Component registry — drives routing. Maps dashboard_id → view component.
// To add a new dashboard: import its view component and add one entry here AND to dashboardMeta below.
export const dashboards = {
  dlq_operations: DlqOperations,
  pipeline_health: PipelineHealth,
};

// Navigation metadata — drives NavBar tab rendering.
// Array form ensures explicit tab ordering (no implicit object key order dependency).
// IMPORTANT: keep ids in sync with dashboards keys above. Both must be updated together.
export const dashboardMeta = [
  { id: "dlq_operations",  label: "DLQ Operations" },
  { id: "pipeline_health", label: "Pipeline Health" },
];
