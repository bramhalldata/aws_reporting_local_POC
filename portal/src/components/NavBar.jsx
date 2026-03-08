import { NavLink } from "react-router-dom";
import { theme } from "../theme/cashmereTheme";
import { dashboards, dashboardMeta } from "../dashboards/index.js";

// Dev-only: warn if a dashboardMeta entry has no matching route in the dashboards registry.
// Vite tree-shakes import.meta.env.DEV blocks in production builds — zero production cost.
if (import.meta.env.DEV) {
  const routeIds = new Set(Object.keys(dashboards));
  dashboardMeta.forEach(({ id }) => {
    if (!routeIds.has(id)) {
      console.warn(
        `NavBar: dashboardMeta entry "${id}" has no matching route in the dashboards registry.`
      );
    }
  });
}

const styles = {
  // NavBar is intentionally full-width; dashboard content centers at maxWidth 900 below.
  nav: {
    background: theme.navBg,
    borderBottom: `1px solid ${theme.navBorder}`,
    display: "flex",
    alignItems: "center",
    padding: "0 1.5rem",
    height: "3rem",
  },
  brand: {
    fontSize: "0.875rem",
    fontWeight: 700,
    color: theme.textPrimary,
    letterSpacing: "0.04em",
    marginRight: "2rem",
    flexShrink: 0,
  },
  tabList: {
    display: "flex",
    alignItems: "stretch",
    height: "100%",
    // NOTE: tab overflow threshold is approximately 6–8 tabs at standard viewport widths.
    // When approaching that count, address with a dropdown or scrollable tab strategy.
  },
  tab: (isActive) => ({
    display: "flex",
    alignItems: "center",
    padding: "0 1rem",
    fontSize: "0.875rem",
    fontWeight: isActive ? 600 : 400,
    color: isActive ? theme.navActiveText : theme.navText,
    textDecoration: "none",
    borderBottom: isActive
      ? `2px solid ${theme.navActiveBorder}`
      : "2px solid transparent",
    whiteSpace: "nowrap",
  }),
};

export default function NavBar() {
  return (
    <nav style={styles.nav}>
      <span style={styles.brand}>Reporting Platform</span>
      <div style={styles.tabList}>
        {dashboardMeta.map(({ id, label }) => (
          <NavLink
            key={id}
            to={`/${id}`}
            style={({ isActive }) => styles.tab(isActive)}
          >
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
