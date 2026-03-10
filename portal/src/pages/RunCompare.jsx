import { useEffect, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { theme } from "../theme/cashmereTheme";
import { COMPARE_WHITELIST } from "../utils/runDiff.js";
import ScopeEmptyState from "../components/ScopeEmptyState.jsx";
import AnomalySummary from "../components/AnomalySummary.jsx";

// Route: /:client/:env/history/compare?dashboard=<id>&base=<runId>&target=<runId>
//
// Data source: /{client}/{env}/current/run_history.json (same canonical source
// used by RunHistory and RunDetail).
//
// Artifact files are loaded via artifact.path (publisher-owned paths) — the
// portal never constructs historical run paths.

const styles = {
  page: {
    maxWidth: 960,
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
  title: {
    fontSize: "1.5rem",
    fontWeight: 700,
    color: theme.textPrimary,
    marginBottom: "0.25rem",
  },
  subtitle: {
    fontSize: "0.8rem",
    color: theme.textMuted,
  },
  runsGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "1rem",
    marginBottom: "1.5rem",
  },
  runCard: (side) => ({
    background: theme.surface,
    border: `1px solid ${theme.border}`,
    borderRadius: 8,
    padding: "1rem 1.25rem",
    boxShadow: "0 1px 3px rgba(0,0,0,.06)",
    borderTop: `3px solid ${side === "base" ? theme.primaryBlue : theme.accentTeal}`,
  }),
  runLabel: {
    fontSize: "0.7rem",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: theme.textMuted,
    marginBottom: "0.35rem",
  },
  runId: {
    fontFamily: "monospace",
    fontSize: "0.875rem",
    fontWeight: 700,
    color: theme.textPrimary,
    marginBottom: "0.25rem",
  },
  runMeta: {
    fontSize: "0.8rem",
    color: theme.textSecondary,
  },
  statusPill: (status) => ({
    display: "inline-block",
    fontSize: "0.7rem",
    fontWeight: 600,
    padding: "0.15rem 0.5rem",
    borderRadius: 999,
    background: status === "SUCCESS" ? theme.successBg : theme.errorBg,
    color:      status === "SUCCESS" ? theme.successText : theme.errorText,
    border:     `1px solid ${status === "SUCCESS" ? theme.successBorder : theme.errorBorder}`,
    marginLeft: "0.4rem",
  }),
  card: {
    background: theme.surface,
    border: `1px solid ${theme.border}`,
    borderRadius: 8,
    padding: "1.25rem 1.5rem",
    marginBottom: "1.25rem",
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
  table: { width: "100%", borderCollapse: "collapse" },
  th: {
    textAlign: "left",
    padding: "0.5rem 0.75rem",
    fontSize: "0.75rem",
    fontWeight: 600,
    color: theme.textSecondary,
    background: theme.background,
    borderBottom: `1px solid ${theme.border}`,
  },
  td: {
    padding: "0.5rem 0.75rem",
    fontSize: "0.875rem",
    borderBottom: `1px solid ${theme.divider}`,
    verticalAlign: "middle",
  },
  deltaPositive: {
    color: theme.errorText,
    fontWeight: 600,
  },
  deltaNegative: {
    color: theme.successText,
    fontWeight: 600,
  },
  deltaZero: {
    color: theme.textMuted,
  },
  rowAdded: {
    background: theme.warningBg,
  },
  rowRemoved: {
    background: "#F8F9FA",
    opacity: 0.8,
  },
  missingNote: {
    fontSize: "0.875rem",
    color: theme.textMuted,
    fontStyle: "italic",
    padding: "0.5rem 0",
  },
  artifactLink: {
    fontSize: "0.8rem",
    color: theme.navActiveText,
    textDecoration: "none",
    fontFamily: "monospace",
  },
  notComparedItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0.45rem 0",
    borderBottom: `1px solid ${theme.divider}`,
    fontSize: "0.875rem",
    color: theme.textSecondary,
  },
  notComparedLinks: {
    display: "flex",
    gap: "1rem",
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
  fetchError: {
    fontSize: "0.8rem",
    color: theme.errorText,
    fontStyle: "italic",
  },
  loading: { color: theme.textSecondary, fontSize: "0.95rem" },
};

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

async function parseJsonResponse(res) {
  const ct = res.headers.get("content-type") || "";
  if (!res.ok || !ct.includes("application/json")) {
    throw new Error(`HTTP ${res.status} — not JSON (possible missing artifact)`);
  }
  return res.json();
}

async function loadCompare(client, env, dashboard, baseId, targetId) {
  // Phase 1: resolve run metadata from the index
  const histRes = await fetch(`/${client}/${env}/current/run_history.json`);
  const hist = await parseJsonResponse(histRes).catch(() => {
    const err = new Error("Scope not bootstrapped.");
    err.isScopeEmpty = true;
    throw err;
  });
  if (!Array.isArray(hist.runs)) {
    throw new Error("run_history.json is malformed: 'runs' is not an array.");
  }

  const baseRun   = hist.runs.find(r => r.run_id === baseId   && r.dashboard_id === dashboard);
  const targetRun = hist.runs.find(r => r.run_id === targetId && r.dashboard_id === dashboard);

  if (!baseRun)   throw new Error(`Base run not found: ${baseId} / ${dashboard}`);
  if (!targetRun) throw new Error(`Target run not found: ${targetId} / ${dashboard}`);

  // Collect all artifact types seen across both runs
  const allTypes = new Set([
    ...baseRun.artifacts.map(a => a.type),
    ...targetRun.artifacts.map(a => a.type),
  ]);

  const toCompare  = [];
  const notCompared = [];

  for (const type of allTypes) {
    const entry     = COMPARE_WHITELIST.find(w => w.type === type);
    const bArtifact = baseRun.artifacts.find(a => a.type === type)   ?? null;
    const tArtifact = targetRun.artifacts.find(a => a.type === type) ?? null;

    if (!entry) {
      notCompared.push({ type, bArtifact, tArtifact });
    } else {
      toCompare.push({ entry, bArtifact, tArtifact });
    }
  }

  // Phase 2: fetch all whitelisted artifact pairs concurrently
  const fetchPair = ({ bArtifact, tArtifact }) => Promise.allSettled([
    bArtifact ? fetch(`/${bArtifact.path}`).then(parseJsonResponse) : Promise.resolve(null),
    tArtifact ? fetch(`/${tArtifact.path}`).then(parseJsonResponse) : Promise.resolve(null),
  ]);

  const settled = await Promise.allSettled(toCompare.map(fetchPair));

  const comparisons = toCompare.map(({ entry, bArtifact, tArtifact }, i) => {
    const pair = settled[i].status === "fulfilled"
      ? settled[i].value
      : [{ status: "rejected", reason: settled[i].reason }, { status: "rejected", reason: settled[i].reason }];

    const [bSettled, tSettled] = pair;
    const bData = bSettled.status === "fulfilled" ? bSettled.value : null;
    const tData = tSettled.status === "fulfilled" ? tSettled.value : null;

    let diffResult = null;
    let diffError  = null;
    if (bData !== null && tData !== null) {
      try {
        diffResult = entry.compare(bData, tData);
      } catch (e) {
        diffError = e.message;
      }
    }

    return {
      type:        entry.type,
      label:       entry.label,
      bArtifact,
      tArtifact,
      bData,
      tData,
      bFetchError: bSettled.status === "rejected" ? String(bSettled.reason) : null,
      tFetchError: tSettled.status === "rejected" ? String(tSettled.reason) : null,
      diffResult,
      diffError,
    };
  });

  return { baseRun, targetRun, comparisons, notCompared };
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatTs(iso) {
  return iso.replace("T", " ").replace("+00:00", " UTC").replace("Z", " UTC");
}

function fmtDelta(delta) {
  if (delta === null) return "—";
  if (delta === 0)    return "0";
  return delta > 0 ? `+${delta}` : `${delta}`;
}

function deltaStyle(delta) {
  if (delta === null || delta === 0) return styles.deltaZero;
  return delta > 0 ? styles.deltaPositive : styles.deltaNegative;
}

function deltaArrow(delta) {
  if (delta === null || delta === 0) return "";
  return delta > 0 ? " ▲" : " ▼";
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function RunMetaCard({ run, side }) {
  return (
    <div style={styles.runCard(side)}>
      <div style={styles.runLabel}>{side === "base" ? "Base (earlier)" : "Target (later)"}</div>
      <div style={styles.runId}>
        {run.run_id}
        <span style={styles.statusPill(run.status)}>{run.status}</span>
      </div>
      <div style={styles.runMeta}>Report: {formatTs(run.report_ts)}</div>
      <div style={styles.runMeta}>Generated: {formatTs(run.generated_at)}</div>
    </div>
  );
}

function SummaryDeltaSection({ result }) {
  if (!result.diffResult && !result.diffError) {
    return (
      <div style={styles.card}>
        <div style={styles.cardTitle}>{result.label}</div>
        {renderMissingNote(result)}
      </div>
    );
  }

  if (result.diffError) {
    return (
      <div style={styles.card}>
        <div style={styles.cardTitle}>{result.label}</div>
        <p style={styles.fetchError}>Comparison error: {result.diffError}</p>
      </div>
    );
  }

  const rows = result.diffResult;
  if (rows.length === 0) {
    return (
      <div style={styles.card}>
        <div style={styles.cardTitle}>{result.label}</div>
        <p style={styles.missingNote}>No comparable numeric fields found.</p>
      </div>
    );
  }

  return (
    <div style={styles.card}>
      <div style={styles.cardTitle}>{result.label}</div>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Field</th>
            <th style={{ ...styles.th, textAlign: "right" }}>Base</th>
            <th style={{ ...styles.th, textAlign: "right" }}>Target</th>
            <th style={{ ...styles.th, textAlign: "right" }}>Change</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ field, base, target, delta }) => (
            <tr key={field}>
              <td style={{ ...styles.td, fontFamily: "monospace", fontSize: "0.8rem" }}>{field}</td>
              <td style={{ ...styles.td, textAlign: "right" }}>{base ?? "—"}</td>
              <td style={{ ...styles.td, textAlign: "right" }}>{target ?? "—"}</td>
              <td style={{ ...styles.td, textAlign: "right", ...deltaStyle(delta) }}>
                {fmtDelta(delta)}{deltaArrow(delta)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SetDiffSection({ result }) {
  if (!result.diffResult && !result.diffError) {
    return (
      <div style={styles.card}>
        <div style={styles.cardTitle}>{result.label}</div>
        {renderMissingNote(result)}
      </div>
    );
  }

  if (result.diffError) {
    return (
      <div style={styles.card}>
        <div style={styles.cardTitle}>{result.label}</div>
        <p style={styles.fetchError}>Comparison error: {result.diffError}</p>
      </div>
    );
  }

  const { added, removed, changed, unchanged } = result.diffResult;
  const hasChanges = added.length + removed.length + changed.length > 0;

  return (
    <div style={styles.card}>
      <div style={styles.cardTitle}>{result.label}</div>
      {!hasChanges && unchanged.length === 0 && (
        <p style={styles.missingNote}>No items to compare.</p>
      )}
      {!hasChanges && unchanged.length > 0 && (
        <p style={{ ...styles.missingNote, fontStyle: "normal" }}>
          No changes — {unchanged.length} item{unchanged.length !== 1 ? "s" : ""} unchanged.
        </p>
      )}
      {hasChanges && (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Item</th>
              <th style={{ ...styles.th, textAlign: "right" }}>Base</th>
              <th style={{ ...styles.th, textAlign: "right" }}>Target</th>
              <th style={{ ...styles.th, textAlign: "right" }}>Change</th>
            </tr>
          </thead>
          <tbody>
            {added.map(({ key, count }) => (
              <tr key={`add-${key}`} style={styles.rowAdded}>
                <td style={styles.td}>{key}</td>
                <td style={{ ...styles.td, textAlign: "right", color: theme.textMuted }}>—</td>
                <td style={{ ...styles.td, textAlign: "right" }}>{count}</td>
                <td style={{ ...styles.td, textAlign: "right", color: theme.warningText, fontWeight: 600 }}>New</td>
              </tr>
            ))}
            {removed.map(({ key, count }) => (
              <tr key={`rem-${key}`} style={styles.rowRemoved}>
                <td style={{ ...styles.td, color: theme.textMuted }}>{key}</td>
                <td style={{ ...styles.td, textAlign: "right", color: theme.textMuted }}>{count}</td>
                <td style={{ ...styles.td, textAlign: "right", color: theme.textMuted }}>—</td>
                <td style={{ ...styles.td, textAlign: "right", color: theme.textMuted }}>Gone</td>
              </tr>
            ))}
            {changed.map(({ key, base, target, delta }) => (
              <tr key={`chg-${key}`}>
                <td style={styles.td}>{key}</td>
                <td style={{ ...styles.td, textAlign: "right" }}>{base}</td>
                <td style={{ ...styles.td, textAlign: "right" }}>{target}</td>
                <td style={{ ...styles.td, textAlign: "right", ...deltaStyle(delta) }}>
                  {fmtDelta(delta)}{deltaArrow(delta)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {hasChanges && unchanged.length > 0 && (
        <p style={{ ...styles.missingNote, marginTop: "0.5rem" }}>
          {unchanged.length} item{unchanged.length !== 1 ? "s" : ""} unchanged.
        </p>
      )}
    </div>
  );
}

function renderMissingNote({ bArtifact, tArtifact, bFetchError, tFetchError, label }) {
  if (bFetchError || tFetchError) {
    return (
      <div>
        {bFetchError && <p style={styles.fetchError}>Base artifact error: {bFetchError}</p>}
        {tFetchError && <p style={styles.fetchError}>Target artifact error: {tFetchError}</p>}
      </div>
    );
  }
  if (!bArtifact && !tArtifact) {
    return <p style={styles.missingNote}>{label} not present in either run.</p>;
  }
  if (!bArtifact) {
    return (
      <p style={styles.missingNote}>
        Not present in base run.{" "}
        {tArtifact && (
          <a href={`/${tArtifact.path}`} style={styles.artifactLink} target="_blank" rel="noreferrer">
            View in target →
          </a>
        )}
      </p>
    );
  }
  if (!tArtifact) {
    return (
      <p style={styles.missingNote}>
        Not present in target run.{" "}
        {bArtifact && (
          <a href={`/${bArtifact.path}`} style={styles.artifactLink} target="_blank" rel="noreferrer">
            View in base →
          </a>
        )}
      </p>
    );
  }
  return null;
}

function ComparisonSection({ result }) {
  if (result.type === "summary") {
    return <SummaryDeltaSection result={result} />;
  }
  return <SetDiffSection result={result} />;
}

function NotComparedSection({ items }) {
  if (items.length === 0) return null;
  return (
    <div style={styles.card}>
      <div style={styles.cardTitle}>Artifacts Not Compared in Phase 1</div>
      {items.map(({ type, bArtifact, tArtifact }) => (
        <div key={type} style={styles.notComparedItem}>
          <span style={{ fontFamily: "monospace", fontSize: "0.85rem" }}>{type}.json</span>
          <span style={styles.notComparedLinks}>
            {bArtifact && (
              <a href={`/${bArtifact.path}`} style={styles.artifactLink} target="_blank" rel="noreferrer">
                base ↗
              </a>
            )}
            {tArtifact && (
              <a href={`/${tArtifact.path}`} style={styles.artifactLink} target="_blank" rel="noreferrer">
                target ↗
              </a>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function RunCompare() {
  const { client, env } = useParams();
  const [searchParams]  = useSearchParams();

  const dashboard = searchParams.get("dashboard");
  const baseId    = searchParams.get("base");
  const targetId  = searchParams.get("target");

  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [isEmptyScope, setIsEmptyScope] = useState(false);
  const [baseRun,     setBaseRun]     = useState(null);
  const [targetRun,   setTargetRun]   = useState(null);
  const [comparisons, setComparisons] = useState([]);
  const [notCompared, setNotCompared] = useState([]);

  const historyLink = `/${client}/${env}/history`;

  useEffect(() => {
    if (!dashboard || !baseId || !targetId) {
      setError("Missing required query parameters: dashboard, base, and target are all required.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    loadCompare(client, env, dashboard, baseId, targetId)
      .then(({ baseRun, targetRun, comparisons, notCompared }) => {
        setBaseRun(baseRun);
        setTargetRun(targetRun);
        setComparisons(comparisons);
        setNotCompared(notCompared);
      })
      .catch(err => {
        if (err.isScopeEmpty) setIsEmptyScope(true);
        else setError(err.message);
      })
      .finally(() => setLoading(false));
  }, [client, env, dashboard, baseId, targetId]);

  const backLink = (
    <Link to={historyLink} style={styles.backLink}>
      ← Run History
    </Link>
  );

  if (isEmptyScope) {
    return (
      <div style={styles.page}>
        {backLink}
        <ScopeEmptyState client={client} env={env} />
      </div>
    );
  }
  if (error) {
    return (
      <div style={styles.page}>
        {backLink}
        <div style={styles.errorBox}>Error: {error}</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={styles.page}>
        {backLink}
        <p style={styles.loading}>Loading comparison...</p>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      {backLink}

      <header style={styles.header}>
        <div style={styles.title}>Compare Runs — {dashboard}</div>
        <div style={styles.subtitle}>{client} / {env}</div>
      </header>

      <div style={styles.runsGrid}>
        <RunMetaCard run={baseRun}   side="base" />
        <RunMetaCard run={targetRun} side="target" />
      </div>

      {comparisons.map(result => (
        <ComparisonSection key={result.type} result={result} />
      ))}

      <NotComparedSection items={notCompared} />

      <AnomalySummary
        client={client}
        env={env}
        dashboard={dashboard}
        baseRunId={baseId}
        targetRunId={targetId}
        compareResults={Object.fromEntries(
          comparisons
            .filter(c => c.diffResult !== null)
            .map(c => [c.type, c.diffResult])
        )}
        missingArtifacts={comparisons
          .filter(c => c.diffResult === null)
          .map(c => c.type)}
      />
    </div>
  );
}
