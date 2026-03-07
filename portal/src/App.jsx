import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { theme } from "./theme/cashmereTheme";

// ---------------------------------------------------------------------------
// Styles — inline to keep the portal self-contained with no build tooling deps
// ---------------------------------------------------------------------------

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
  // bannerBase holds structural/layout properties only.
  // Background and border are injected by getBannerStyle(status).
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
  kpiRow: {
    display: "flex",
    gap: "1.25rem",
    marginBottom: "2rem",
    flexWrap: "wrap",
  },
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
  section: {
    marginBottom: "2rem",
  },
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
  tdZero: {
    padding: "0.65rem 1.25rem",
    fontSize: "0.9rem",
    borderBottom: `1px solid ${theme.divider}`,
    color: theme.textMuted,
  },
  errorBox: {
    background: theme.errorBg,
    border: `1px solid ${theme.errorBorder}`,
    borderRadius: 8,
    padding: "1.25rem 1.5rem",
    color: theme.errorText,
    fontWeight: 500,
  },
  loading: {
    color: theme.textSecondary,
    fontSize: "0.95rem",
  },
};

// ---------------------------------------------------------------------------
// Status helpers — semantic banner and pill styling per Cashmere theme
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Data loading — portal is presentation-only; no metrics computed here
// ---------------------------------------------------------------------------

async function loadArtifacts() {
  // Step 1: load manifest to confirm pipeline status and discover artifacts
  const manifestRes = await fetch("/manifest.json");
  if (!manifestRes.ok) {
    throw new Error(
      `manifest.json not found (HTTP ${manifestRes.status}). Run the publisher first: publisher run --env local --dashboard dlq_operations`
    );
  }
  const manifest = await manifestRes.json();

  if (manifest.status !== "SUCCESS") {
    throw new Error(`Publisher reported status: "${manifest.status}". Check publisher logs.`);
  }

  const requireArtifact = (name) => {
    if (!manifest.artifacts.includes(name)) {
      throw new Error(`manifest.json does not list ${name}. Re-run the publisher.`);
    }
  };

  requireArtifact("summary.json");
  requireArtifact("trend_30d.json");
  requireArtifact("top_sites.json");
  requireArtifact("exceptions.json");

  // Step 2: load all payload artifacts
  const fetchJson = async (filename) => {
    const res = await fetch(`/${filename}`);
    if (!res.ok) throw new Error(`${filename} not found (HTTP ${res.status}).`);
    return res.json();
  };

  const [summary, trend30d, topSites, exceptions] = await Promise.all([
    fetchJson("summary.json"),
    fetchJson("trend_30d.json"),
    fetchJson("top_sites.json"),
    fetchJson("exceptions.json"),
  ]);

  return { manifest, summary, trend30d, topSites, exceptions };
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function HealthBanner({ status, generatedAt, reportTs, schemaVersion }) {
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

function KpiCard({ label, value }) {
  return (
    <div style={styles.kpiCard}>
      <div style={styles.kpiLabel}>{label}</div>
      <div style={styles.kpiValue}>{value.toLocaleString()}</div>
    </div>
  );
}

function TopSitesTable({ title, sites }) {
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

function TrendChart({ days }) {
  if (!days || days.length === 0) {
    return (
      <div style={styles.tableCard}>
        <div style={styles.tableTitle}>Failure Trend — last 30 days</div>
        <p style={{ padding: "1.25rem", color: theme.textMuted, margin: 0 }}>No trend data available.</p>
      </div>
    );
  }

  return (
    <div style={styles.tableCard}>
      <div style={styles.tableTitle}>Failure Trend — last 30 days</div>
      <div style={{ padding: "1.25rem 1rem 1rem 0" }}>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={days} margin={{ top: 4, right: 24, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={theme.divider} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: theme.textSecondary }}
              tickFormatter={(d) => d.slice(5)}
              interval={4}
            />
            <YAxis
              allowDecimals={false}
              domain={[0, "auto"]}
              tick={{ fontSize: 11, fill: theme.textSecondary }}
              width={40}
            />
            <Tooltip
              formatter={(value) => [value.toLocaleString(), "Failures"]}
              labelStyle={{ fontWeight: 600, color: theme.textPrimary }}
              contentStyle={{ fontSize: "0.85rem" }}
            />
            <Line
              type="monotone"
              dataKey="failures"
              stroke={theme.primaryBlue}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ExceptionsTable({ exceptions }) {
  return (
    <div style={styles.tableCard}>
      <div style={styles.tableTitle}>Exceptions by Type — last 7 days</div>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Failure Type</th>
            <th style={styles.th}>Count</th>
          </tr>
        </thead>
        <tbody>
          {exceptions.map((row) => (
            <tr key={row.failure_type}>
              <td style={styles.td}>{row.failure_type}</td>
              <td style={styles.td}>{row.count.toLocaleString()}</td>
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

  const { manifest, summary, trend30d, topSites, exceptions } = data;

  return (
    <div style={styles.page}>
      <HealthBanner
        status={manifest.status}
        generatedAt={manifest.generated_at}
        reportTs={manifest.report_ts}
        schemaVersion={manifest.schema_version}
      />
      <header style={styles.header}>
        <h1 style={styles.title}>DLQ Operations</h1>
      </header>

      <div style={styles.kpiRow}>
        <KpiCard label="Failures — last 24 h" value={summary.failures_last_24h} />
        <KpiCard label="Failures — last 7 days" value={summary.failures_last_7d} />
      </div>

      <div style={styles.section}>
        <TopSitesTable
          title="Top Sites by Failures — last 7 days"
          sites={summary.top_sites}
        />
      </div>

      <div style={styles.section}>
        <TrendChart days={trend30d.days} />
      </div>

      <div style={styles.section}>
        <TopSitesTable
          title="Top Sites by Failures — last 30 days"
          sites={topSites.sites}
        />
      </div>

      <div style={styles.section}>
        <ExceptionsTable exceptions={exceptions.exceptions} />
      </div>
    </div>
  );
}
