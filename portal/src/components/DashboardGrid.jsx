import GridLayout, { WidthProvider } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import WidgetRenderer from "./WidgetRenderer.jsx";

const ResponsiveGridLayout = WidthProvider(GridLayout);

/**
 * DashboardGrid — renders a section's widgets in an interactive grid.
 *
 * Wraps react-grid-layout so widget components remain unaware of drag logic.
 * Layout state is owned by DashboardRenderer and passed down via props.
 *
 * Props:
 *   widgets        WidgetDefinition[]   widgets belonging to this section
 *   artifacts      { [filename]: any }  artifact map from useDashboardArtifacts
 *   layout         Layout[]             [{ i, x, y, w, h }] — managed by parent
 *   onLayoutChange (Layout[]) => void   called after each drag or resize
 */
export default function DashboardGrid({ widgets, artifacts, layout, onLayoutChange }) {
  return (
    <ResponsiveGridLayout
      layout={layout}
      cols={12}
      rowHeight={80}
      compactType={null}
      preventCollision={false}
      onLayoutChange={onLayoutChange}
      style={{ marginBottom: "2rem" }}
    >
      {widgets.map((widget) => (
        <div key={widget.id} style={{ height: "100%" }}>
          <WidgetRenderer widget={widget} artifacts={artifacts} />
        </div>
      ))}
    </ResponsiveGridLayout>
  );
}
