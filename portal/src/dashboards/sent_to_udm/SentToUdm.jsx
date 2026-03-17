import { useParams } from "react-router-dom";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useDashboardArtifacts } from "../../hooks/useDashboardArtifacts.js";
import HealthBanner      from "../../components/HealthBanner.jsx";
import KpiCard           from "../../components/KpiCard.jsx";
import ScopeEmptyState   from "../../components/ScopeEmptyState.jsx";
import { theme }         from "../../theme/cashmereTheme.js";

const ARTIFACT_NAMES = [
  "summary.json",
  "region_summary.json",
  "trend_30d.json",
  "lifetime_detail.json",
  "recent_detail_30d.json",
];

const styles = {
  loading: {
    padding: "2rem",
    color: theme.textSecondary,
    fontSize: "0.875rem",
  },
  errorBox: {
    padding: "1rem 1.5rem",
    background: theme.errorBg,
    border: `1px solid ${theme.errorBorder}`,
    borderRadius: 8,
    color: theme.errorText,
    fontSize: "0.875rem",
  },
  kpiRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "1rem",
    marginBottom: "1.5rem",
  },
  section: {
    background: theme.surface,
    border: `1px solid ${theme.border}`,
    borderRadius: 8,
    padding: "1.25rem 1.5rem",
    marginBottom: "1.5rem",
  },
  sectionTitle: {
    fontSize: "0.75rem",
    fontWeight: 600,
    color: theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: "0.07em",
    margin: "0 0 1rem 0",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "0.875rem",
  },
  th: {
    textAlign: "left",
    padding: "0.5rem 0.75rem",
    borderBottom: `2px solid ${theme.divider}`,
    fontSize: "0.7rem",
    fontWeight: 600,
    color: theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  td: {
    padding: "0.5rem 0.75rem",
    borderBottom: `1px solid ${theme.divider}`,
    color: theme.textPrimary,
  },
};

// Trim DuckDB timestamp strings to "YYYY-MM-DD HH:MM:SS" for display.
function fmtTs(ts) {
  if (!ts) return "—";
  return ts.slice(0, 19).replace("T", " ");
}

