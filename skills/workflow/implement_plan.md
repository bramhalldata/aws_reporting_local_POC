# skills/workflow/implement-plan.md

# Implement Plan Skill

## Purpose

This skill defines the **IMPLEMENT stage** of the PLAN → REVIEW → IMPLEMENT workflow used in the Scalable Client Reporting Solution project.

The purpose of the IMPLEMENT stage is to translate an **approved plan artifact** into working code **without deviating from the architecture defined during planning and review**.

This stage enforces **implementation discipline** by ensuring that code changes follow the approved design decisions captured in the plan and review artifacts.

---

# Workflow Context

This skill operates within the workflow defined in:

```
skills/workflow/plan-review-loop.md
```

Workflow stages:

```
PLAN → REVIEW → IMPLEMENT
```

Responsibilities:

| Stage | Responsible Agent | Output |
|------|------------------|--------|
| PLAN | Claude (planning model) | Plan artifact |
| REVIEW | ChatGPT (architecture reviewer) | Review artifact |
| IMPLEMENT | Claude (implementation model) | Code changes |

Implementation **must not begin** until:

- a plan artifact exists
- a review artifact exists
- the review outcome is **APPROVED** or **APPROVED WITH REVISIONS**

---

# First-Class Artifact Model

The IMPLEMENT stage consumes artifacts created during earlier stages.

Required inputs:

```
docs/plans/<feature>_plan.md

docs/reviews/<feature>_review.md
```

Example:

```
docs/plans/dashboard_navigation_plan.md

docs/reviews/dashboard_navigation_review.md
```

These artifacts define:

- architectural decisions
- implementation scope
- phased rollout strategy
- known risks

The implementation agent must treat these artifacts as **the source of truth**.

---

# Implementation Responsibilities

The implementation agent must:

• follow the approved architecture
• implement only the scope defined for the current phase
• avoid introducing unrelated features
• respect existing repository conventions
• maintain compatibility with existing functionality

The implementation agent must **not redesign the system during implementation**.

If architectural gaps are discovered, implementation should pause and request a plan revision.

---

# Pre-Implementation Checklist

Before writing code, confirm the following:

- A plan artifact exists
- A review artifact exists
- The review recommendation is APPROVED or APPROVED WITH REVISIONS
- The implementation phase is clearly defined

If any of these conditions are not met, implementation should not begin.

---

# Implementation Process

Typical implementation workflow:

1. Read the plan artifact
2. Read the review artifact
3. Identify the implementation phase
4. Identify files affected
5. Implement changes incrementally
6. Verify the definition of done

---

# Implementation Output Expectations

The implementation agent should provide:

1. A summary of changes
2. Files created or modified
3. Key architectural decisions preserved
4. Validation against the plan's definition of done

Example output format:

```
Implementation Summary

Feature: Dashboard Navigation
Phase: Phase 1 – Foundational Navigation

Files Created:
portal/src/components/NavBar.jsx

Files Modified:
portal/src/App.jsx
portal/src/dashboards/index.js

Verification:
- Nav bar renders dashboard tabs
- Active state detection works
- Registry-driven dashboard discovery confirmed
- Existing dashboards render without regression
```

---

# Implementation Guardrails

The implementation stage must enforce the following guardrails:

## 1. Phase Discipline

Only implement features belonging to the approved phase.

Example:

Phase 1 should not include:

- client switcher
- metadata-driven navigation
- permissions filtering

These belong to later phases.

---

## 2. Minimal Surface Area

Prefer the smallest code change that satisfies the plan.

Avoid unnecessary refactoring or restructuring unless required by the plan.

---

## 3. Preserve Existing Behavior

Existing dashboards and components must continue to function correctly.

Implementation must avoid introducing regressions.

---

## 4. Respect Plugin Architecture

Implementation must preserve compatibility with:

- dashboard registry
- plugin discovery
- future metadata-driven navigation

---

# When Implementation Should Pause

Implementation must stop and request plan clarification if:

- the plan conflicts with existing architecture
- required metadata or configuration is missing
- routing strategy becomes ambiguous
- new architectural decisions are required

In these cases, return to the PLAN stage.

---

# Post-Implementation Validation

After implementation, verify the **Definition of Done** listed in the plan artifact.

Typical checks include:

- feature behaves as expected
- navigation works correctly
- existing pages render without regression
- build succeeds

---

# Artifact Traceability

Implementation should reference both artifacts in documentation or commit messages.

Example:

```
Implements Phase 1 of Dashboard Navigation

Plan: docs/plans/dashboard_navigation_plan.md
Review: docs/reviews/dashboard_navigation_review.md
```

This ensures architectural decisions remain traceable.

---

# Benefits

The Implement Plan Skill ensures that implementation:

• follows approved architecture
• remains within defined scope
• avoids feature creep
• preserves system stability

By enforcing this discipline, the PLAN → REVIEW → IMPLEMENT workflow becomes a **repeatable engineering process** rather than an ad hoc coding exercise.

---

# Summary

The Implement Plan Skill translates approved design artifacts into working code while preserving architectural intent.

Combined with the PLAN and REVIEW skills, this forms a structured AI-assisted development workflow that is:

• traceable
• disciplined
• scalable
• suitable for collaborative engineering environments.

