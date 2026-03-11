import { theme } from "../theme/cashmereTheme.js";

// Color mapping per health classification (explicit per review requirement):
//   Critical → error styling   (errorBg / errorText / errorBorder)
//   Warning  → warning styling (warningBg / warningText / warningBorder)
//   Stable   → neutral styling (divider / textSecondary / border)
//   Healthy  → success styling (successBg / successText / successBorder)
//   Unknown  → muted styling   (background / textMuted / border)

const BADGE_STYLES = {
  Critical: {
    background: theme.errorBg,
    color:      theme.errorText,
    border:     `1px solid ${theme.errorBorder}`,
  },
  Warning: {
    background: theme.warningBg,
    color:      theme.warningText,
    border:     `1px solid ${theme.warningBorder}`,
  },
  Stable: {
    background: theme.divider,
    color:      theme.textSecondary,
    border:     `1px solid ${theme.border}`,
  },
  Healthy: {
    background: theme.successBg,
    color:      theme.successText,
    border:     `1px solid ${theme.successBorder}`,
  },
  Unknown: {
    background: theme.background,
    color:      theme.textMuted,
    border:     `1px solid ${theme.border}`,
  },
};

const BASE_STYLE = {
  display:      "inline-block",
  fontSize:     "0.75rem",
  fontWeight:   600,
  padding:      "0.2rem 0.6rem",
  borderRadius: 999,
  letterSpacing: "0.03em",
};

/**
 * HealthBadge — display a colored classification pill for a run comparison.
 *
 * @param {string} classification — "Critical"|"Warning"|"Stable"|"Healthy"|"Unknown"
 */
export default function HealthBadge({ classification }) {
  const colorStyle = BADGE_STYLES[classification] ?? BADGE_STYLES.Unknown;
  return (
    <span style={{ ...BASE_STYLE, ...colorStyle }}>
      {classification ?? "Unknown"}
    </span>
  );
}
