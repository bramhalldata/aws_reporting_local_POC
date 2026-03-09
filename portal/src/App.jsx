import { useEffect } from "react";
import { Routes, Route, Navigate, useNavigate, useParams } from "react-router-dom";
import { dashboards, dashboardMeta } from "./dashboards/index.js";
import AppShell from "./AppShell.jsx";
import RunHistory from "./pages/RunHistory.jsx";
import RunDetail from "./pages/RunDetail.jsx";

const DEFAULT_CLIENT = "default";
const DEFAULT_ENV    = "local";

// Registry-driven default: first entry in dashboardMeta.
// Changing the first entry in dashboardMeta changes the default landing page.
const defaultDashboard = dashboardMeta[0].id;

// Legacy redirect components — Navigate cannot inject dynamic route params,
// so wrapper components using useParams() + useNavigate() are required.
function LegacyHistoryRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(`/${DEFAULT_CLIENT}/${DEFAULT_ENV}/history`, { replace: true });
  }, []);
  return null;
}

function LegacyRunDetailRedirect() {
  const { runId, dashboardId } = useParams();
  const navigate = useNavigate();
  useEffect(() => {
    navigate(`/${DEFAULT_CLIENT}/${DEFAULT_ENV}/history/${runId}/${dashboardId}`, { replace: true });
  }, []);
  return null;
}

// Router shell — /:client/:env parent wraps all routes in AppShell.
// Dashboard routes are relative (no leading /) inside the parent.
export default function App() {
  return (
    <Routes>
      <Route path="/:client/:env" element={<AppShell />}>
        {Object.entries(dashboards).map(([id, Component]) => (
          <Route key={id} path={id} element={<Component />} />
        ))}
        <Route path="history/:runId/:dashboardId" element={<RunDetail />} />
        <Route path="history" element={<RunHistory />} />
        <Route path="*" element={<Navigate to={defaultDashboard} replace />} />
      </Route>

      {/* Legacy redirects — preserve old bookmarks */}
      <Route path="/history/:runId/:dashboardId" element={<LegacyRunDetailRedirect />} />
      <Route path="/history" element={<LegacyHistoryRedirect />} />
      <Route path="*" element={<Navigate to={`/${DEFAULT_CLIENT}/${DEFAULT_ENV}/${defaultDashboard}`} replace />} />
    </Routes>
  );
}
