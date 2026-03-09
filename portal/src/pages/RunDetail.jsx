import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { theme } from "../theme/cashmereTheme";

// Route: /history/:runId/:dashboardId
//
// Route stability: this URL is a stable contract. When the Artifact File Serving Expansion
// is implemented, RunDetail internals will be updated to add clickable artifact file links,
// but the route path itself must not change.
//
// Data source: run_history.json is the canonical source for both the Run History list view
// and this detail view. No additional artifact fetches are made here.
//
// Artifact file links are NOT available in this phase. They are deferred to the
// Artifact File Serving Expansion (publicDir migration).

const styles = {
  page: {
    maxWidth: 900,
    margin: "0 auto",
    padding: "2rem 1.5rem",
    background: theme.background,
    minHeight: "100vh",
  },
  backLink: {
    display: "inline-block",
    fontSize: "0.875rem",
    color: theme.navActiveText,
    textDecoration: "none",
    marginBottom: "1.5rem",
    fontWeight: 500,
  },
  header: {
    marginBottom: "2rem",
    borderBottom: `2px solid ${theme.border}`,
    paddingBottom: "1rem",
  },
  titleRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    flexWrap: "wrap",
  },
  runId: {
    fontFamily: "monospace",
    fontSize: "1.5rem",
    fontWeight: 700,
    color: theme.textPrimary,
  },
  dashboardBadge: {
    display: "inline-block",
    fontSize: "0.8rem",
    padding: "0.25rem 0.65rem",
    borderRadius: 4,
    background: theme.divider,
    color: theme.textPrimary,
    fontWeight: 500,
  },
  statusPill: (status) => ({
    display: "inline-block",
    fontSize: "0.75rem",
    fontWeight: 600,
    padding: "0.25rem 0.65rem",
    borderRadius: 999,
    background: status === "SUCCESS" ? theme.successBg : theme.errorBg,
    color:      status === "SUCCESS" ? theme.successText : theme.errorText,
    border:     `1px solid ${status === "SUCCESS" ? theme.successBorder : theme.errorBorder}`,
  }),
  card: {
    background: theme.surface,
    border: `1px solid ${theme.border}`,
    borderRadius: 8,
    padding: "1.25rem 1.5rem",
    marginBottom: "1.5rem",
    boxShadow: "0 1px 3px rgba(0,0,0,.06)",
  },
  cardTitle: {
    fontSize: "0.75rem",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.07em",
    color: theme.textSecondary,
    marginBottom: "0.875rem",
    borderBottom: `1px solid ${theme.divider}`,
    paddingBottom: "0.5rem",
  },
  metaRow: {
    display: "flex",
    gap: "0.5rem",
    padding: "0.45rem 0",
    borderBottom: `1px solid ${theme.divider}`,
    fontSize: "0.875rem",
  },
  metaLabel: {
    width: 140,
    flexShrink: 0,
    color: theme.textSecondary,
    fontWeight: 500,
  },
  metaValue: {
    color: theme.textPrimary,
  },
  artifactList: {
    listStyle: "none",
    margin: 0,
    padding: 0,
  },
  artifactItem: {
    padding: "0.35rem 0",
    borderBottom: `1px solid ${theme.divider}`,
    fontSize: "0.875rem",
    color: theme.textSecondary,
  },
  artifactCode: {
    fontFamily: "monospace",
    fontSize: "0.85rem",
    color: theme.textPrimary,
  },
  deferralNote: {
    marginTop: "0.75rem",
    fontSize: "0.8rem",
    color: theme.textMuted,
    fontStyle: "italic",
  },
  warningsNote: {
    fontSize: "0.875rem",
    color: theme.textMuted,
  },
  errorBox: {
    background: theme.errorBg,
    border: `1px solid ${theme.errorBorder}`,
    borderRadius: 8,
    padding: "1.25rem 1.5rem",
    color: theme.errorText,
    fontWeight: 500,
    marginBottom: "1rem",
  },
  loading: { color: theme.textSecondary, fontSize: "0.95rem" },
};

async function loadRun(runId, dashboardId) {
  const res = await fetch("/run_history.json");
  const contentType = res.headers.get("content-type") || "";
  // Vite SPA fallback returns index.html with status 200 for missing static files.
  if (!res.ok || !contentType.includes("application/json")) {
    throw new Error(
      "run_history.json not found. Run the publisher first: python src/publisher/main.py"
    );
  }
  const data = await res.json();
  // Guard against malformed structure before calling .find()
  if (!Array.isArray(data.runs)) {
    throw new Error(
      "run_history.json is malformed: 'runs' field is missing or not an array."
    );
  }
  const entry = data.runs.find(
    (r) => r.run_id === runId && r.dashboard_id === dashboardId
  );
  if (!entry) throw new Error(`Run not found: ${runId} / ${dashboardId}`);
  return entry;
}

function formatTs(isoString) {
  return isoString.replace("T", " ").replace("+00:00", " UTC").replace("Z", " UTC");
}

export default function RunDetail() {
  const { runId, dashboardId } = useParams();
  const [run, setRun]     = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadRun(runId, dashboardId).then(setRun).catch((err) => setError(err.message));
  }, [runId, dashboardId]);

  const backLink = <Link to="/history" style={styles.backLink}>← Run History</Link>;

  if (error)
    return (
      <div style={styles.page}>
        {backLink}
        <div style={styles.errorBox}>Error: {error}</div>
      </div>
    );
  if (!run)
    return <div style={styles.page}>{backLink}<p style={styles.loading}>Loading run detail...</p></div>;

  return (
    <div style={styles.page}>
      {backLink}

      <header style={styles.header}>
        <div style={styles.titleRow}>
          <span style={styles.runId}>{run.run_id}</span>
          <span style={styles.dashboardBadge}>{run.dashboard_id}</span>
          <span style={styles.statusPill(run.status)}>{run.status}</span>
        </div>
      </header>

      {/* Metadata */}
      <div style={styles.card}>
        <div style={styles.cardTitle}>Run Metadata</div>
        <div style={styles.metaRow}>
          <span style={styles.metaLabel}>Report time</span>
          <span style={styles.metaValue}>{formatTs(run.report_ts)}</span>
        </div>
        <div style={styles.metaRow}>
          <span style={styles.metaLabel}>Generated at</span>
          <span style={styles.metaValue}>{formatTs(run.generated_at)}</span>
        </div>
        <div style={{ ...styles.metaRow, borderBottom: "none" }}>
          <span style={styles.metaLabel}>Schema version</span>
          <span style={styles.metaValue}>{run.schema_version}</span>
        </div>
      </div>

      {/* Artifacts */}
      <div style={styles.card}>
        <div style={styles.cardTitle}>Artifacts</div>
        <ul style={styles.artifactList}>
          {run.artifacts.map((filename) => (
            <li key={filename} style={styles.artifactItem}>
              <code style={styles.artifactCode}>{filename}</code>
            </li>
          ))}
        </ul>
        <p style={styles.deferralNote}>
          Clickable file links are not yet available. They will be added as part of the
          Artifact File Serving Expansion.
        </p>
      </div>

      {/* Warnings */}
      <div style={styles.card}>
        <div style={styles.cardTitle}>Warnings</div>
        <p style={styles.warningsNote}>
          No warnings recorded. (The publisher does not currently record per-run warnings.)
        </p>
      </div>
    </div>
  );
}
