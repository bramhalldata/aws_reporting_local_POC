import { useState } from "react";
import { theme } from "../theme/cashmereTheme";

/**
 * KpiCard — reusable KPI card primitive.
 *
 * Props:
 *   label         string           required  Eyebrow metric name (displayed uppercase, muted)
 *   value         number|string    required  Primary hero value. Numbers are locale-formatted.
 *                                            Strings are rendered as-is. null/undefined → "—"
 *   delta         string           optional  Comparison line e.g. "↓ 8% vs last week"
 *   tone          string           optional  Top-border color signal:
 *                                              "neutral"  → primaryBlue  (default)
 *                                              "positive" → accentTeal
 *                                              "warning"  → warningText (amber)
 *                                              "critical" → error (red)
 *                                            Unknown values fall back to "neutral" silently.
 *   footnote      string           optional  Small explanatory text (single line, truncated)
 *   sparklineData array            optional  RESERVED — accepted but not rendered in Phase 4
 */

const TONE_COLORS = {
  neutral:  theme.primaryBlue,
  positive: theme.accentTeal,
  warning:  theme.warningText,
  critical: theme.error,
};

function formatValue(value) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") return value.toLocaleString();
  return String(value);
}

export default function KpiCard({
  label,
  value,
  delta,
  tone = "neutral",
  footnote,
  sparklineData, // eslint-disable-line no-unused-vars — reserved for Phase 5/6
}) {
  const [hovered, setHovered] = useState(false);

  const borderColor = TONE_COLORS[tone] ?? TONE_COLORS.neutral;

  const cardStyle = {
    flex: "1 1 200px",
    height: "100%",
    boxSizing: "border-box",
    background: theme.surface,
    border: `1px solid ${theme.border}`,
    borderTop: `3px solid ${borderColor}`,
    borderRadius: 8,
    padding: "1.5rem 1.75rem",
    boxShadow: hovered
      ? "0 4px 16px rgba(0,0,0,.12), 0 2px 6px rgba(0,0,0,.08)"
      : "0 2px 8px rgba(0,0,0,.07), 0 1px 3px rgba(0,0,0,.04)",
    transition: "box-shadow 0.15s ease",
  };

  const labelStyle = {
    fontSize: "0.7rem",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.07em",
    color: theme.textMuted,
    marginBottom: "0.5rem",
  };

  const valueStyle = {
    fontSize: "2.75rem",
    fontWeight: 700,
    color: theme.textPrimary,
    lineHeight: 1,
    marginBottom: delta || footnote ? "0.5rem" : 0,
  };

  const deltaStyle = {
    fontSize: "0.8rem",
    color: theme.textSecondary,
    marginBottom: footnote ? "0.25rem" : 0,
  };

  const footnoteStyle = {
    fontSize: "0.7rem",
    color: theme.textMuted,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };

  return (
    <div
      style={cardStyle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={labelStyle}>{label}</div>
      <div style={valueStyle}>{formatValue(value)}</div>
      {delta    && <div style={deltaStyle}>{delta}</div>}
      {footnote && <div style={footnoteStyle}>{footnote}</div>}
    </div>
  );
}
