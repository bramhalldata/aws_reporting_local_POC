import { useState } from "react";
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
    borderBottom: `2px solid ${theme.border}`,
  },
  thRight: {
    textAlign: "right",
    padding: "0.65rem 1.25rem",
    fontSize: "0.75rem",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.07em",
    color: theme.textSecondary,
    background: theme.background,
    borderBottom: `2px solid ${theme.border}`,
  },
  td: {
    padding: "0.65rem 1.25rem",
    fontSize: "0.9rem",
    borderBottom: `1px solid ${theme.divider}`,
  },
  tdRight: {
    padding: "0.65rem 1.25rem",
    fontSize: "0.9rem",
    borderBottom: `1px solid ${theme.divider}`,
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
  },
  trEven: { background: theme.background },
  trHover: { background: "#EFF6FF" },
};

export default function ExceptionsTable({ exceptions, title = "Exceptions by Type — last 7 days" }) {
  const [hoveredRow, setHoveredRow] = useState(null);
  const last = exceptions.length - 1;

  return (
    <div style={styles.tableCard}>
      <div style={styles.tableTitle}>{title}</div>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Failure Type</th>
            <th style={styles.thRight}>Count</th>
          </tr>
        </thead>
        <tbody>
          {exceptions.map((row, i) => {
            const isLast = i === last;
            const tdBase = isLast ? { borderBottom: "none" } : {};
            const trStyle =
              hoveredRow === row.failure_type
                ? styles.trHover
                : i % 2 === 1
                ? styles.trEven
                : {};
            return (
              <tr
                key={row.failure_type}
                style={trStyle}
                onMouseEnter={() => setHoveredRow(row.failure_type)}
                onMouseLeave={() => setHoveredRow(null)}
              >
                <td style={{ ...styles.td, ...tdBase }}>{row.failure_type}</td>
                <td style={{ ...styles.tdRight, ...tdBase }}>
                  {row.count.toLocaleString()}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
