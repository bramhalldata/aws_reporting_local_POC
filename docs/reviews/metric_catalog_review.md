# Review: Metric Catalog Plan

**Plan artifact:** docs/plans/metric_catalog_plan.md
**Reviewer role:** Staff-level architecture reviewer
**Review date:** 2026-03-11
**Revision date:** 2026-03-11 — plan revised to incorporate P1 required items; see §8

---

## 1. Review Summary

The plan is well-scoped and architecturally sound for the current stage of the platform.
It correctly isolates the change to the `propsAdapter` layer in `widgetRegistry.js`, keeps
`KpiCard` and `WidgetRenderer` untouched, and maintains full backward compatibility.

The design satisfies the core goal — centralising label, tone, footnote, and formatting
rules so widgets reference a metric by ID rather than duplicating display logic inline.

One required clarification exists: the feature prompt explicitly lists **data source binding
or query mapping** as a required metric definition field.  The plan treats the catalog as
display-only and omits this field without documenting the decision.  This must be resolved
before implementation begins.

All other concerns are minor and noted as recommended improvements.

---

## 2. Strengths of the Plan

**Backward compatibility is guaranteed.**
The `widget.metric` field is optional.  Widgets without it fall through to today's behaviour
unchanged.  No existing dashboards break on deploy.

**Resolution order is explicit and predictable.**
Catalog defaults → widget `title` override → `kpi_config.*` override.  This avoids
ambiguity about which layer wins and allows per-widget exceptions without forking the catalog.

**Change surface is minimal and contained.**
Four files total: one new module, one modified registry, two modified JSON definitions.
`KpiCard`, `DashboardRenderer`, and `WidgetRenderer` are all untouched.  This is the right
way to introduce a new abstraction layer — through the adapter, not the component.

**Initial catalog is appropriately scoped.**
Five entries covering exactly the existing kpi_card widgets.  No speculative entries, no
premature generalisation.

**Negative tests are present and meaningful.**
Testing unknown metric ID fallback and threshold non-trigger are both important regression
surfaces.

---

## 3. Architectural Concerns

### 3.1 Data Source Binding is Absent — Feature Prompt Requires It

The feature prompt states:

> Metric definitions should support at minimum: ... data source binding or query mapping

The plan omits `data_source` from the catalog definition shape entirely.  The current widget
definition still carries its own redundant `data_source.field`, which means a metric like
`failures_last_24h` is defined in two places: the catalog (display) and the widget
definition (data binding).

If the intent is to deliberately defer data source binding to a later phase, that decision
must be documented explicitly in the plan.  As written, the omission looks accidental.

**Suggested addition to plan:**

Add a `data_source_field` property to the catalog definition shape (even if not enforced in
Phase 1), and document clearly that auto-binding from catalog to `data_source.field` is
deferred to a future feature.

---

### 3.2 Catalog Lookup Logic Lives Directly in the propsAdapter

The plan places metric catalog resolution logic inside the `kpi_card` propsAdapter.  This
works today, but creates a risk:

- If a future widget type (e.g. `gauge`, `sparkline_card`) also needs metric catalog
  resolution, the lookup logic will be duplicated across multiple propsAdapters.

**Suggested improvement:**
Extract a small `resolveMetric(widget, catalog)` helper function exported from
`metricCatalog.js`.  The `kpi_card` propsAdapter calls it.  Future widget types call the
same function.  The logic lives in one place.

This is a low-effort change that significantly improves future maintainability.

---

### 3.3 Metric IDs Are Implicitly Coupled to Artifact Field Names

The plan uses metric IDs such as `failures_last_24h` that happen to match the artifact
field names in `summary.json`.  This is convenient but creates implicit coupling:

- If the artifact field is renamed (e.g. `failures_24h`), both the metric ID and all widget
  `data_source.field` references must be updated together.
- The relationship between metric ID and artifact field is undocumented — a future developer
  may not realise they are related.

**Suggested improvement:**
Add a comment in `metricCatalog.js` noting that metric IDs match artifact field names by
convention (not enforcement), and that the `data_source.field` in each widget definition is
the authoritative binding.  This makes the coupling explicit and intentional rather than
accidental.

---

### 3.4 No Unit Tests Planned

The plan includes verification steps and negative test scenarios but does not list any unit
test files to create or modify.  The platform guardrails (`skills/architecture/platform_guardrails.md`)
require tests for new logic.

