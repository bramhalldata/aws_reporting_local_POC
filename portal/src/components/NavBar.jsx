import { NavLink, useParams } from "react-router-dom";
import { theme } from "../theme/cashmereTheme";
import { dashboardRegistry } from "../dashboards/index.js";

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
  // Phase 2 note: if platform links multiply (Settings, Admin, etc.), consider a
  // platformLinks registry analogous to dashboardMeta rather than hardcoding here.
  platformLinks: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "stretch",
    height: "100%",
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
  const { client, env } = useParams();
  return (
    <nav style={styles.nav}>
      <span style={styles.brand}>Reporting Platform</span>
      <div style={styles.tabList}>
        {dashboardRegistry.map(({ id, label }) => (
          <NavLink
            key={id}
            to={`/${client}/${env}/${id}`}
            style={({ isActive }) => styles.tab(isActive)}
          >
            {label}
          </NavLink>
        ))}
      </div>
      <div style={styles.platformLinks}>
        <NavLink
          to={`/${client}/${env}/history`}
          style={({ isActive }) => styles.tab(isActive)}
        >
          History
        </NavLink>
      </div>
    </nav>
  );
}
