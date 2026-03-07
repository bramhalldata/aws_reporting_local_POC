# CLAUDE.md

## Purpose

This repository implements a cloud-native **client reporting and data products platform**.

Claude is used to assist development, but **must follow the architecture defined in the documentation**.

Primary reference documents:

- docs/claude-startup-guide.md
- docs/architecture.md
- docs/json-contracts.md
- docs/athena-views.md
- docs/publisher-runbook.md

Always read relevant documentation before making architectural changes.

---

# Architecture Overview

The platform produces deterministic reporting artifacts from curated analytics data.

Core pipeline:

Operational Systems  
→ ETL Pipelines  
→ Parquet Gold Tables  
→ Athena Reporting Views  
→ Publisher  
→ JSON Artifacts (S3)  
→ CloudFront  
→ React Portal

---

# Core Architecture Rules

Claude must follow these rules.

## 1. Athena Defines Metrics

All reporting metrics originate in **Athena views**.

Do NOT compute metrics in:

- Python publisher logic
- React components
- AI-generated code

Publisher code may assemble results but must not redefine metric logic.

---

## 2. Parquet Is the Analytical Storage Format

All curated reporting data must exist as **Parquet datasets** in S3.

ETL pipelines are responsible for producing these datasets.

Publisher reads from Athena queries that reference these datasets.

---

## 3. Publisher Generates Deterministic Artifacts

The publisher service:

- queries Athena
- assembles artifact data
- validates schemas
- writes JSON artifacts to S3
- publishes versioned outputs

Publisher output must be:

- deterministic
- restart-safe
- auditable

AI must not generate reporting metrics.

---

## 4. JSON Artifacts Are the Delivery Contract

JSON artifacts are the **stable interface between backend and portal**.

Examples:

- summary.json
- trend_30d.json
- top_sites.json
- exceptions.json
- downloads.json
- manifest.json

Schema changes require updates to:

- docs/json-contracts.md
- schema validators
- automated tests

---

## 5. Portal Is Presentation Only

The React portal:

- loads artifact JSON
- renders dashboards
- displays health and freshness

The portal must NOT:

- compute metrics
- query operational systems
- replicate Athena logic

All metrics must come from artifacts.

---

## 6. AI Is an Interpretation Layer

AI-generated outputs are optional and must not alter metrics.

Allowed AI artifacts:

- insights.json
- anomalies.json

AI may analyze artifact outputs but cannot modify source-of-truth values.

---

# Data Sources

Publisher may read from the following systems.

## Athena (Primary Reporting Source)

Athena provides:

- KPI metrics
- aggregates
- trend calculations
- site rollups

Athena queries should reference **Parquet gold tables**.

---

## MySQL (Configuration + Metadata)

MySQL is used for:

- client configuration
- dashboard enablement
- feature flags
- metadata mappings
- audit records

This data is operational, not analytical.

---

## OpenSearch (Diagnostics)

OpenSearch provides:

- error aggregations
- diagnostic summaries
- troubleshooting context

This data supports operational insight but is not the reporting backbone.

---

# Layer Ownership

Each system layer has a defined responsibility.

| Layer | Responsibility |
|------|---------------|
| ETL | ingest and normalize data |
| Parquet | store curated datasets |
| Athena | define reporting metrics |
| Publisher | assemble artifacts |
| Portal | render artifacts |

Logic must live in the layer that owns it.

---

# Multi-Client Architecture

The platform supports **multiple clients without custom code**.

Core principle:

shared code + configuration + client-scoped data + per-client deployment

Each client environment runs the same platform stack:

ETL → Parquet → Athena → Publisher → Artifacts

Client differences are handled through:

- configuration
- infrastructure
- deployment parameters

Never fork code for individual clients unless explicitly approved.

---

# Development Workflow


Local development may use DuckDB as a stand-in for Athena.
The logical architecture must remain the same.


When implementing changes:

1. Read relevant documentation.
2. Identify impacted layers.
3. Propose file changes before implementing.
4. Implement in small steps.
5. Add or update tests.
6. Update documentation if contracts change.

Always prefer minimal, focused changes.

---

# Engineering Standards

Follow these practices:

- avoid duplicating metric logic
- keep metrics centralized in Athena
- keep artifacts deterministic
- prefer configuration over code changes
- maintain schema validation
- write tests for new logic
- update documentation when contracts change

---

# CI Requirements

Pull requests must pass CI before merging.

Minimum checks:

- Python tests
- schema validation
- portal build
- contract validation

CI failures must be resolved before merging.

---

# When Unsure

If requirements appear to violate architecture rules:

1. Stop implementation.
2. Explain the conflict.
3. Propose alternatives aligned with the architecture.

Architecture integrity takes precedence over feature speed.
