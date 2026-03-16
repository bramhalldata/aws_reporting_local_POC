import { useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";
import { theme } from "../theme/cashmereTheme";

/**
 * KpiCard — reusable KPI card primitive.
 *
 * Props:
 *   label         string           required  Eyebrow metric name (displayed uppercase, muted)
 *   value         number|string    required  Primary hero value. Numbers are locale-formatted.
 *                                            Strings are rendered as-is. null/undefined → "—"
 *   delta         string           optional  Comparison line e.g. "↓ 8% vs last week"
 *                                            Leading "↑" renders in accentTeal (positive).
 *                                            Leading "↓" renders in error red (negative).
 *   tone          string           optional  Top-border color signal:
 *                                              "neutral"  → primaryBlue  (default)
 *                                              "positive" → accentTeal
 *                                              "warning"  → warningText (amber)
 *                                              "critical" → error (red)
 *                                            Unknown values fall back to "neutral" silently.
 *   footnote      string           optional  Small explanatory text (single line, truncated)
 *   sparklineData array            optional  Array of { value: number } objects rendered as a
 *                                            small area chart at the bottom of the card.
 *                                            Absent or empty → no sparkline rendered.
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

function deltaColor(delta) {
  if (!delta) return theme.textSecondary;
  if (delta.startsWith("↑")) return theme.accentTeal;
  if (delta.startsWith("↓")) return theme.error;
  return theme.textSecondary;
}

export default function KpiCard({
  label,
  value,
  delta,
  tone = "neutral",
  footnote,
  valueFontSize,
  sparklineData,
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
    boxShadow: hovered ? theme.shadowCardHover : theme.shadowCard,
    transition: `box-shadow ${theme.transitionBase}`,
    cursor: "pointer",
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
    fontSize: valueFontSize ?? "2.75rem",
    fontWeight: 700,
    color: theme.textPrimary,
    lineHeight: 1,
    marginBottom: delta || footnote ? "0.5rem" : 0,
  };

  const deltaStyle = {
    fontSize: "0.8rem",
    color: deltaColor(delta),
    marginBottom: footnote ? "0.25rem" : 0,
  };

  const footnoteStyle = {
    fontSize: "0.7rem",
    color: theme.textMuted,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };

  const hasSparkline = Array.isArray(sparklineData) && sparklineData.length > 0;

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
      {hasSparkline && (
        <div style={{ marginTop: "0.75rem" }}>
          <ResponsiveContainer width="100%" height={44}>
            <AreaChart data={sparklineData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="sparklineAreaFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={theme.primaryBlue} stopOpacity={0.18} />
                  <stop offset="95%" stopColor={theme.primaryBlue} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="value"
                stroke={theme.primaryBlue}
                strokeWidth={1.5}
                fill="url(#sparklineAreaFill)"
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
