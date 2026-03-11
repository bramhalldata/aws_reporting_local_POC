import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { theme } from "../theme/cashmereTheme";
import { useDashboardArtifacts } from "../hooks/useDashboardArtifacts.js";
import { widgetRegistry } from "../widgetRegistry.js";
import HealthBanner    from "./HealthBanner.jsx";
import ScopeEmptyState from "./ScopeEmptyState.jsx";

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
  // Phase 2 heuristic: all-kpi_card sections render as a flex row.
  // Replace with explicit layout hints in Phase 6 (Layout Abstraction).
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
// UnknownWidget — shown when a widget type has no registry entry.
// Allows definitions to reference new types without crashing older renderer.
// ---------------------------------------------------------------------------

function UnknownWidget({ type, id }) {
  return (
    <div style={styles.unknownWidget}>
      Unknown widget type: <strong>{type}</strong>
      {id ? ` (id: ${id})` : ""}
    </div>
  );
}

// ---------------------------------------------------------------------------
// WidgetRenderer — resolves one widget definition to a component + props
// ---------------------------------------------------------------------------

function WidgetRenderer({ widget, artifacts }) {
  const entry = widgetRegistry[widget.type];

  if (!entry) {
    return <UnknownWidget type={widget.type} id={widget.id} />;
  }

  const artifactData = artifacts[widget.data_source.artifact];

  if (artifactData === undefined) {
    return (
      <UnknownWidget
        type={`data_source_error: artifact "${widget.data_source.artifact}" not loaded`}
        id={widget.id}
      />
    );
  }

  const { field } = widget.data_source;
  const data = field ? artifactData[field] : artifactData;
  const props = entry.propsAdapter(widget, data);

  const Component = entry.component;
  return <Component {...props} />;
}

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
        // Phase 2 heuristic: sections composed entirely of kpi_card widgets
        // render as a flex row to match the existing dashboard visual layout.
        // Replace with explicit layout hints in Phase 6 (Layout Abstraction).
        const isKpiRow = section.widget_ids.every((id) => {
          const w = definition.widgets.find((x) => x.id === id);
          return w?.type === "kpi_card";
        });

        return (
          <div key={section.id} style={isKpiRow ? styles.kpiRow : styles.section}>
            {section.widget_ids.map((widgetId) => {
              const widget = definition.widgets.find((w) => w.id === widgetId);
              if (!widget) {
                return <UnknownWidget key={widgetId} type="missing_widget_id" id={widgetId} />;
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
