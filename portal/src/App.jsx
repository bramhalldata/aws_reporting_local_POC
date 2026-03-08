import { Routes, Route, Navigate } from "react-router-dom";
import { dashboards } from "./dashboards/index.js";

// Router shell — renders the registered dashboard view for the current URL.
// Default route redirects to /dlq_operations for backward compatibility.
export default function App() {
  return (
    <Routes>
      {Object.entries(dashboards).map(([id, Component]) => (
        <Route key={id} path={`/${id}`} element={<Component />} />
      ))}
      <Route path="*" element={<Navigate to="/dlq_operations" replace />} />
    </Routes>
  );
}
