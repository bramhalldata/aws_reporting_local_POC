import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { theme } from "../../theme/cashmereTheme";
import ScopeEmptyState from "../../components/ScopeEmptyState.jsx";
import { useArtifactPath } from "../../hooks/useArtifactPath.js";
import HealthBanner from "../../components/HealthBanner.jsx";
import KpiCard from "../../components/KpiCard.jsx";
import ExceptionsTable from "../../components/ExceptionsTable.jsx";

const styles = {
  page:     { maxWidth: 900, margin: "0 auto", padding: "2rem 1.5rem",
              background: theme.background, minHeight: "100vh" },
  header:   { marginBottom: "2rem", borderBottom: `2px solid ${theme.border}`,
              paddingBottom: "1rem" },
  title:    { fontSize: "1.75rem", fontWeight: 700, color: theme.textPrimary },
  kpiRow:   { display: "flex", gap: "1.25rem", marginBottom: "2rem", flexWrap: "wrap" },
  section:  { marginBottom: "2rem" },
  errorBox: { background: theme.errorBg, border: `1px solid ${theme.errorBorder}`,
              borderRadius: 8, padding: "1.25rem 1.5rem",
              color: theme.errorText, fontWeight: 500 },
  loading:  { color: theme.textSecondary, fontSize: "0.95rem" },
};

const DASHBOARD = "pipeline_health";

async function loadArtifacts(artifactPath) {
  const manifestRes = await fetch(artifactPath("manifest.json"));
  const manifestCt  = manifestRes.headers.get("content-type") || "";
  if (!manifestRes.ok || !manifestCt.includes("application/json")) {
    const err = new Error("Scope not bootstrapped.");
    err.isScopeEmpty = true;
    throw err;
  }
  const manifest = await manifestRes.json();
  if (manifest.status !== "SUCCESS")
    throw new Error(`Publisher reported status: "${manifest.status}". Check publisher logs.`);

  const requireArtifact = (name) => {
    if (!manifest.artifacts.includes(name))
      throw new Error(`manifest.json does not list ${name}. Re-run the publisher.`);
  };
  requireArtifact("summary.json");
  requireArtifact("failure_types.json");

  const fetchJson = async (filename) => {
    const res = await fetch(artifactPath(filename));
    if (!res.ok) throw new Error(`${filename} not found (HTTP ${res.status}).`);
    return res.json();
  };

  const [summary, failureTypes] = await Promise.all([
    fetchJson("summary.json"),
    fetchJson("failure_types.json"),
  ]);
  return { manifest, summary, failureTypes };
}

export default function PipelineHealth() {
  const { client, env } = useParams();
  const artifactPath    = useArtifactPath(DASHBOARD);
  const [data,         setData]         = useState(null);
  const [error,        setError]        = useState(null);
  const [isEmptyScope, setIsEmptyScope] = useState(false);

  useEffect(() => {
    loadArtifacts(artifactPath).then(setData).catch((err) => {
      if (err.isScopeEmpty) setIsEmptyScope(true);
      else setError(err.message);
    });
  }, []);

  if (isEmptyScope)
    return <div style={styles.page}><ScopeEmptyState client={client} env={env} /></div>;
  if (error)
    return <div style={styles.page}><div style={styles.errorBox}>Error: {error}</div></div>;
  if (!data)
    return <div style={styles.page}><p style={styles.loading}>Loading artifacts...</p></div>;

  const { manifest, summary, failureTypes } = data;

  return (
    <div style={styles.page}>
      <HealthBanner
        status={manifest.status}
        generatedAt={manifest.generated_at}
        reportTs={manifest.report_ts}
        schemaVersion={manifest.schema_version}
      />
      <header style={styles.header}>
        <h1 style={styles.title}>Pipeline Health</h1>
      </header>
      <div style={styles.kpiRow}>
        <KpiCard label="Documents — last 24 h" value={summary.total_documents_last_24h} />
        <KpiCard label="Active Sites — last 24 h" value={summary.active_sites_last_24h} />
        <KpiCard label="Latest Event" value={summary.latest_event_timestamp} />
      </div>
      <div style={styles.section}>
        <ExceptionsTable
          title="Failure Types — last 24 h"
          exceptions={failureTypes.failure_types}
        />
      </div>
    </div>
  );
}
