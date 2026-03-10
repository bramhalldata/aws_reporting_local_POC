import { useState } from "react";
import { theme } from "../theme/cashmereTheme.js";
import { buildAnomalyPayload } from "../utils/anomalyPayload.js";
import { callOllamaAnalysis, OllamaError, OLLAMA_MODEL } from "../utils/ollamaClient.js";

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = {
  card: {
    background: theme.surface,
    border: `1px solid ${theme.border}`,
    borderRadius: 8,
    padding: "1.25rem 1.5rem",
    marginBottom: "1.25rem",
    boxShadow: "0 1px 3px rgba(0,0,0,.06)",
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "0.875rem",
    borderBottom: `1px solid ${theme.divider}`,
    paddingBottom: "0.5rem",
  },
  cardTitle: {
    fontSize: "0.75rem",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.07em",
    color: theme.textSecondary,
  },
  aiBadge: {
    fontSize: "0.65rem",
    fontWeight: 600,
    padding: "0.15rem 0.45rem",
    borderRadius: 4,
    background: theme.warningBg,
    color: theme.warningText,
    border: `1px solid ${theme.warningBorder}`,
    letterSpacing: "0.04em",
  },
  button: {
    fontSize: "0.8rem",
    fontWeight: 600,
    padding: "0.35rem 0.85rem",
    borderRadius: 6,
    border: `1px solid ${theme.primaryBlue}`,
    background: theme.primaryBlue,
    color: "#fff",
    cursor: "pointer",
  },
  buttonSecondary: {
    fontSize: "0.8rem",
    fontWeight: 500,
    padding: "0.35rem 0.85rem",
    borderRadius: 6,
    border: `1px solid ${theme.border}`,
    background: theme.surface,
    color: theme.textSecondary,
    cursor: "pointer",
  },
  idle: {
    fontSize: "0.875rem",
    color: theme.textMuted,
    lineHeight: 1.5,
  },
  loading: {
    fontSize: "0.875rem",
    color: theme.textSecondary,
  },
  errorBox: {
    background: theme.errorBg,
    border: `1px solid ${theme.errorBorder}`,
    borderRadius: 6,
    padding: "0.875rem 1rem",
    color: theme.errorText,
    fontSize: "0.875rem",
    whiteSpace: "pre-wrap",
    fontFamily: "monospace",
  },
  section: {
    marginBottom: "1rem",
  },
  sectionLabel: {
    fontSize: "0.75rem",
    fontWeight: 600,
    color: theme.textSecondary,
    marginBottom: "0.3rem",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  summaryText: {
    fontSize: "0.9rem",
    color: theme.textPrimary,
    lineHeight: 1.6,
  },
  list: {
    margin: 0,
    paddingLeft: "1.25rem",
    fontSize: "0.875rem",
    color: theme.textPrimary,
    lineHeight: 1.7,
  },
  caveatsText: {
    fontSize: "0.8rem",
    color: theme.textMuted,
    fontStyle: "italic",
    borderTop: `1px solid ${theme.divider}`,
    paddingTop: "0.75rem",
    marginTop: "0.5rem",
  },
  rawOutput: {
    background: theme.background,
    border: `1px solid ${theme.border}`,
    borderRadius: 4,
    padding: "0.75rem",
    fontSize: "0.8rem",
    color: theme.textSecondary,
    whiteSpace: "pre-wrap",
    overflowX: "auto",
    maxHeight: 300,
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * AnomalySummary — on-demand AI explanation panel for run comparison results.
 *
 * Sits at the bottom of RunCompare. Does not affect or depend on the deterministic
 * comparison tables above it. Calls local Ollama (localhost:11434) on demand.
 *
 * Props:
 *   client, env, dashboard     — scope identity (from URL params / query params)
 *   baseRunId, targetRunId     — run IDs being compared
 *   compareResults             — map of artifact type → comparator output (from COMPARE_WHITELIST)
 *   missingArtifacts           — array of artifact types that could not be compared
 */
export default function AnomalySummary({
  client,
  env,
  dashboard,
  baseRunId,
  targetRunId,
  compareResults,
  missingArtifacts = [],
}) {
  const [status,   setStatus]   = useState("idle");    // idle | loading | success | error
  const [result,   setResult]   = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [rawText,  setRawText]  = useState(null);

  async function handleAnalyze() {
    setStatus("loading");
    setResult(null);
    setErrorMsg(null);
    setRawText(null);

    const payload = buildAnomalyPayload(
      client, env, dashboard, baseRunId, targetRunId,
      compareResults, missingArtifacts,
    );

    try {
      const analysis = await callOllamaAnalysis(payload);
      setResult(analysis);
      setStatus("success");
    } catch (err) {
      if (err instanceof OllamaError && err.type === "malformed_output") {
        setRawText(err.rawText);
        setStatus("error");
        setErrorMsg("Model returned output that could not be parsed as structured JSON.");
      } else {
        setErrorMsg(err.message ?? "Unknown error during analysis.");
        setStatus("error");
      }
    }
  }

  function handleReanalyze() {
    handleAnalyze();
  }

  return (
    <div style={styles.card}>
      {/* Header */}
      <div style={styles.cardHeader}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <span style={styles.cardTitle}>AI Anomaly Analysis</span>
          <span style={styles.aiBadge}>AI-generated</span>
        </div>
        {status === "idle" && (
          <button style={styles.button} onClick={handleAnalyze}>
            Analyze with AI
          </button>
        )}
        {status === "loading" && (
          <button style={styles.buttonSecondary} disabled>
            Analyzing...
          </button>
        )}
        {(status === "success" || status === "error") && (
          <button style={styles.buttonSecondary} onClick={handleReanalyze}>
            Re-analyze
          </button>
        )}
      </div>

      {/* Idle state */}
      {status === "idle" && (
        <p style={styles.idle}>
          Click "Analyze with AI" to generate a natural-language explanation of the
          differences above. Requires Ollama running locally with model{" "}
          <code>{OLLAMA_MODEL}</code>.
        </p>
      )}

      {/* Loading state */}
      {status === "loading" && (
        <p style={styles.loading}>Calling local AI ({OLLAMA_MODEL})...</p>
      )}

      {/* Error state */}
      {status === "error" && (
        <>
          <div style={styles.errorBox}>{errorMsg}</div>
          {rawText && (
            <>
              <p style={{ ...styles.idle, marginTop: "0.75rem" }}>
                Raw model output (structured output unavailable):
              </p>
              <pre style={styles.rawOutput}>{rawText}</pre>
            </>
          )}
        </>
      )}

      {/* Success state */}
      {status === "success" && result && (
        <>
          {result.summary && (
            <div style={styles.section}>
              <div style={styles.sectionLabel}>Summary</div>
              <p style={styles.summaryText}>{result.summary}</p>
            </div>
          )}

          {result.notable_changes.length > 0 && (
            <div style={styles.section}>
              <div style={styles.sectionLabel}>Notable Changes</div>
              <ul style={styles.list}>
                {result.notable_changes.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          {result.likely_anomalies.length > 0 && (
            <div style={styles.section}>
              <div style={styles.sectionLabel}>Likely Anomalies</div>
              <ul style={styles.list}>
                {result.likely_anomalies.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          {result.caveats && (
            <p style={styles.caveatsText}>{result.caveats}</p>
          )}
        </>
      )}
    </div>
  );
}
