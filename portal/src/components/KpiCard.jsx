import { theme } from "../theme/cashmereTheme";

const styles = {
  kpiCard: {
    flex: "1 1 200px",
    background: theme.surface,
    border: `1px solid ${theme.border}`,
    borderRadius: 8,
    padding: "1.25rem 1.5rem",
    boxShadow: "0 1px 3px rgba(0,0,0,.06)",
  },
  kpiLabel: {
    fontSize: "0.75rem",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.07em",
    color: theme.textSecondary,
    marginBottom: "0.5rem",
  },
  kpiValue: {
    fontSize: "2.25rem",
    fontWeight: 700,
    color: theme.error,
  },
};

export default function KpiCard({ label, value }) {
  return (
    <div style={styles.kpiCard}>
      <div style={styles.kpiLabel}>{label}</div>
      <div style={styles.kpiValue}>{value.toLocaleString()}</div>
    </div>
  );
}
