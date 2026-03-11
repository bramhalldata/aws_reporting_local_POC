import { theme } from "../theme/cashmereTheme";

const styles = {
  kpiCard: {
    flex: "1 1 200px",
    background: theme.surface,
    border: `1px solid ${theme.border}`,
    borderTop: `3px solid ${theme.primaryBlue}`,
    borderRadius: 8,
    padding: "1.5rem 1.75rem",
    boxShadow: "0 2px 8px rgba(0,0,0,.07), 0 1px 3px rgba(0,0,0,.04)",
  },
  kpiValue: {
    fontSize: "2.75rem",
    fontWeight: 700,
    color: theme.textPrimary,
    lineHeight: 1,
    marginBottom: "0.4rem",
  },
  kpiLabel: {
    fontSize: "0.7rem",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.07em",
    color: theme.textMuted,
  },
};

export default function KpiCard({ label, value }) {
  return (
    <div style={styles.kpiCard}>
      <div style={styles.kpiValue}>{value.toLocaleString()}</div>
      <div style={styles.kpiLabel}>{label}</div>
    </div>
  );
}
