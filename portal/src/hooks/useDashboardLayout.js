import { useState, useEffect } from "react";

// ---------------------------------------------------------------------------
// useDashboardLayout — persists grid section layouts to localStorage.
//
// Key format: portal:layout:{dashboardId}
// Value:      JSON.stringify({ [sectionId]: [{ i, x, y, w, h }] })
//
// Merge rules on load:
//   - Widget present in definition + in saved data  → saved position wins
//   - Widget present in definition, absent in saved → definition defaults
//   - Widget absent from definition, present in saved → silently dropped
// ---------------------------------------------------------------------------

function storageKey(dashboardId) {
  return `portal:layout:${dashboardId}`;
}

function buildDefaultLayouts(definition) {
  const defaults = {};
  definition.layout.sections.forEach((section) => {
    if (section.layout?.type === "grid") {
      defaults[section.id] = section.widget_ids
        .map((id) => definition.widgets.find((w) => w.id === id))
        .filter(Boolean)
        .map((w) => ({
          i: w.id,
          x: w.layout?.col ?? 0,
          y: w.layout?.row ?? 0,
          w: w.layout?.w  ?? 6,
          h: w.layout?.h  ?? 2,
        }));
    }
  });
  return defaults;
}

function loadLayouts(definition) {
  const defaults = buildDefaultLayouts(definition);
  try {
    const raw = localStorage.getItem(storageKey(definition.id));
    if (!raw) return defaults;
    const saved = JSON.parse(raw);
    const merged = {};
    Object.keys(defaults).forEach((sectionId) => {
      const defaultItems = defaults[sectionId];
      const savedItems = saved[sectionId] ?? [];
      merged[sectionId] = defaultItems.map((defaultItem) => {
        const savedItem = savedItems.find((s) => s.i === defaultItem.i);
        return savedItem ?? defaultItem;
      });
    });
    return merged;
  } catch {
    // Corrupted JSON or storage unavailable — fall back to definition defaults
    return defaults;
  }
}

function saveLayouts(dashboardId, sectionLayouts) {
  try {
    localStorage.setItem(storageKey(dashboardId), JSON.stringify(sectionLayouts));
  } catch {
    // Storage unavailable (private browsing) or quota exceeded — silently continue
  }
}

export function useDashboardLayout(definition) {
  const [sectionLayouts, setSectionLayouts] = useState(() =>
    loadLayouts(definition)
  );

  // Persist whenever layout state changes.
  useEffect(() => {
    saveLayouts(definition.id, sectionLayouts);
  }, [sectionLayouts, definition.id]);

  function updateSectionLayout(sectionId, newLayout) {
    setSectionLayouts((prev) => ({ ...prev, [sectionId]: newLayout }));
  }

  function resetLayouts() {
    try {
      localStorage.removeItem(storageKey(definition.id));
    } catch {
      // Storage unavailable — reset state only
    }
    setSectionLayouts(buildDefaultLayouts(definition));
  }

  return { sectionLayouts, updateSectionLayout, resetLayouts };
}
