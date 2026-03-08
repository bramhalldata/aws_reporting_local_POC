import DlqOperations from "./dlq_operations/DlqOperations.jsx";
import PipelineHealth from "./pipeline_health/PipelineHealth.jsx";

// Registry: maps dashboard_id → view component.
// To add a new dashboard: import its view component and add one entry here.
export const dashboards = {
  dlq_operations: DlqOperations,
  pipeline_health: PipelineHealth,
};
