import { Outlet, useParams } from "react-router-dom";
import NavBar from "./components/NavBar.jsx";
import { theme } from "./theme/cashmereTheme";

// Layout shell — identity bar (client/env context) + NavBar + Outlet.
export default function AppShell() {
  const { client, env } = useParams();
  return (
    <div>
      <div style={{
        background: theme.surface,
        borderBottom: `1px solid ${theme.border}`,
        padding: "0.3rem 1.5rem",
        fontSize: "0.75rem",
        color: theme.textMuted,
      }}>
        {client} / {env}
      </div>
      <NavBar />
      <Outlet />
    </div>
  );
}