export default function SentToUdm() {
  const { client, env } = useParams();
  const { artifacts, loading, error, isScopeEmpty } = useDashboardArtifacts(
    "sent_to_udm",
    ARTIFACT_NAMES,
  );

  if (isScopeEmpty) return <ScopeEmptyState client={client} env={env} />;
  if (loading)      return <div style={styles.loading}>Loading artifacts…</div>;
  if (error)        return <div style={styles.errorBox}>{error}</div>;

  const manifest      = artifacts["manifest.json"];
  const summary       = artifacts["summary.json"];
  const regionSummary = artifacts["region_summary.json"];
  const trend30d      = artifacts["trend_30d.json"];
  const lifetime      = artifacts["lifetime_detail.json"];
  const recent        = artifacts["recent_detail_30d.json"];

  return (
    <div>
      <HealthBanner
        status={manifest.status}
        generatedAt={manifest.generated_at}
        reportTs={manifest.report_ts}
        schemaVersion={manifest.schema_version}
      />

      {/* KPI Row */}
      <div style={styles.kpiRow}>
        <KpiCard
          label="Total CCDs Sent"
          value={summary.total_ccds_sent}
          tone="neutral"
          footnote="All time"
        />
        <KpiCard
          label="First CCD Sent"
          value={summary.earliest_event_ts?.slice(0, 10)}
          tone="neutral"
          valueFontSize="1.4rem"
        />
        <KpiCard
          label="Most Recent CCD Sent"
          value={summary.latest_event_ts?.slice(0, 10)}
          tone="neutral"
          valueFontSize="1.4rem"
        />
        <KpiCard
          label="Regions Active"
          value={summary.regions_active_30d}
          tone="neutral"
          footnote="Last 30 days"
        />
        <KpiCard
          label="Sites Active"
          value={summary.sites_active_30d}
          tone="neutral"
          footnote="Last 30 days"
        />
      </div>

      {/* Region Summary */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Region Summary — All Time</h3>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Region</th>
              <th style={styles.th}>CCDs Sent</th>
              <th style={styles.th}>First CCD Sent</th>
              <th style={styles.th}>Most Recent CCD Sent</th>
            </tr>
          </thead>
          <tbody>
            {regionSummary.regions.map((r) => (
              <tr key={r.region}>
                <td style={styles.td}>{r.region}</td>
                <td style={styles.td}>{r.ccd_count.toLocaleString()}</td>
                <td style={styles.td}>{fmtTs(r.first_seen)}</td>
                <td style={styles.td}>{fmtTs(r.last_seen)}</td>
              </tr>
            ))}
            <tr style={{ fontWeight: 600, borderTop: `2px solid ${theme.divider}`, background: theme.background }}>
              <td style={styles.td}><strong>Grand Total</strong></td>
              <td style={styles.td}><strong>{regionSummary.regions.reduce((sum, r) => sum + r.ccd_count, 0).toLocaleString()}</strong></td>
              <td style={styles.td}><strong>{fmtTs(regionSummary.regions.map(r => r.first_seen).sort()[0])}</strong></td>
              <td style={styles.td}><strong>{fmtTs([...regionSummary.regions.map(r => r.last_seen)].sort().at(-1))}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 30-Day Trend Chart */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>CCDs Sent To UDM by Region (Last 30 Days)</h3>
        <p style={{ color: theme.textMuted, fontSize: "0.75rem", margin: "-0.5rem 0 1rem 0" }}>
          Regional breakdown coming in a future release.
        </p>
        {trend30d.days.length === 0 ? (
          <p style={{ color: theme.textMuted, fontSize: "0.875rem", margin: 0 }}>
            No trend data available.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={trend30d.days} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="udmTrendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={theme.primaryBlue} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={theme.primaryBlue} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.divider} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: theme.textMuted }}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: theme.textMuted }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: theme.surface,
                  border: `1px solid ${theme.border}`,
                  borderRadius: 6,
                  fontSize: "0.8rem",
                }}
              />
              <Area
                type="monotone"
                dataKey="ccd_count"
                stroke={theme.primaryBlue}
                fill="url(#udmTrendFill)"
                strokeWidth={2}
                dot={false}
                name="CCDs Sent"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Lifetime Detail Table — `site` = Facility in this POC; production ETL will add `facility_name` */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Facility Detail — All Time</h3>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Region</th>
              <th style={styles.th}>Facility</th>
              <th style={styles.th}>CCDs Sent</th>
              <th style={styles.th}>First CCD</th>
              <th style={styles.th}>Most Recent CCD</th>
            </tr>
          </thead>
          <tbody>
            {lifetime.rows.map((r) => (
              <tr key={`${r.region}-${r.site}`}>
                <td style={styles.td}>{r.region}</td>
                <td style={styles.td}>{r.site}</td>
                <td style={styles.td}>{r.ccd_count.toLocaleString()}</td>
                <td style={styles.td}>{fmtTs(r.first_seen)}</td>
                <td style={styles.td}>{fmtTs(r.last_seen)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Recent 30-Day Detail Table */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Site Activity — Last 30 Days</h3>
        {recent.rows.length === 0 ? (
          <p style={{ color: theme.textMuted, fontSize: "0.875rem", margin: 0 }}>
            No sites active in the last 30 days.
          </p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Region</th>
                <th style={styles.th}>Facility</th>
                <th style={styles.th}>CCDs Sent</th>
                <th style={styles.th}>First Sent (30d)</th>
                <th style={styles.th}>Last Sent (30d)</th>
              </tr>
            </thead>
            <tbody>
              {recent.rows.map((r) => (
                <tr key={`${r.region}-${r.site}`}>
                  <td style={styles.td}>{r.region}</td>
                  <td style={styles.td}>{r.site}</td>
                  <td style={styles.td}>{r.ccd_count.toLocaleString()}</td>
                  <td style={styles.td}>{fmtTs(r.first_seen_30d)}</td>
                  <td style={styles.td}>{fmtTs(r.last_seen_30d)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
