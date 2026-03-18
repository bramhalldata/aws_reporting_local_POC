import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { theme } from "../theme/cashmereTheme";
import { useDashboardArtifacts } from "../hooks/useDashboardArtifacts.js";
import { useDashboardLayout } from "../hooks/useDashboardLayout.js";
import { useFilterState } from "../hooks/useFilterState.js";
import { widgetPresets } from "../dashboards/widgetPresets.js";
import { resolveWidgets } from "../dashboards/resolveWidgets.js";
import { validateDefinition } from "../dashboards/validateDefinition.js";
import HealthBanner    from "./HealthBanner.jsx";
import ScopeEmptyState from "./ScopeEmptyState.jsx";
import WidgetRenderer  from "./WidgetRenderer.jsx";
import DashboardGrid   from "./DashboardGrid.jsx";

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
    display: "flex",
    alignItems: "baseline",
    marginBottom: "2rem",
    borderBottom: `2px solid ${theme.border}`,
    paddingBottom: "1rem",
  },
  title: {
    fontSize: "1.75rem",
    fontWeight: 700,
    color: theme.textPrimary,
  },
  resetButton: {
    marginLeft: "auto",
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: "0.8rem",
    color: theme.textMuted,
    padding: "0.25rem 0",
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
  sectionHeader: {
    marginTop: "1.5rem",
    marginBottom: "1rem",
  },
  sectionTitle: {
    fontSize: "1.1rem",
    fontWeight: 600,
    color: theme.textSecondary,
    margin: 0,
    borderLeft: `3px solid ${theme.primaryBlue}`,
    paddingLeft: "0.75rem",
  },
  sectionDescription: {
    fontSize: "0.875rem",
    color: theme.textMuted,
    marginTop: "0.25rem",
    marginBottom: 0,
  },
  errorBox: {
    background: theme.errorBg,
    border: `1px solid ${theme.errorBorder}`,
    borderRadius: 8,
    padding: "1.25rem 1.5rem",
    color: theme.errorText,
    fontWeight: 500,
  },
  skeleton: {
    background: theme.divider,
    borderRadius: 8,
    height: "8rem",
    animation: "kpi-pulse 1.4s ease-in-out infinite",
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

  const filterState = useFilterState(definition);

  // Resolve preset references in the widget list once per definition change.
  const resolvedWidgets = useMemo(
    () => resolveWidgets(definition.widgets, widgetPresets),
    [definition.widgets]
  );

  // Collect unique artifact filenames required by all widgets.
  const artifactNames = useMemo(() => {
    return [...new Set(resolvedWidgets.map((w) => w.data_source?.artifact).filter(Boolean))];
  }, [resolvedWidgets]);

  const { sectionLayouts, updateSectionLayout, resetLayouts } =
    useDashboardLayout(definition);

  const hasGridSections = definition.layout.sections.some(
    (s) => s.layout?.type === "grid"
  );

  const { artifacts, loading, error, isScopeEmpty } =
    useDashboardArtifacts(definition.id, artifactNames);

  // Validate the raw definition after all hooks have run.
  // definition is a static import — this is effectively a one-time check per mount.
  const validationResult = validateDefinition(definition);
  if (!validationResult.valid) {
    if (import.meta.env.DEV) {
      return (
        <div style={styles.page}>
          <div style={styles.errorBox}>
            <strong>Definition error in &quot;{definition.id}&quot;:</strong>
            <ul>
              {validationResult.errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>
        </div>
      );
    }
    console.error(
      `[DashboardRenderer] Invalid definition "${definition.id}":`,
      validationResult.errors
    );
    // Production: proceed — render with UnknownWidget fallbacks, no blank screen.
  }

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
        <style>{`@keyframes kpi-pulse { 0%,100%{opacity:1} 50%{opacity:.4} }`}</style>
        <div style={styles.skeleton} />
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
        {hasGridSections && (
          <button onClick={resetLayouts} style={styles.resetButton}>Reset layout</button>
        )}
      </header>

      {definition.layout.sections.map((section) => {
        const layoutType = section.layout?.type ?? "stack";

        const sectionHeading = section.label && (
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>{section.label}</h2>
            {section.description && (
              <p style={styles.sectionDescription}>{section.description}</p>
            )}
          </div>
        );

        if (layoutType === "grid") {
          const sectionWidgets = section.widget_ids
            .map((id) => resolvedWidgets.find((w) => w.id === id))
            .filter(Boolean);
          return (
            <div key={section.id} style={styles.section}>
              {sectionHeading}
              <DashboardGrid
                widgets={sectionWidgets}
                artifacts={artifacts}
                layout={sectionLayouts[section.id] ?? []}
                onLayoutChange={(newLayout) => updateSectionLayout(section.id, newLayout)}
                filterState={filterState}
              />
            </div>
          );
        }

        return (
          <div key={section.id} style={layoutType === "flex_row" ? styles.kpiRow : styles.section}>
            {sectionHeading}
            {section.widget_ids.map((widgetId) => {
              const widget = resolvedWidgets.find((w) => w.id === widgetId);
              if (!widget) {
                return (
                  <div key={widgetId} style={styles.unknownWidget}>
                    Missing widget definition for id: <strong>{widgetId}</strong>
                  </div>
                );
              }
              return (
                <WidgetRenderer key={widgetId} widget={widget} artifacts={artifacts} filterState={filterState} />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
