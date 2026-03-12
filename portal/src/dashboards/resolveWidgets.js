/**
 * resolveWidgets — merges preset fields into widget definitions.
 *
 * For each widget with a "preset" field:
 *   - look up the preset by ID in the provided presets map
 *   - merge: { ...presetFields, ...localFields } (local fields win)
 *   - strip the "preset" key from the result
 *
 * Widgets without a "preset" field pass through unchanged.
 *
 * Unknown preset IDs: the widget passes through with only its local fields
 * (typically just "id").  WidgetRenderer will render a warning block — no crash.
 * A console.warn is emitted at resolve time to aid diagnosis.
 *
 * @param {Object[]} widgets  Raw widget array from definition.json
 * @param {Object}   presets  widgetPresets map { [presetId]: partialWidgetDef }
 * @returns {Object[]}        Resolved widget array ready for rendering
 */
export function resolveWidgets(widgets, presets) {
  return widgets.map((widget) => {
    if (!widget.preset) return widget;

    const base = presets[widget.preset];
    if (!base) {
      console.warn(
        `[resolveWidgets] Unknown preset: "${widget.preset}". Widget "${widget.id}" not resolved.`
      );
      const { preset: _, ...rest } = widget;
      return rest;
    }

    const { preset: _, ...overrides } = widget;
    return { ...base, ...overrides };
  });
}
