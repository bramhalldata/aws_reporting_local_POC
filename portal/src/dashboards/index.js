import DlqOperations from "./dlq_operations/DlqOperations.jsx";

// Registry: maps dashboard_id → view component.
// To add a new dashboard: import its view component and add one entry here.
export const dashboards = {
  dlq_operations: DlqOperations,
};
