import { theme } from "../theme/cashmereTheme";

const styles = {
  bannerBase: {
    display: "flex",
    flexWrap: "wrap",
    gap: "0",
    borderRadius: 8,
    padding: "0.75rem 1.25rem",
    marginBottom: "1.5rem",
    alignItems: "center",
    rowGap: "0.5rem",
  },
  bannerField: {
    display: "flex",
    flexDirection: "column",
    paddingRight: "2rem",
  },
  bannerLabel: {
    fontSize: "0.65rem",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.07em",
    color: theme.textMuted,
    marginBottom: "0.2rem",
  },
  bannerValue: {
    fontSize: "0.8rem",
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

function getBannerStyle(status) {
  if (status === "SUCCESS") {
    return { background: theme.successBg, border: `1px solid ${theme.successBorder}` };
  }
  if (status === "WARNING") {
    return { background: theme.warningBg, border: `1px solid ${theme.warningBorder}` };
  }
  return { background: theme.errorBg, border: `1px solid ${theme.errorBorder}` };
}

function getStatusPillStyle(status) {
  if (status === "SUCCESS") {
    return { background: theme.successBg, color: theme.successText };
  }
  if (status === "WARNING") {
    return { background: theme.warningBg, color: theme.warningText };
  }
  return { background: theme.errorBg, color: theme.errorText };
}

export default function HealthBanner({ status, generatedAt, reportTs, schemaVersion }) {
  return (
    <div style={{ ...styles.bannerBase, ...getBannerStyle(status) }}>
      <div style={styles.bannerField}>
        <span style={styles.bannerLabel}>Status</span>
        <span style={{ ...styles.pill, ...getStatusPillStyle(status) }}>{status}</span>
      </div>
      <div style={styles.bannerField}>
        <span style={styles.bannerLabel}>Data as of</span>
        <span style={styles.bannerValue}>{reportTs}</span>
      </div>
      <div style={styles.bannerField}>
        <span style={styles.bannerLabel}>Generated</span>
        <span style={styles.bannerValue}>{generatedAt}</span>
      </div>
      <div style={styles.bannerField}>
        <span style={styles.bannerLabel}>Schema</span>
        <span style={styles.bannerValue}>{schemaVersion}</span>
      </div>
    </div>
  );
}
