/**
 * validateDefinition.js
 *
 * Pure function that validates a raw dashboard definition object before any
 * runtime processing (before resolveWidgets). Returns { valid, errors } so
 * callers can decide how to surface problems.
 *
 * Receives the raw definition — preset widgets (entries with a `preset` field
 * and no `type`) are explicitly exempted from the type/data_source presence
 * checks (check 7), since they are resolved at runtime by resolveWidgets.
 *
 * -------------------------------------------------------------------------
 * Checks
 * -------------------------------------------------------------------------
 *
 * 1. definition.id is a non-empty string
 * 2. definition.schema_version is a non-empty string
 * 3. definition.layout.sections is a non-empty array
 * 4. Each section has a string id and a non-empty widget_ids array
 * 5. Each widget_id in every section resolves to an entry in definition.widgets
 * 6. No duplicate widget.id values within definition.widgets
 * 7. Each non-preset widget has a string type and data_source.artifact ending in .json
 * 8. Each generic_table widget with totals: true has at least one column with
 *    a non-"none" aggregate value
 *
 * @param {Object} definition - Raw definition object from definition.json
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateDefinition(definition) {
  const errors = [];

  if (!definition || typeof definition !== "object") {
    return { valid: false, errors: ["Definition must be a non-null object"] };
  }

  // Check 1 — id is a non-empty string
  if (typeof definition.id !== "string" || definition.id.trim() === "") {
    errors.push("definition.id must be a non-empty string");
  }

  // Check 2 — schema_version is a non-empty string
  if (
    typeof definition.schema_version !== "string" ||
    definition.schema_version.trim() === ""
  ) {
    errors.push("definition.schema_version must be a non-empty string");
  }

  // Check 3 — layout.sections is a non-empty array
  const sections = definition.layout?.sections;
  if (!Array.isArray(sections) || sections.length === 0) {
    errors.push("definition.layout.sections must be a non-empty array");
  }

  // Build a widget id → widget map for checks 5 and 7/8
  const widgets = Array.isArray(definition.widgets) ? definition.widgets : [];
  const widgetMap = new Map(widgets.map((w) => [w.id, w]));

  // Check 4 — each section has a string id and non-empty widget_ids array
  if (Array.isArray(sections)) {
    sections.forEach((section, i) => {
      if (typeof section.id !== "string" || section.id.trim() === "") {
        errors.push(`Section at index ${i} must have a non-empty string id`);
      }
      if (!Array.isArray(section.widget_ids) || section.widget_ids.length === 0) {
        errors.push(
          `Section "${section.id ?? i}" must have a non-empty widget_ids array`
        );
      }

      // Check 5 — every widget_id resolves to a widget entry
      if (Array.isArray(section.widget_ids)) {
        section.widget_ids.forEach((wid) => {
          if (!widgetMap.has(wid)) {
            errors.push(
              `Section "${section.id ?? i}" references unknown widget id: ${wid}`
            );
          }
        });
      }
    });
  }

  // Check 6 — no duplicate widget.id values
  const seenIds = new Set();
  widgets.forEach((w) => {
    if (typeof w.id === "string") {
      if (seenIds.has(w.id)) {
        errors.push(`Duplicate widget id: "${w.id}"`);
      }
      seenIds.add(w.id);
    }
  });

  // Checks 7 and 8 — per-widget validation
  widgets.forEach((widget) => {
    const isPreset = typeof widget.preset === "string" && widget.preset.trim() !== "";

    // Check 7 — non-preset widgets must have type and data_source.artifact ending in .json
    if (!isPreset) {
      if (typeof widget.type !== "string" || widget.type.trim() === "") {
        errors.push(
          `Widget "${widget.id}" has no preset and no type — one is required`
        );
      }
      if (
        !widget.data_source ||
        typeof widget.data_source.artifact !== "string" ||
        !widget.data_source.artifact.endsWith(".json")
      ) {
        errors.push(
          `Widget "${widget.id}" data_source.artifact must be a string ending in .json`
        );
      }
    }

    // Check 8 — generic_table with totals: true must have at least one aggregate column
    if (widget.type === "generic_table" && widget.totals === true) {
      const columns = Array.isArray(widget.columns) ? widget.columns : [];
      const hasAggregate = columns.some(
        (col) => col.aggregate && col.aggregate !== "none"
      );
      if (!hasAggregate) {
        errors.push(
          `Widget "${widget.id}" has totals: true but no column defines an aggregate`
        );
      }
    }
  });

  return { valid: errors.length === 0, errors };
}
