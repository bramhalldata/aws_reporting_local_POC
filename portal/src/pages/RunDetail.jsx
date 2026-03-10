import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { theme } from "../theme/cashmereTheme";

// Route: /:client/:env/history/:runId/:dashboardId  (stable contract — do not change)
//
// Data source: /{client}/{env}/current/run_history.json — canonical source for both list and detail views.
// Artifact objects carry { name, type, path } since run_history.json schema v1.1.0.
// Clickable artifact links resolve to /<artifact.path> (e.g. /{client}/{env}/runs/<runId>/<dashboardId>/<name>),
// served from the artifacts/ publicDir tree. artifact.path is publisher-owned — no portal computation.

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
  artifactLink: {
    fontFamily: "monospace",
    fontSize: "0.85rem",
    color: theme.navActiveText,
    textDecoration: "none",
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

async function loadRun(client, env, runId, dashboardId) {
  const res = await fetch(`/${client}/${env}/current/run_history.json`);
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
  const { client, env, runId, dashboardId } = useParams();
  const [run, setRun]     = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadRun(client, env, runId, dashboardId).then(setRun).catch((err) => setError(err.message));
  }, [client, env, runId, dashboardId]);

  const backLink = <Link to={`/${client}/${env}/history`} style={styles.backLink}>← Run History</Link>;

  // Compare entry point: navigates to history with this run pre-selected as base.
  // The user then picks the target run from the list.
  const compareParams = new URLSearchParams({ compareBase: run?.run_id ?? "", compareDashboard: run?.dashboard_id ?? "" });
  const compareLink = run
    ? <Link to={`/${client}/${env}/history?${compareParams.toString()}`} style={{ ...styles.backLink, marginLeft: "1.5rem" }}>Compare with another run →</Link>
    : null;

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
      <div>{backLink}{compareLink}</div>

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
          {run.artifacts.map((artifact) => (
            <li key={artifact.name} style={styles.artifactItem}>
              <a
                href={`/${artifact.path}`}
                style={styles.artifactLink}
                target="_blank"
                rel="noreferrer"
              >
                {artifact.name}
              </a>
            </li>
          ))}
        </ul>
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
