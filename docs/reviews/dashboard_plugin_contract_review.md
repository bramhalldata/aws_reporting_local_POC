# Feature Review: Dashboard Plugin Contract

**Feature:** Dashboard Plugin Contract
**Plan artifact:** docs/plans/dashboard_plugin_contract_plan.md
**Reviewer:** Self-review (pre-implementation)
**Date:** 2026-03-12

---

## Summary

The plan defines a clean, minimal plugin contract backed by `registerPlugin()`, two new files
(`plugins/registerPlugin.js`, `plugins/index.js`), one import line in `App.jsx`, and a guide
update.  Core rendering pipeline is untouched.  The contract is sound for v1.

---

## Findings

### P2 — Collision detection missing from initial contract sketch

**Location:** §3.3 `registerPlugin` function

The first-pass sketch of `registerPlugin` did not include collision guards.  Without them:

- Two plugins contributing the same dashboard `id` would both be pushed to the array, creating
  duplicate routes and nav tabs.
- Two plugins contributing the same widget type key would silently overwrite each other.

**Resolution (included in plan §3.3):**  `registerPlugin` now checks for duplicate dashboard
ids (warn + skip) and duplicate widget/metric/preset keys (warn + overwrite).  Both behaviours
are consistent with how the platform handles unknown widget types — fail gracefully, log a
diagnostic.

---

### P2 — Direct registry mutation must be explicitly unsupported

**Location:** §4, §6

Plugins have full access to the registry imports and could call `Object.assign(widgetRegistry, ...)`
directly without going through `registerPlugin`.  This bypasses collision guards and leaves no
documented extension point.

**Resolution (included in plan):**  `registerPlugin.js` will include an explicit comment that
direct mutation of registries outside this function is unsupported.  The module acts as the
single documented registration boundary.

---

### P3 — Bootstrap module should include a commented example

**Location:** §3.4 `plugins/index.js`

An empty `export {}` is technically correct but provides no guidance on usage.  New developers
will need to look elsewhere to understand the pattern.

**Resolution (included in plan §3.4):**  `plugins/index.js` includes a commented example
showing the import + `registerPlugin()` call pattern.

---

### P3 — App.jsx import order is implicit and undocumented

**Location:** §3.5, §4

The requirement that `plugins/index.js` be imported before any registry consumer is critical to
correct bootstrap but is not self-evident from the import line alone.

**Resolution (included in plan §3.5):**  The import line includes a comment:
`// side-effect: registers all plugins before routes render`

---

## Scope Confirmation

| Non-goal | Confirmed excluded? |
|----------|-------------------|
| Marketplace / package distribution system | Yes — no package manager integration of any kind |
| Security sandboxing framework | Yes — plugins are trusted first-party modules |
| Remote plugin loading | Yes — all plugins are local ES module imports |

---

## Files to Create / Modify

| File | Action | Confirmed in plan? |
|------|--------|--------------------|
| `portal/src/plugins/registerPlugin.js` | Create | Yes |
| `portal/src/plugins/index.js` | Create | Yes |
| `portal/src/App.jsx` | Add 1 import line | Yes |
| `docs/guides/add-dashboard.md` | Add plugin section | Yes |

---

## Verdict

**APPROVED — P2 collision-detection guards and P2 direct-mutation documentation are
included in implementation scope.  P3 items (commented example, import comment) are also
included and are low-effort.**

Implementation may proceed once external review is complete.
