# Feature Review: Dashboard Templates

**Feature:** Dashboard Templates
**Plan artifact:** docs/plans/dashboard_templates_plan.md
**Reviewer:** Self-review (pre-implementation)
**Date:** 2026-03-12

---

## Summary

The plan is well-scoped: three annotated `definition.json` starter files plus an index README,
a one-section addition to `add-dashboard.md`, and zero source code changes.  The
`<SCREAMING_SNAKE_CASE>` placeholder convention is consistent and immediately parse-time
detectable.  The template catalogue (minimal, kpi_overview, full_operational) covers the range
from prototype to full production dashboard.

---

## Findings

### P2 — Templates must use existing widget preset references where applicable

**Location:** §3 Template catalogue — `kpi_overview` and `full_operational` KPI sections

Templates that include KPI cards for `failures_last_24h` and `failures_last_7d` should use
preset references (`failures_24h_kpi`, `failures_7d_kpi`) rather than fully inlined widget
definitions.  The widget-library.md and add-dashboard.md both establish the convention: use a
preset when the binding is shared across ≥2 dashboards.  Templates demonstrating the inline
form for these metrics would undermine that convention.

**Resolution (included in plan §3):**  KPI sections in `kpi_overview` and `full_operational`
use `"preset"` field references.  Non-preset widget types (line_chart, data_table,
exceptions_table) use fully annotated inline definitions with placeholders.

---

### P2 — Placeholder syntax must be consistent and parseable

**Location:** §3 Placeholder conventions

Mixed placeholder styles across templates (`<placeholder>`, `"TODO"`, `"..."`) would make
templates harder to scan and miss-and-fix errors harder to catch.  Inconsistent syntax also
prevents a simple `grep '<'` completeness check.

**Resolution (included in plan §3):**  All string placeholders use `"<SCREAMING_SNAKE_CASE>"`.
Numeric layout fields use concrete defaults (`0`, `6`, `12`) with a comment explaining they
should be adjusted.  A `grep '<'` on a fully customised file returns no matches.

---

### P3 — `docs/templates/README.md` must open with a decision table

**Location:** §5 Files to Create — README.md

With three templates in the same directory, a developer's first question is "which one should I
start from?" Without a decision table, they read all three before choosing.

**Resolution (included in plan §5):**  `README.md` opens with a decision table mapping
dashboard type descriptions to recommended templates.

---

### P3 — `add-dashboard.md` "Starting from a template" section should include a shell copy command

**Location:** §5 Files to Modify — add-dashboard.md

A one-line `cp` command makes the workflow tangible and reduces the mental step from "I should
use a template" to actually using one.

**Resolution (included in plan §5 and §6):**
```sh
cp docs/templates/kpi_overview.json portal/src/dashboards/<id>/definition.json
```

---

## Scope Confirmation

| Non-goal | Confirmed excluded? |
|----------|-------------------|
| Full scaffolding generator | Yes — copy-and-fill only; no tooling |
| UI-based dashboard builder | Yes — no UI changes of any kind |
| Template marketplace | Yes — local docs directory only |

---

## Files to Create / Modify

| File | Action | Confirmed in plan? |
|------|--------|--------------------|
| `docs/templates/minimal.json` | Create | Yes |
| `docs/templates/kpi_overview.json` | Create | Yes |
| `docs/templates/full_operational.json` | Create | Yes |
| `docs/templates/README.md` | Create | Yes |
| `docs/guides/add-dashboard.md` | Add "Starting from a template" section | Yes |

---

## Verdict

**APPROVED — P2 items (preset references, consistent placeholder syntax) and P3 items
(README decision table, cp command) are all included in implementation scope.**

Implementation may proceed once external review is complete.
