# Feature Review: Widget Library Documentation

**Feature:** Widget Library Documentation
**Plan artifact:** docs/plans/widget_library_docs_plan.md
**Reviewer:** Self-review (pre-implementation)
**Date:** 2026-03-12

---

## Summary

The plan produces a single focused reference document (`docs/guides/widget-library.md`) covering
all widget types, the metric catalog, widget presets, naming conventions, and guardrails.  The
scope is well-bounded: docs only, no code changes.  The per-widget template (purpose → fields
table with Required column → data shape → examples) is consistent and scannable.

---

## Findings

### P2 — Per-widget fields tables must include a Required column

**Location:** §3 Widget Type Reference, each per-widget section

Without a Required column, developers cannot tell which fields are mandatory vs. optional when
writing a new widget block in `definition.json`.  For example, on `kpi_card`: `type` and
`data_source` are required; `metric`, `kpi_config`, and `title` are optional.  The distinction
changes how developers author widget definitions.

**Resolution (included in plan §3):** Each per-widget fields table includes a Required column.
The `metric` field on `kpi_card` is marked "No*" with a footnote explaining when it is
effectively required.

---

### P2 — Guardrails section must cross-link to architecture.md

**Location:** §3 Guardrails section

The rule "metrics must be defined in metricCatalog.js — not in component logic or
propsAdapters" is not a style preference.  It is an architecture constraint documented in
`docs/architecture.md` and enforced by `CLAUDE.md`.  Presenting it without an authoritative
reference may cause developers to treat it as a suggestion.

**Resolution (included in plan §3 Guardrails):** The rule explicitly references
`docs/architecture.md` as the authoritative source.

---

### P3 — Document the `kpi_config` override block shape

**Location:** §3 `kpi_card` section

The `kpi_card` widget accepts an optional `kpi_config` object (`{ tone, footnote, delta,
sparklineData }`) that overrides metric catalog values.  This is not documented anywhere except
source code.  Without documentation, developers either over-rely on the catalog (when a
per-widget override is more appropriate) or never discover the override mechanism exists.

**Resolution (included in plan §3):** A `kpi_config` fields table is included in the `kpi_card`
section, with all four fields and their descriptions.  `sparklineData` is noted as reserved.

---

### P3 — Document the UnknownWidget fallback explicitly

**Location:** §3 "Adding a New Widget Type" and Guardrails sections

Developers new to the platform may be cautious about experimenting with widget type strings
because they don't know what happens on a typo.  Knowing that a typo renders a visible yellow
warning block (not a crash, not a blank screen) reduces friction and encourages iteration.

**Resolution (included in plan §3):** Both the "Adding a New Widget Type" and Guardrails
sections note that unknown widget type strings render `UnknownWidget` — a visible warning block,
not a crash.  The same fallback applies to unknown preset IDs.

---

## Scope Confirmation

| Non-goal | Confirmed excluded? |
|----------|-------------------|
| Full docs website | Yes — single markdown file only |
| Storybook adoption | Yes — no tooling changes of any kind |
| Marketing documentation | Yes — audience is internal developers only |

---

## Files to Create / Modify

| File | Action | Confirmed in plan? |
|------|--------|--------------------|
| `docs/guides/widget-library.md` | Create | Yes |
| `docs/guides/add-dashboard.md` | Narrow the widget-types section to a cross-reference link | Yes |

---

## Verdict

**APPROVED — P2 items (Required column, architecture.md cross-reference) and P3 items
(`kpi_config` table, UnknownWidget fallback note) are all included in implementation scope.**

Implementation may proceed once external review is complete.
