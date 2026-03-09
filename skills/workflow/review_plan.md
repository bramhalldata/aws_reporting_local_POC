# skills/workflow/review-plan.md

# Review Plan Skill

## Purpose

This skill defines the **REVIEW stage** of the PLAN → REVIEW → IMPLEMENT workflow used in the Scalable Client Reporting Solution project.

The purpose of the REVIEW stage is to **critically evaluate a planning artifact before implementation begins**. This step ensures architectural integrity, reduces implementation risk, and prevents premature coding decisions.

The review stage transforms planning output into a **first‑class artifact** that can be inspected, challenged, and approved before development proceeds.

A review is not complete until the reviewer confirms the review artifact was written to docs/reviews/<feature>_review.md

---

# Workflow Context

This skill operates within the broader workflow defined in:

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
| PLAN | Claude (or planning model) | Plan artifact |
| REVIEW | ChatGPT (architecture reviewer) | Review artifact |
| IMPLEMENT | Claude | Code changes |

---

# First-Class Artifact Model

Plans and reviews must be stored as **versioned artifacts in the repository**, not left inside chat transcripts.

Recommended structure:

```
docs/
    plans/
        <feature>_plan.md
    reviews/
        <feature>_review.md
```

Example:

```
docs/plans/dashboard_navigation_plan.md

docs/reviews/dashboard_navigation_review.md
```

The plan artifact is produced during the PLAN stage.

The review artifact is produced during the REVIEW stage.

Implementation must **not begin until a review artifact exists**.

---

# Inputs

The REVIEW stage consumes:

1. A plan artifact

Example:

```
docs/plans/dashboard_navigation_plan.md
```

2. The workflow definition

```
skills/workflow/plan-review-loop.md
```

3. Relevant architectural contracts

Example:

```
skills/artifacts/design-artifact-contract.md
```

---

# Reviewer Responsibilities

The reviewer must behave like a **staff-level architecture reviewer**, not the original author.

The reviewer should focus on:

• architectural weaknesses
• scalability risks
• hidden coupling
• unclear responsibilities
• incomplete design decisions
• future migration risks
• unnecessary complexity

The reviewer should **challenge assumptions** and propose improvements where necessary.

---

# Review Output Requirements

The review must be written as a **separate artifact**, not inline comments in the plan.

Example output location:

```
docs/reviews/<feature>_review.md
```

Example:

```
docs/reviews/dashboard_navigation_review.md
```

---

# Required Review Sections

Each review artifact should contain the following sections.

## 1. Review Summary

Provide a concise assessment of the plan.

Example:

- Is the architecture sound?
- Is the feature scoped appropriately?
- Does the design align with system direction?

---

## 2. Strengths of the Plan

Identify what the plan does well.

Examples:

- clear phased rollout
- minimal Phase 1 scope
- extensible architecture

---

## 3. Architectural Concerns

Identify weaknesses or potential issues.

Examples:

- tight coupling between navigation and registry
- routing migration complexity
- unclear metadata contract

---

## 4. Scalability Assessment

Evaluate whether the design will scale when:

- dashboards increase
- clients increase
- metadata-driven navigation appears
- permission filtering is introduced

---

## 5. Missing Design Decisions

Identify decisions that must be clarified before implementation.

Examples:

- navigation grouping model
- metadata schema
- overflow strategy for many dashboards

---

## 6. Recommended Improvements

Provide actionable suggestions.

Examples:

- introduce navigation model abstraction
- add plugin grouping capability
- clarify routing transition plan

---

## 7. Implementation Risks

List the most likely failure modes during implementation.

Examples:

- routing regressions
- layout conflicts
- plugin registry drift

---

## 8. Approval Recommendation

The reviewer must provide a clear recommendation:

```
APPROVED
APPROVED WITH REVISIONS
REQUIRES REVISION
```

Implementation should only proceed if the plan is **APPROVED** or **APPROVED WITH REVISIONS**.

---

# Review Process

Typical review process:

1. PLAN artifact created
2. REVIEW artifact generated
3. Plan updated if necessary
4. Implementation approved

Example:

```
docs/plans/dashboard_navigation_plan.md

docs/reviews/dashboard_navigation_review.md
```

---

# Example Review Prompt

When initiating the REVIEW stage, the AI reviewer can be prompted with:

```
Review the plan artifact:

docs/plans/<feature>_plan.md

Follow the REVIEW stage defined in:

skills/workflow/review-plan.md

Produce a review artifact:

docs/reviews/<feature>_review.md
```

---

# Artifact Lifecycle

```
PLAN
    docs/plans/<feature>_plan.md

REVIEW
    docs/reviews/<feature>_review.md

IMPLEMENT
    code changes + commit referencing plan/review artifacts
```

This ensures every feature has traceable architectural reasoning.

---

# Benefits

Treating plans and reviews as artifacts provides:

• architectural traceability
• reproducible AI workflows
• easier onboarding for contributors
• stronger design discipline
• reduced risk of architectural drift

---

# Summary

The Review Plan Skill ensures that every feature design receives **structured architectural scrutiny before implementation**.

By storing both plans and reviews as repository artifacts, the development process becomes:

• transparent
• repeatable
• reviewable
• AI-friendly

This approach transforms AI-assisted development from conversational experimentation into a **disciplined engineering workflow**.

