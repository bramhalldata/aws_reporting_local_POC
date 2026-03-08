import { theme } from "../theme/cashmereTheme";

const styles = {
  tableCard: {
    background: theme.surface,
    border: `1px solid ${theme.border}`,
    borderRadius: 8,
    boxShadow: "0 1px 3px rgba(0,0,0,.06)",
    overflow: "hidden",
  },
  tableTitle: {
    fontSize: "0.9rem",
    fontWeight: 600,
    color: theme.textPrimary,
    padding: "1rem 1.25rem",
    borderBottom: `1px solid ${theme.border}`,
    background: theme.background,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
  },
  th: {
    textAlign: "left",
    padding: "0.65rem 1.25rem",
    fontSize: "0.75rem",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.07em",
    color: theme.textSecondary,
    background: theme.background,
    borderBottom: `1px solid ${theme.border}`,
  },
  td: {
    padding: "0.65rem 1.25rem",
    fontSize: "0.9rem",
    borderBottom: `1px solid ${theme.divider}`,
  },
};

export default function TopSitesTable({ title, sites }) {
  return (
    <div style={styles.tableCard}>
      <div style={styles.tableTitle}>{title}</div>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Site</th>
            <th style={styles.th}>Failures</th>
          </tr>
        </thead>
        <tbody>
          {sites.map((row) => (
            <tr key={row.site}>
              <td style={styles.td}>{row.site}</td>
              <td style={styles.td}>{row.failures.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
