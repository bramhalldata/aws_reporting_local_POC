import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { theme } from "../theme/cashmereTheme";

const styles = {
  page: {
    maxWidth: 900,
    margin: "0 auto",
    padding: "2rem 1.5rem",
    background: theme.background,
    minHeight: "100vh",
  },
  header: {
    marginBottom: "2rem",
    borderBottom: `2px solid ${theme.border}`,
    paddingBottom: "1rem",
  },
  title: {
    fontSize: "1.75rem",
    fontWeight: 700,
    color: theme.textPrimary,
  },
  meta: {
    fontSize: "0.8rem",
    color: theme.textMuted,
    marginTop: "0.35rem",
  },
  tableCard: {
    background: theme.surface,
    border: `1px solid ${theme.border}`,
    borderRadius: 8,
    overflow: "hidden",
    boxShadow: "0 1px 3px rgba(0,0,0,.06)",
  },
  table: { width: "100%", borderCollapse: "collapse" },
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
    fontSize: "0.875rem",
    borderBottom: `1px solid ${theme.divider}`,
    verticalAlign: "middle",
  },
  runId: {
    fontFamily: "monospace",
    fontSize: "0.8rem",
    color: theme.textSecondary,
  },
  dashboardBadge: {
    display: "inline-block",
    fontSize: "0.75rem",
    padding: "0.2rem 0.6rem",
    borderRadius: 4,
    background: theme.divider,
    color: theme.textPrimary,
    fontWeight: 500,
  },
  statusPill: (status) => ({
    display: "inline-block",
    fontSize: "0.75rem",
    fontWeight: 600,
    padding: "0.2rem 0.6rem",
    borderRadius: 999,
    background: status === "SUCCESS" ? theme.successBg : theme.errorBg,
    color:      status === "SUCCESS" ? theme.successText : theme.errorText,
    border:     `1px solid ${status === "SUCCESS" ? theme.successBorder : theme.errorBorder}`,
  }),
  artifacts: {
    fontSize: "0.8rem",
    color: theme.textMuted,
  },
  viewLink: {
    fontSize: "0.8rem",
    color: theme.navActiveText,
    textDecoration: "none",
    fontWeight: 500,
  },
  errorBox: {
    background: theme.errorBg,
    border: `1px solid ${theme.errorBorder}`,
    borderRadius: 8,
    padding: "1.25rem 1.5rem",
    color: theme.errorText,
    fontWeight: 500,
  },
  loading: { color: theme.textSecondary, fontSize: "0.95rem" },
  empty: {
    padding: "2rem 1.25rem",
    color: theme.textMuted,
    fontSize: "0.875rem",
    textAlign: "center",
  },
};

async function loadHistory(client, env) {
  const res = await fetch(`/${client}/${env}/current/run_history.json`);
  const contentType = res.headers.get("content-type") || "";
  // Vite dev server returns index.html (text/html, status 200) for missing static
  // files as an SPA fallback, so checking res.ok alone is not sufficient.
  if (!res.ok || !contentType.includes("application/json")) {
    throw new Error(
      "run_history.json not found. Run the publisher first: python src/publisher/main.py"
    );
  }
  return res.json();
}

function formatTs(isoString) {
  return isoString.replace("T", " ").replace("+00:00", " UTC").replace("Z", " UTC");
}

export default function RunHistory() {
  const { client, env } = useParams();
  const [history, setHistory] = useState(null);
  const [error, setError]     = useState(null);

  useEffect(() => {
    loadHistory(client, env).then(setHistory).catch((err) => setError(err.message));
  }, [client, env]);

  if (error)
    return <div style={styles.page}><div style={styles.errorBox}>Error: {error}</div></div>;
  if (!history)
    return <div style={styles.page}><p style={styles.loading}>Loading run history...</p></div>;

  const { runs, generated_at } = history;

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.title}>Run History</h1>
        <p style={styles.meta}>
          {runs.length} run{runs.length !== 1 ? "s" : ""} recorded
          {" · "}Index generated {formatTs(generated_at)}
        </p>
      </header>

      <div style={styles.tableCard}>
        {runs.length === 0 ? (
          <div style={styles.empty}>
            No runs recorded yet. Run the publisher to see history here.
          </div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Run ID</th>
                <th style={styles.th}>Dashboard</th>
                <th style={styles.th}>Report Time</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Artifacts</th>
                <th style={styles.th}>Detail</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={`${run.run_id}-${run.dashboard_id}`}>
                  <td style={{ ...styles.td, ...styles.runId }}>{run.run_id}</td>
                  <td style={styles.td}>
                    <span style={styles.dashboardBadge}>{run.dashboard_id}</span>
                  </td>
                  <td style={styles.td}>{formatTs(run.report_ts)}</td>
                  <td style={styles.td}>
                    <span style={styles.statusPill(run.status)}>{run.status}</span>
                  </td>
                  <td style={{ ...styles.td, ...styles.artifacts }}>
                    {run.artifacts.map((a) => a.name).join(", ")}
                  </td>
                  <td style={styles.td}>
                    <Link
                      to={`/${client}/${env}/history/${run.run_id}/${run.dashboard_id}`}
                      style={styles.viewLink}
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
