# Review: Add-New-Dashboard Workflow Plan (Feature 10)

**Plan artifact:** docs/plans/dashboard_creation_workflow_plan.md
**Reviewer role:** Staff-level architecture reviewer
**Review date:** 2026-03-11

---

## 1. Review Summary

The plan is correct and well-scoped.  It accurately characterizes the minimal file set,
names the right conventions, and identifies all the platform files that should remain
unchanged.  The deliverable is documentation only — no source code changes — which is
appropriate given that the platform architecture is already correct; the gap is
discoverability.

Two concerns are raised:

- **P2 — `metric` catalog coupling not surfaced prominently enough**: The plan mentions
  it in the risks table, but a developer following the guide would encounter it as a
  runtime-only failure (wrong label, or blank KPI) rather than a visible error.  The
  guide should call this out at the point of the widget definition, not just in a
  footnote.
- **P3 — Guide staleness risk is real but low-cost to address**: The widget types table
  and metric catalog are the two most likely sources of drift.  Adding a note at the top
  of the guide pointing to the source files as the authoritative reference costs nothing
  and keeps the guide honest.

Neither concern blocks implementation.

The plan is approved as written.

---

## 2. Strengths of the Plan

**Correctly identifies the minimal file set.**
Three files per dashboard is the right answer: `definition.json`,
`<ComponentName>.jsx`, and one registry entry.  The plan correctly states that no
platform files change — this is the key property of the plugin architecture established
by Features 7–9.

**Templates are copy-paste ready.**
Both the view component template (5 lines) and the `definition.json` template are
complete and accurate.  A developer can copy them verbatim and substitute placeholders
without understanding the underlying architecture.

**Naming conventions table is precise.**
`snake_case` IDs, `PascalCase` component filenames, and `snake_case.json` artifact
names are all correct and match existing conventions in `dlq_operations` and
`pipeline_health`.

**Widget types table is accurate.**
The four widget types (`kpi_card`, `line_chart`, `data_table`, `exceptions_table`) and
their data shapes match `portal/src/widgetRegistry.js`.

**Section layout types are documented.**
The `grid` vs. `stack` distinction is a non-obvious behavioral difference that was not
previously documented anywhere.  Including it in the guide is valuable.

**Verification steps are concrete.**
The smoke test — "add a dummy dashboard, confirm tab appears without touching App.jsx or
NavBar.jsx, then remove it" — directly validates the feature's stated goal and is quick
to execute.

---

## 3. Architectural Concerns

### 3.1 `metric` catalog coupling not surfaced at point of use (P2)

The `definition.json` template includes:

```json
{
  "id": "metric_a",
  "type": "kpi_card",
  "metric": "<metric_catalog_id>",
  ...
}
```

The plan notes in the risks table that the `metric` ID must exist in
`portal/src/metricCatalog.js`.  However, this note is easy to miss.  If the ID is
absent from the catalog:

- The KPI card renders with `undefined` label and `undefined` value — silent failure
- No console error is thrown; the widget still mounts

**Recommended improvement (non-blocking):** In the guide, add an inline callout
immediately after the widget definition template:

> **If your widget has a `"metric"` field**, add a matching entry to
> `portal/src/metricCatalog.js` before testing.  If the entry is missing, the card
> renders with blank label and value — there is no error.

This is a documentation improvement only; no catalog behavior change is needed.

---

### 3.2 Guide staleness risk (P3)

The widget types table and metric catalog are living documents.  As new widget types are
added to `widgetRegistry.js` or new metrics added to `metricCatalog.js`, the guide will
drift.

**Recommended improvement (non-blocking):** Add a header note to the guide:

> The widget types and metric IDs listed here reflect the platform at the time of
> writing.  For the authoritative list, consult:
> - Widget types: `portal/src/widgetRegistry.js`
> - Metric IDs and catalog fields: `portal/src/metricCatalog.js`

---

## 4. Completeness Assessment

| Guide section | Covered in plan? | Complete? |
|---------------|-----------------|-----------|
| 3-step workflow summary | Yes | Yes |
| Naming conventions | Yes | Yes |
| View component template | Yes | Yes — 5 lines, matches PipelineHealth.jsx |
| definition.json template | Yes | Yes — all required fields present |
| Section layout types | Yes | Yes — grid vs. stack distinction documented |
| Widget types table | Yes | Yes — all 4 current types listed |
| `metric` catalog note | Partial | P2 — needs inline callout at point of use |
| Registry entry instructions | Yes | Yes |
| Validation checklist | Yes (verification section) | Yes |
| Staleness guidance | No | P3 — add source file pointers |

---

## 5. Missing Design Decisions

| Decision | Required Before Implementation? | Notes |
|----------|----------------------------------|-------|
| How to handle widgets with no `metric` field | No — already handled by widgetRegistry | Non-metric widgets use `title` field directly |
| Publisher artifact naming conventions | No — out of scope | Publishers own this; guide covers portal side only |

---

## 6. Implementation Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Template drifts from actual component pattern | Low | Medium — developers follow wrong template | Keep reference note pointing to PipelineHealth.jsx |
| `metric` field omitted from catalog silently breaks KPI | Medium | Low — visible at dev time | Add inline callout per §3.1 |
| Guide not found by developers | Low | Low — can be linked from CLAUDE.md | Consider adding guide link to CLAUDE.md or startup guide |

---

## 7. Approval Recommendation

```
APPROVED
```

The plan is correct, minimal, and accurately describes the current platform conventions.
The two concerns raised (§3.1 and §3.2) are documentation improvements that should be
incorporated into the guide during implementation; neither blocks proceeding.