The propsAdapter threshold evaluation logic and the metric resolution fallback path are
both worth unit testing — they are silent-failure surfaces (wrong tone silently applied,
wrong label silently rendered).

**Required addition:**
Add a test file to the plan's "Files to Create" section.  Even a single test module
covering the three negative test scenarios would satisfy the guardrail.

---

### 3.5 Formatter Application Is Asymmetric

For `"number"` formatter, the raw value is passed through and `KpiCard` applies
`toLocaleString`.  For `"currency"` and `"percent"`, the propsAdapter pre-formats and
passes a string.

This means formatting responsibility is split across two layers for different formatter
types.  While the current initial catalog entries only use `"number"` and `"string"`, the
asymmetry will surface when `"currency"` is first used.

**Suggested improvement:**
Document this design decision explicitly in the plan, or consider always applying the
formatter in the propsAdapter and passing a string — KpiCard already handles strings as-is.
Either approach is acceptable; the plan should pick one and state it.

---

## 4. Scalability Assessment

**Metric count:** A flat JS object catalog scales comfortably to 50–100 entries.  Beyond
that, per-domain files (e.g. `dlqMetrics.js`, `pipelineMetrics.js`) imported into a master
catalog would be appropriate.  Not a current concern.

**Client variation:** The plan does not address per-client metric label or threshold
overrides.  For the current single-client POC this is fine.  When multi-client
configuration is introduced, the catalog will need a layering model (base catalog +
client overrides).  Flag this as a future architectural note, not a blocker.

**Widget type coverage:** The plan correctly limits catalog support to `kpi_card` in Phase 1.
The `resolveMetric` helper recommendation (see §3.2) ensures that extending to other widget
types later requires no structural change.

---

## 5. Missing Design Decisions

| Decision | Status | Required Before Implementation? |
|----------|--------|----------------------------------|
| Should `data_source_field` be part of the catalog shape? | Not addressed — see §3.1 | Yes — must be explicitly deferred or included |
| Should `resolveMetric` be a standalone helper? | Not addressed | No — recommended improvement |
| What happens when `widget.title` is omitted and `metric` is not set? | Implicitly falls back to no-label | Should be stated explicitly |
| Are unit tests in scope for this feature? | Not mentioned | Yes — required by platform guardrails |

---

## 6. Recommended Improvements

**P1 — Required before implementation:**

1. Document the `data_source` binding decision explicitly.  Either add `data_source_field`
   to the catalog shape (even as optional/advisory) or add a "Deferred" section that
   explains why it is out of scope for this feature.

2. Add a test file to "Files to Create."  At minimum, a test module covering the negative
   test scenarios from the plan.

**P2 — Strongly recommended:**

3. Extract a `resolveMetric(widget, catalog)` helper into `metricCatalog.js` to prevent
   future duplication across propsAdapters.

4. Add an inline comment in `metricCatalog.js` documenting the metric ID ↔ artifact field
   naming convention.

**P3 — Nice to have:**

5. Clarify formatter asymmetry in the plan — either commit to "always format in propsAdapter"
   or document that `"number"` delegates to KpiCard intentionally.

6. Add a note to the plan about the future multi-client override pattern so it is not
   forgotten when that phase arrives.

---

## 7. Implementation Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Unknown metric ID silently renders wrong label | Medium | Low–Medium | Negative test #1 in plan covers this; add console.warn in propsAdapter |
| Threshold evaluation applies wrong tone silently | Low | Medium | Unit test the propsAdapter threshold path |
| Widget `title` omitted + no `metric` set → blank label | Low | Medium | Add guard in propsAdapter; document expected behaviour |
| Metric ID renamed causes silent display regression | Low | Low | Document naming convention; no enforcement mechanism needed at POC scale |

---

## 8. Approval Recommendation

**Initial verdict (2026-03-11):** `APPROVED WITH REVISIONS` — two P1 items required.

**Revised verdict (2026-03-11):** `APPROVED`

Both required revisions have been incorporated into the plan:

1. **`data_source_field` added to catalog shape** — documented as advisory/deferred with
   explicit rationale for why full binding is out of scope for this feature.

2. **`portal/src/metricCatalog.test.js` added to "Files to Create"** — 7 test cases
   covering catalog resolution, widget-level overrides, unknown metric fallback, and
   threshold evaluation.

Implementation may proceed.
