import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { theme } from "../../theme/cashmereTheme";
import ScopeEmptyState from "../../components/ScopeEmptyState.jsx";
import { useArtifactPath } from "../../hooks/useArtifactPath.js";
import HealthBanner from "../../components/HealthBanner.jsx";
import KpiCard from "../../components/KpiCard.jsx";
import TrendChart from "../../components/TrendChart.jsx";
import TopSitesTable from "../../components/TopSitesTable.jsx";
import ExceptionsTable from "../../components/ExceptionsTable.jsx";

// ---------------------------------------------------------------------------
// Styles — page-level layout only; component styles live in each component
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
  kpiRow: {
    display: "flex",
    gap: "1.25rem",
    marginBottom: "2rem",
    flexWrap: "wrap",
  },
  section: {
    marginBottom: "2rem",
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
// Data loading — portal is presentation-only; no metrics computed here
// ---------------------------------------------------------------------------

const DASHBOARD = "dlq_operations";

async function loadArtifacts(artifactPath) {
  // Step 1: load manifest to confirm pipeline status and discover artifacts
  const manifestRes = await fetch(artifactPath("manifest.json"));
  const manifestCt  = manifestRes.headers.get("content-type") || "";
  if (!manifestRes.ok || !manifestCt.includes("application/json")) {
    const err = new Error("Scope not bootstrapped.");
    err.isScopeEmpty = true;
    throw err;
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
    const res = await fetch(artifactPath(filename));
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
// Dashboard view
// ---------------------------------------------------------------------------

export default function DlqOperations() {
  const { client, env } = useParams();
  const artifactPath    = useArtifactPath(DASHBOARD);
  const [data,         setData]         = useState(null);
  const [error,        setError]        = useState(null);
  const [isEmptyScope, setIsEmptyScope] = useState(false);

  useEffect(() => {
    loadArtifacts(artifactPath)
      .then(setData)
      .catch((err) => {
        if (err.isScopeEmpty) setIsEmptyScope(true);
        else setError(err.message);
      });
  }, []);

  if (isEmptyScope) {
    return (
      <div style={styles.page}>
        <ScopeEmptyState client={client} env={env} />
      </div>
    );
  }
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
