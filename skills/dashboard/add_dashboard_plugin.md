# Skill: Add Dashboard Plugin

## Purpose

This skill defines the standard process for adding a new dashboard to the platform using the dashboard plugin architecture.

Dashboards must be added in a consistent, modular way so that the platform remains scalable and maintainable as more dashboards are introduced.

This skill ensures that every dashboard:

- follows the plugin model
- declares configuration clearly
- produces validated artifacts
- integrates with the portal
- preserves the platform architecture

---

# Dashboard Architecture Overview

Dashboards are **plugins** that consist of four components:

1. Dashboard configuration
2. SQL metrics
3. Publisher artifact assembly
4. Portal view

Architecture flow:

```
SQL Metrics
   ↓
Publisher executes SQL
   ↓
Artifacts generated
   ↓
Portal reads artifacts
   ↓
Dashboard renders
```

Each layer has a defined responsibility.

---

# Step 1 — Create Dashboard Configuration

Create a configuration file:

```
dashboards/<dashboard_id>/dashboard.json
```

Example:

```
dashboards/pipeline_health/dashboard.json
```

Example configuration:

```
{
  "dashboard_id": "pipeline_health",
  "title": "Pipeline Health",
  "description": "Operational indicators for the CCD pipeline.",
  "portal_route": "/pipeline_health",
  "sql_blocks": [
    "pipeline_docs_24h",
    "pipeline_active_sites_24h",
    "pipeline_latest_event",
    "pipeline_failures_by_type_24h"
  ],
  "artifacts": [
    "summary.json",
    "failure_types.json"
  ]
}
```

Rules:

- configuration declares behavior
- configuration must not contain logic
- artifact list must match publisher output

---

# Step 2 — Add SQL Blocks

SQL metrics must be defined in:

```
sql/athena_views.sql
```

Each SQL block must follow the naming pattern:

```
-- [block_name]
SQL QUERY
-- [end]
```

Example:

```
-- [pipeline_docs_24h]
SELECT COUNT(DISTINCT document_id) AS total_documents
FROM ccd_failures
WHERE timestamp >= TIMESTAMPTZ '{report_ts}' - INTERVAL 24 HOURS
  AND timestamp <= TIMESTAMPTZ '{report_ts}';
-- [end]
```

Rules:

- SQL computes metrics
- SQL must not depend on portal logic
- SQL block names must match configuration

---

# Step 3 — Add Artifact Validators

Each artifact requires a validator.

Location:

```
src/publisher/validators/
```

Example files:

```
pipeline_health_summary_schema.py
pipeline_health_failure_types_schema.py
```

Validators must:

- define schema
- enforce required fields
- reject unknown fields

Example:

```
PIPELINE_HEALTH_SUMMARY_SCHEMA = {
  "type": "object",
  "required": [
    "schema_version",
    "generated_at",
    "report_ts",
    "total_documents_last_24h"
  ],
  "additionalProperties": False
}
```

Validators ensure artifact contracts remain stable.

---

# Step 4 — Add Publisher Assembly Logic

Modify:

```
src/publisher/main.py
```

Add a dashboard branch:

```
elif dashboard == "pipeline_health":
```

Responsibilities of this branch:

- execute SQL blocks
- assemble artifact payloads
- validate artifacts

Example:

```
ph_summary = {
  "schema_version": SCHEMA_VERSION,
  "generated_at": generated_at,
  "report_ts": report_ts,
  "total_documents_last_24h": int(total_docs)
}
```

Return artifacts via:

```
artifacts_to_write = {
  "summary.json": ph_summary
}
```

Important rule:

Dashboard branches **must not handle**:

- run_id
- manifest
- artifact write loops
- copying artifacts

These remain in the generic publisher flow.

---

# Step 5 — Create Portal Dashboard View

Create:

```
portal/src/dashboards/<dashboard_id>/<DashboardName>.jsx
```

Example:

```
portal/src/dashboards/pipeline_health/PipelineHealth.jsx
```

The dashboard must:

- fetch artifacts
- render KPIs
- render tables or charts

Example artifact fetch:

```
fetch(`/${DASHBOARD}/summary.json`)
```

Dashboards must reuse shared components.

Examples:

```
HealthBanner
KpiCard
ExceptionsTable
TrendChart
```

Avoid duplicating UI components.

---

# Step 6 — Register Dashboard

Add dashboard to:

```
portal/src/dashboards/index.js
```

Example:

```
import PipelineHealth from "./pipeline_health/PipelineHealth.jsx";

export const dashboards = {
  dlq_operations: DlqOperations,
  pipeline_health: PipelineHealth
};
```

Routes are automatically generated from this registry.

---

# Step 7 — Verify Dashboard

Run publisher:

```
publisher run --env local --dashboard <dashboard_id>
```

Expected artifacts:

```
artifacts/current/<dashboard_id>/
```

Example:

```
summary.json
failure_types.json
manifest.json
```

Start portal:

```
npm run dev
```

Open route:

```
/<dashboard_id>
```

Verify:

- dashboard loads
- KPIs render
- tables populate
- no console errors

---

# Negative Testing

Test failure scenarios.

Example:

```
publisher run --env local --dashboard nonexistent
```

Expected:

```
Dashboard config not found
```

Remove SQL block:

Expected:

```
Missing required SQL blocks
```

Remove artifact from config:

Expected portal error explaining missing artifact.

---

# Best Practices

When creating dashboards:

- keep dashboards focused
- reuse components
- keep metrics in SQL
- validate every artifact
- keep publisher logic minimal

Avoid creating dashboards that perform computation in the UI.

---

# Extension Guidelines

Future dashboards should follow the same pattern.

Steps required:

1. Create dashboard config
2. Add SQL blocks
3. Add validators
4. Add publisher branch
5. Create portal view
6. Register dashboard
7. Verify artifacts and UI

Following this process ensures the platform remains modular and scalable.

