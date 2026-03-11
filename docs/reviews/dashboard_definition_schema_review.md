# Review: Dashboard Definition Schema Plan

**Plan artifact:** docs/plans/dashboard_definition_schema_plan.md
**Review date:** 2026-03-11
**Reviewer:** Claude (pre-implementation self-review)

---

## Overall Assessment

**APPROVED with minor notes.**

The plan is well-scoped, architecturally sound, and respects all platform guardrails. It draws a clean boundary between publisher config (`dashboard.json`) and portal rendering config (`definition.json`). The schema is simple enough to implement quickly but structured enough to support Phases 2–6.

---

## Strengths

1. **Correct separation of concerns.** Keeping `dashboard.json` (publisher) and `definition.json` (portal) as separate files is the right call. The Python publisher does not need rendering metadata; the portal renderer does not need SQL block names. They share only `id` as a stable key.

2. **Minimal layout model.** Using `sections` with `widget_ids` arrays is the right level of abstraction for Phase 1. Grid coordinates (`x`/`y`/`w`/`h`) are correctly deferred to Phase 6 (Layout Abstraction).

3. **Existing widget types mapped.** All five current components (`KpiCard`, `TrendChart`, `TopSitesTable`, `ExceptionsTable`, `HealthBanner`) are represented in the widget type enum. No orphaned components.

4. **Both dashboards covered.** Two concrete `definition.json` examples ground the schema in real artifact data, making Phase 2 renderer development straightforward.

5. **No renderer implementation.** Phase 1 is correctly scoped to schema and contract definition only. No React changes are required.

6. **Backward compatible.** No existing files are deleted or broken. The portal continues to function from JSX composition until Phase 2 replaces it.

7. **`schema_version` naming.** Consistent with `manifest.json` field naming convention.

---

## Concerns / Notes

### 1. `data_source.field` names need documentation
The plan requires `field` values to match actual JSON artifact keys. These keys are currently scattered across Python validators in `src/publisher/validators/`. The `docs/json-contracts.md` update must explicitly list all valid field names per artifact so definition authors have a reference without reading Python source.

### 2. `health_banner` special binding
The `HealthBanner` component derives its data from `manifest.json`, not a data artifact. The plan correctly notes that `"artifact": "manifest.json"` with `"field": null` should be used. This must be called out explicitly in both the JSON Schema and `dashboardDefinition.js` so future definition authors do not attempt to bind it to a non-existent data artifact.

### 3. No validation tooling wired into CI
The plan creates `docs/schemas/dashboard_definition.schema.json` but does not add it to CI. For Phase 1 this is acceptable (schema is new, not yet consumed by the renderer). A follow-up to wire schema validation into the CI pipeline should be tracked after Phase 2.

### 4. `portal/src/types/dashboardDefinition.js` is documentation-only
This file must be clearly marked as shape documentation — not runtime code. It must not export logic that could be accidentally imported before Phase 2 provides the real renderer. Add a top-of-file comment making the intent explicit.

---

## Architecture Guardrail Check

| Rule | Status | Notes |
|------|--------|-------|
| Metrics defined in Athena only | ✅ Pass | Schema contains no metric computation |
| Portal is presentation only | ✅ Pass | `definition.json` is rendering config, not computation |
| Publisher behavior unchanged | ✅ Pass | `dashboard.json` unchanged; no Python changes |
| JSON artifacts are the delivery contract | ✅ Pass | Widgets bind to existing published artifacts |
| No portal metric logic | ✅ Pass | |
| No forked code per client | ✅ Pass | Schema is shared; instances are per dashboard only |
| Plans saved to docs/plans/ | ✅ Pass | |

---

## Recommendation

**Proceed to implementation.**

Address the following in the implementation pass:

1. In `docs/json-contracts.md`, list every valid `data_source.field` value per artifact alongside the field type
2. In `docs/schemas/dashboard_definition.schema.json`, add a `$comment` on the `health_banner` type noting it binds to `manifest.json`
3. In `portal/src/types/dashboardDefinition.js`, add a file-level comment: `// DOCUMENTATION ONLY — do not import as runtime code until Phase 2 renderer is implemented`

None of these are blocking. No structural changes to the plan are required.
