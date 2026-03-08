import { Routes, Route, Navigate } from "react-router-dom";
import { dashboards, dashboardMeta } from "./dashboards/index.js";
import AppShell from "./AppShell.jsx";

// Registry-driven default: first entry in dashboardMeta.
// Changing the first entry in dashboardMeta changes the default landing page.
const defaultPath = `/${dashboardMeta[0].id}`;

// Router shell — wraps all routes in AppShell (NavBar + Outlet layout).
// Routes are dynamically generated from the dashboard registry.
export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        {Object.entries(dashboards).map(([id, Component]) => (
          <Route key={id} path={`/${id}`} element={<Component />} />
        ))}
        <Route path="*" element={<Navigate to={defaultPath} replace />} />
      </Route>
    </Routes>
  );
}
