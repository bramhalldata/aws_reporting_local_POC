# Skill: Plan Review Loop

## Purpose

This skill enforces a disciplined workflow for implementing non-trivial changes.

Before writing or modifying code, the assistant must:
1. Generate a clear implementation plan
2. Persist the plan to disk
3. Allow the plan to be reviewed externally
4. Incorporate feedback
5. Only then implement the change

This process ensures architectural clarity, prevents scope drift, and improves code quality.

The plan review loop is mandatory for any feature that:
- modifies multiple files
- affects architecture
- introduces new artifacts or schemas
- changes data contracts
- modifies core platform components
- introduces new dashboards
- changes publisher behavior

For trivial changes (e.g., typo fixes, small UI tweaks), this process may be skipped.

---

# Workflow

The workflow consists of five phases.

## Phase 1 — Plan Creation

Before writing code, the assistant must generate an implementation plan.

The plan must include:

- Goal
- Files to create
- Files to modify
- Schema or artifact changes
- Configuration changes
- Verification steps
- Negative tests

Plans should clearly separate:

```
Files to Create
Files to Modify
Unchanged Components
```

Plans must avoid vague language.

Example (good):

```
Files to Create
- dashboards/pipeline_health/dashboard.json
- src/publisher/validators/pipeline_health_summary_schema.py

Files to Modify
- src/publisher/main.py
- sql/athena_views.sql
```

Example (bad):

```
Update some publisher logic
Add a few files
```

---

## Phase 2 — Persist Plan to Disk

The plan must be written to the repository before implementation.

Location:

```
docs/plans/<feature_name>_plan.md
```

Example:

```
docs/plans/add_pipeline_health_dashboard_plan.md
```

Persisting the plan provides:

- version control
- reviewability
- historical documentation
- reproducibility

The assistant should confirm:

```
Plan saved to:
docs/plans/<plan_name>.md
```

---

## Phase 3 — External Review

After the plan is persisted, the assistant must pause implementation and wait for review.

The user may:

- review the plan manually
- review the plan in another AI system
- suggest architectural changes
- request refinements

The assistant must not implement the plan until explicitly approved.

---

## Phase 4 — Plan Revision

If feedback is provided, the assistant must revise the plan.

Revision rules:

1. Remove stale sections from earlier plans
2. Ensure scope matches the requested feature
3. Maintain architectural guardrails
4. Keep the plan concise and consistent
5. Update verification steps if needed

After revision, the updated plan should overwrite the original file.

---

## Phase 5 — Implementation

Only after approval should the assistant implement the plan.

Implementation rules:

- Follow the plan exactly
- Do not introduce unrelated refactors
- Do not modify files not listed in the plan
- Preserve backward compatibility
- Maintain platform architecture boundaries

When implementation finishes, provide:

```
Files created
Files modified
How to run the feature
Verification steps
```

---

# Plan Structure

Every plan should follow this structure:

```
Goal
Files to Create
Files to Modify
Unchanged Components
New SQL / Schema / Config
New Artifacts
Validator Changes (if applicable)
Publisher Changes (if applicable)
Portal Changes (if applicable)
Verification Steps
Negative Tests
```

This structure ensures consistency across all feature plans.

---

# Plan Quality Guidelines

Plans must be:

### Specific
File paths must be explicit.

### Scoped
Only include changes required for the feature.

### Architecture-aware
Respect system boundaries.

### Reproducible
Another engineer should be able to implement the feature using only the plan.

---

# Architectural Guardrails

Plans must respect existing platform architecture.

For this repository:

- SQL metrics remain in `sql/athena_views.sql`
- The publisher assembles artifacts
- The portal reads artifacts
- Artifacts define the data contract
- Dashboard configuration drives behavior
- Shared publisher logic remains generic
- Dashboard-specific logic remains isolated

Plans must not violate these rules.

---

# Anti-Patterns to Avoid

Plans must avoid:

### Hidden Refactors

Bad example:

```
While implementing this feature, we will also reorganize the publisher code.
```

### Unscoped File Changes

Bad example:

```
Various UI files updated.
```

### Copy-Pasted Stale Content

Plans must not include sections from previous completed plans.

Each plan must describe only the current feature.

---

# Verification Requirements

Every plan must include verification steps.

Example:

```
publisher run --env local --dashboard pipeline_health

Expected output:
artifacts/current/pipeline_health/
  summary.json
  failure_types.json
  manifest.json
```

Verification steps must confirm:

- artifacts generated
- schemas valid
- UI renders
- existing dashboards still work

---

# Negative Testing

Plans must include at least two failure scenarios.

Example:

```
publisher run --env local --dashboard nonexistent
→ exits with "Dashboard config not found"

Remove required SQL block
→ publisher fails validation
```

Negative testing ensures robustness.

---

# Implementation Output

After implementing the plan, the assistant must summarize:

```
Files created
Files modified
Verification results
```

Example:

```
Files created:
- dashboards/pipeline_health/dashboard.json
- portal/src/dashboards/pipeline_health/PipelineHealth.jsx

Files modified:
- sql/athena_views.sql
- src/publisher/main.py
```

---

# When This Skill Must Be Used

This workflow is required for:

- new dashboards
- publisher changes
- artifact schema changes
- architectural refactors
- new platform features

It is optional for:

- small UI tweaks
- documentation changes
- minor bug fixes

---

# Benefits

Using the plan review loop provides:

- better architecture decisions
- reduced implementation mistakes
- safer refactoring
- cleaner commit history
- higher quality features

This workflow turns AI-assisted coding into a structured engineering process rather than ad-hoc generation.

