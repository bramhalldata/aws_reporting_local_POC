import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { theme } from "../theme/cashmereTheme";
import { useDashboardArtifacts } from "../hooks/useDashboardArtifacts.js";
import HealthBanner    from "./HealthBanner.jsx";
import ScopeEmptyState from "./ScopeEmptyState.jsx";
import WidgetRenderer  from "./WidgetRenderer.jsx";

// ---------------------------------------------------------------------------
// Styles — matches the page-level layout used by hand-composed dashboards
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
  // Layout type "flex_row" — horizontal flex wrap for KPI card rows.
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
  unknownWidget: {
    background: theme.warningBg,
    border: `1px solid ${theme.warningBorder}`,
    borderRadius: 6,
    padding: "0.75rem 1rem",
    color: theme.warningText,
    fontSize: "0.85rem",
    fontFamily: "monospace",
  },
};

// ---------------------------------------------------------------------------
// DashboardRenderer — renders a dashboard from a DashboardDefinition config
// ---------------------------------------------------------------------------

/**
 * DashboardRenderer
 *
 * @param {{ definition: DashboardDefinition }} props
 *
 * Reads a dashboard definition, loads the required artifacts, and renders the
 * dashboard layout — sections, widgets, and chrome — without page-specific JSX.
 */
export default function DashboardRenderer({ definition }) {
  const { client, env } = useParams();

  // Collect unique artifact filenames required by all widgets.
  const artifactNames = useMemo(() => {
    return [...new Set(definition.widgets.map((w) => w.data_source.artifact))];
  }, [definition]);

  const { artifacts, loading, error, isScopeEmpty } =
    useDashboardArtifacts(definition.id, artifactNames);

  if (isScopeEmpty) {
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
  if (loading) {
    return (
      <div style={styles.page}>
        <p style={styles.loading}>Loading artifacts...</p>
      </div>
    );
  }

  const manifest = artifacts["manifest.json"];

  return (
    <div style={styles.page}>
      <HealthBanner
        status={manifest.status}
        generatedAt={manifest.generated_at}
        reportTs={manifest.report_ts}
        schemaVersion={manifest.schema_version}
      />
      <header style={styles.header}>
        <h1 style={styles.title}>{definition.title}</h1>
      </header>

      {definition.layout.sections.map((section) => {
        const layoutType = section.layout?.type ?? "stack";

        return (
          <div key={section.id} style={layoutType === "flex_row" ? styles.kpiRow : styles.section}>
            {section.widget_ids.map((widgetId) => {
              const widget = definition.widgets.find((w) => w.id === widgetId);
              if (!widget) {
                return (
                  <div key={widgetId} style={styles.unknownWidget}>
                    Missing widget definition for id: <strong>{widgetId}</strong>
                  </div>
                );
              }
              return (
                <WidgetRenderer key={widgetId} widget={widget} artifacts={artifacts} />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
