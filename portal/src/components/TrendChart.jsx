import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { theme } from "../theme/cashmereTheme";

const styles = {
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
};

export default function TrendChart({ days }) {
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
