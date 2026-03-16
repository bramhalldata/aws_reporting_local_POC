import { theme } from "../theme/cashmereTheme";

const styles = {
  bannerBase: {
    display: "flex",
    flexWrap: "wrap",
    columnGap: "2rem",
    rowGap: "0.25rem",
    borderRadius: 8,
    padding: "0.5rem 1.25rem",
    marginBottom: "1rem",
    alignItems: "center",
  },
  bannerField: {
    display: "flex",
    flexDirection: "column",
  },
  bannerLabel: {
    fontSize: "0.6rem",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.07em",
    color: theme.textMuted,
    marginBottom: "0.2rem",
  },
  bannerValue: {
    fontSize: "0.75rem",
    color: theme.textPrimary,
    fontFamily: "monospace",
  },
  pill: {
    display: "inline-block",
    padding: "0.2rem 0.6rem",
    borderRadius: 999,
    fontSize: "0.75rem",
    fontWeight: 700,
    letterSpacing: "0.05em",
  },
};

function getStatusPillStyle(status) {
  if (status === "SUCCESS") {
    return { background: theme.successBg, color: theme.successText };
  }
  if (status === "WARNING") {
    return { background: theme.warningBg, color: theme.warningText };
  }
  return { background: theme.errorBg, color: theme.errorText };
}

function fmtDate(isoStr) {
  return isoStr ? isoStr.replace("T", " ").replace("Z", " UTC") : "—";
}

export default function HealthBanner({ status, generatedAt, reportTs, schemaVersion }) {
  const bannerStyle = {
    ...styles.bannerBase,
    background: theme.surface,
    border: `1px solid ${theme.border}`,
  };

  return (
    <div style={bannerStyle}>
      <div style={styles.bannerField}>
        <span style={styles.bannerLabel}>Status</span>
        <span style={{ ...styles.pill, ...getStatusPillStyle(status) }}>{status}</span>
      </div>
      <div style={styles.bannerField}>
        <span style={styles.bannerLabel}>Data as of</span>
        <span style={styles.bannerValue}>{fmtDate(reportTs)}</span>
      </div>
      <div style={styles.bannerField}>
        <span style={styles.bannerLabel}>Generated</span>
        <span style={styles.bannerValue}>{fmtDate(generatedAt)}</span>
      </div>
      <div style={styles.bannerField}>
        <span style={styles.bannerLabel}>Schema</span>
        <span style={styles.bannerValue}>{schemaVersion}</span>
      </div>
    </div>
  );
}
