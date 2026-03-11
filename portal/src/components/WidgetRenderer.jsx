import { theme } from "../theme/cashmereTheme";
import { widgetRegistry } from "../widgetRegistry.js";

// ---------------------------------------------------------------------------
// UnknownWidget — shown when a widget type has no registry entry or the
// artifact data cannot be resolved. Renders a warning block instead of
// throwing so other widgets on the same dashboard continue to display.
// ---------------------------------------------------------------------------

const unknownWidgetStyle = {
  background: theme.warningBg,
  border: `1px solid ${theme.warningBorder}`,
  borderRadius: 6,
  padding: "0.75rem 1rem",
  color: theme.warningText,
  fontSize: "0.85rem",
  fontFamily: "monospace",
};

function UnknownWidget({ type, id }) {
  return (
    <div style={unknownWidgetStyle}>
      Unknown widget type: <strong>{type}</strong>
      {id ? ` (id: ${id})` : ""}
    </div>
  );
}

// ---------------------------------------------------------------------------
// WidgetRenderer — resolves one widget definition to a component + props.
//
// Props:
//   widget    — WidgetDefinition from definition.json
//   artifacts — { [filename]: parsedJson } map from useDashboardArtifacts
//
// Resolution flow:
//   widgetRegistry[widget.type]             → registry entry (or UnknownWidget)
//   artifacts[widget.data_source.artifact]  → artifact payload
//   artifactData[widget.data_source.field]  → extracted value (if field is set)
//   entry.propsAdapter(widget, data)        → component props
//   <entry.component {...props} />          → rendered output
// ---------------------------------------------------------------------------

export default function WidgetRenderer({ widget, artifacts }) {
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
