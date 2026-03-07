import { useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// Styles — inline to keep the portal self-contained with no build tooling deps
// ---------------------------------------------------------------------------

const styles = {
  page: {
    maxWidth: 900,
    margin: "0 auto",
    padding: "2rem 1.5rem",
  },
  header: {
    marginBottom: "2rem",
    borderBottom: "2px solid #e2e8f0",
    paddingBottom: "1rem",
  },
  title: {
    fontSize: "1.75rem",
    fontWeight: 700,
    color: "#0f172a",
  },
  freshness: {
    fontSize: "0.8rem",
    color: "#64748b",
    marginTop: "0.35rem",
  },
  kpiRow: {
    display: "flex",
    gap: "1.25rem",
    marginBottom: "2rem",
    flexWrap: "wrap",
  },
  kpiCard: {
    flex: "1 1 200px",
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    padding: "1.25rem 1.5rem",
    boxShadow: "0 1px 3px rgba(0,0,0,.06)",
  },
  kpiLabel: {
    fontSize: "0.75rem",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.07em",
    color: "#64748b",
    marginBottom: "0.5rem",
  },
  kpiValue: {
    fontSize: "2.25rem",
    fontWeight: 700,
    color: "#dc2626",
  },
  tableCard: {
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    boxShadow: "0 1px 3px rgba(0,0,0,.06)",
    overflow: "hidden",
  },
  tableTitle: {
    fontSize: "0.9rem",
    fontWeight: 600,
    color: "#0f172a",
    padding: "1rem 1.25rem",
    borderBottom: "1px solid #e2e8f0",
    background: "#f8fafc",
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
    color: "#64748b",
    background: "#f8fafc",
    borderBottom: "1px solid #e2e8f0",
  },
  td: {
    padding: "0.65rem 1.25rem",
    fontSize: "0.9rem",
    borderBottom: "1px solid #f1f5f9",
  },
  errorBox: {
    background: "#fef2f2",
    border: "1px solid #fecaca",
    borderRadius: 8,
    padding: "1.25rem 1.5rem",
    color: "#991b1b",
    fontWeight: 500,
  },
  loading: {
    color: "#64748b",
    fontSize: "0.95rem",
  },
};

// ---------------------------------------------------------------------------
// Data loading — portal is presentation-only; no metrics computed here
// ---------------------------------------------------------------------------

async function loadArtifacts() {
  // Step 1: load manifest to confirm pipeline status and discover artifacts
  const manifestRes = await fetch("/manifest.json");
  if (!manifestRes.ok) {
    throw new Error(
      `manifest.json not found (HTTP ${manifestRes.status}). Run the publisher first: python src/publisher/main.py`
    );
  }
  const manifest = await manifestRes.json();

  if (manifest.status !== "ok") {
    throw new Error(`Publisher reported status: "${manifest.status}". Check publisher logs.`);
  }

  if (!manifest.artifacts.includes("summary.json")) {
    throw new Error("manifest.json does not list summary.json. Re-run the publisher.");
  }

  // Step 2: load summary artifact
  const summaryRes = await fetch("/summary.json");
  if (!summaryRes.ok) {
    throw new Error(`summary.json not found (HTTP ${summaryRes.status}).`);
  }
  const summary = await summaryRes.json();

  return { manifest, summary };
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function KpiCard({ label, value }) {
  return (
    <div style={styles.kpiCard}>
      <div style={styles.kpiLabel}>{label}</div>
      <div style={styles.kpiValue}>{value.toLocaleString()}</div>
    </div>
  );
}

function TopSitesTable({ sites }) {
  return (
    <div style={styles.tableCard}>
      <div style={styles.tableTitle}>Top Sites by Failures (last 7 days)</div>
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

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export default function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadArtifacts()
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return (
      <div style={styles.page}>
        <div style={styles.errorBox}>Error: {error}</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={styles.page}>
        <p style={styles.loading}>Loading artifacts...</p>
      </div>
    );
  }

  const { summary } = data;

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.title}>DLQ Operations</h1>
        <p style={styles.freshness}>
          Generated: {summary.generated_at} &nbsp;|&nbsp; Report window ends: {summary.report_ts}
        </p>
      </header>

      <div style={styles.kpiRow}>
        <KpiCard label="Failures — last 24 h" value={summary.failures_last_24h} />
        <KpiCard label="Failures — last 7 days" value={summary.failures_last_7d} />
      </div>

      <TopSitesTable sites={summary.top_sites} />
    </div>
  );
}
