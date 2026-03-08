# Skill: Platform Architecture Guardrails

## Purpose

This skill defines the architectural boundaries of the analytics platform and ensures that future changes respect the system design.

The assistant must follow these guardrails whenever modifying the codebase. The goal is to preserve the platform's **artifact-driven architecture**, prevent architectural drift, and ensure new features remain modular and scalable.

These guardrails apply to:

- publisher changes
- dashboard additions
- artifact schema updates
- UI changes
- SQL metric definitions
- data pipeline extensions

---

# Core Platform Architecture

The system follows a **three-layer architecture**:

1. Data layer (SQL metrics)
2. Publisher layer (artifact generation)
3. Portal layer (presentation)

Each layer has strict responsibilities.

```
SQL Metrics  ->  Publisher  ->  Artifacts  ->  Portal UI
```

Violating these boundaries introduces coupling and must be avoided.

---

# Layer Responsibilities

## 1. SQL Layer

Location:

```
sql/athena_views.sql
```

Responsibilities:

- define metrics
- define aggregations
- define time windows
- compute operational indicators

Rules:

- business metrics must live in SQL
- SQL blocks must be named
- dashboards reference SQL blocks by name

Example SQL block:

```
-- [pipeline_docs_24h]
SELECT COUNT(DISTINCT document_id) AS total_documents
FROM ccd_failures
WHERE timestamp >= TIMESTAMPTZ '{report_ts}' - INTERVAL 24 HOURS
  AND timestamp <= TIMESTAMPTZ '{report_ts}';
-- [end]
```

The publisher should **never duplicate metric logic** that belongs in SQL.

---

## 2. Publisher Layer

Location:

```
src/publisher/
```

Responsibilities:

- execute SQL blocks
- assemble artifact payloads
- validate artifacts
- write artifacts to disk
- manage run history
- produce manifests

The publisher **does not define metrics**.

It converts SQL results into structured JSON artifacts.

Publisher responsibilities:

```
SQL Results
   ↓
Artifact Payload Assembly
   ↓
Schema Validation
   ↓
Write Artifacts
   ↓
Copy to current/
```

---

## 3. Portal Layer

Location:

```
portal/
```

Responsibilities:

- fetch artifact JSON
- render dashboards
- handle navigation
- present KPIs
- show tables and charts

The portal **must never compute business metrics**.

It is a pure presentation layer.

Example pattern:

```
fetch('/pipeline_health/summary.json')
```

The UI reads artifacts and renders them.

---

# Artifact Contracts

Artifacts are the **data contract** between the publisher and portal.

Artifacts must:

- be versioned
- have stable schema
- include metadata
- be validated

Required metadata fields:

```
schema_version
generated_at
report_ts
```

Artifacts must have a validator.

Validators live in:

```
src/publisher/validators/
```

Example artifact:

```
summary.json
```

Example schema enforcement:

```
jsonschema.validate(instance=artifact, schema=SCHEMA)
```

No artifact should exist without validation.

---

# Dashboard Plugin Model

Dashboards are plugins.

Location:

```
dashboards/<dashboard_id>/dashboard.json
```

Example:

```
dashboards/pipeline_health/dashboard.json
```

Dashboard configuration defines:

```
dashboard_id
title
description
portal_route
sql_blocks
artifacts
```

Dashboards must not contain logic.

They declare configuration only.

---

# Generic Publisher Flow

The publisher must maintain a **shared generic workflow**.

Generic responsibilities include:

- compute `generated_at`
- compute `run_id`
- build `manifest`
- write artifacts
- copy artifacts to `current/`

Dashboard branches must only:

- execute SQL
- assemble artifact payloads
- validate artifacts

Example pattern:

```
if dashboard == "dlq_operations":
    # assemble artifacts

elif dashboard == "pipeline_health":
    # assemble artifacts
```

Shared logic must remain **outside dashboard branches**.

---

# Run History Architecture

Artifacts must support reproducibility.

Structure:

```
artifacts/
  runs/
    <run_id>/
      <dashboard>/

  current/
    <dashboard>/
```

Rules:

- `runs/` stores immutable history
- `current/` stores latest artifacts
- dashboards always read from `current/`

---

# UI Design Guardrails

The portal must reuse shared components.

Shared components include:

```
HealthBanner
KpiCard
ExceptionsTable
TrendChart
```

Dashboards should compose these components rather than creating duplicates.

Example:

```
<KpiCard label="Active Sites" value={summary.active_sites_last_24h} />
```

Avoid duplicating layout logic.

---

# Configuration Driven Behavior

System behavior must be driven by configuration.

Examples:

- dashboard SQL blocks
- artifact lists
- portal routes

Configuration must live in:

```
dashboards/<dashboard>/dashboard.json
```

Hardcoding behavior in the publisher or portal should be avoided.

---

# Backward Compatibility

Changes must preserve existing dashboards.

When modifying publisher logic:

- existing dashboards must continue working
- existing artifact schemas must remain valid

Breaking changes require:

```
schema_version increment
migration plan
```

---

# Anti-Patterns to Avoid

## Metric Logic in UI

Bad:

```
const failureRate = failures / total
```

Metrics must be computed in SQL.

---

## SQL Embedded in Portal

Bad:

```
fetch('/query?sql=...')
```

SQL belongs in `sql/athena_views.sql`.

---

## Artifact Schema Drift

Bad:

```
adding fields without updating validator
```

All schema changes require validator updates.

---

## Hidden Publisher Refactors

Bad:

```
while implementing feature X we reorganized the publisher
```

Refactors must be explicit and planned.

---

# Extension Guidelines

When adding features:

1. Prefer configuration over code
2. Reuse existing components
3. Maintain artifact contracts
4. Preserve generic publisher flow
5. Avoid cross-layer coupling

---

# Architectural Goals

The architecture is designed to achieve:

- reproducible analytics
- artifact-driven data contracts
- modular dashboards
- scalable platform growth
- clean separation of concerns

Maintaining these guardrails ensures the platform remains maintainable as features expand.

