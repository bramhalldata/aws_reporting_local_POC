# Artifact Storage Layout

This document describes the artifact directory structure produced by the publisher
and consumed by the portal.

---

## Directory Tree

```
artifacts/
  {client_id}/
    {env_id}/
      current/
        {dashboard_id}/
          manifest.json
          summary.json
          ... (dashboard-specific artifacts)
        run_history.json
      runs/
        {run_id}/
          {dashboard_id}/
            manifest.json
            summary.json
            ...
```

---

## Roles

| Path | Purpose |
|------|---------|
| `{client}/{env}/current/{dashboard}/` | Latest artifacts for active portal consumption. Overwritten on every publisher run. |
| `{client}/{env}/current/run_history.json` | Index of all historical runs for this client/env pair. Rebuilt on every publisher run. |
| `{client}/{env}/runs/{run_id}/{dashboard}/` | Immutable historical snapshot for a specific run. Never overwritten. |

---

## Concrete Example (default/local)

```
artifacts/
  default/
    local/
      current/
        run_history.json
        dlq_operations/
          manifest.json
          summary.json
          trend_30d.json
          top_sites.json
          exceptions.json
        pipeline_health/
          manifest.json
          summary.json
          failure_types.json
      runs/
        20260309T140000Z/
          dlq_operations/
            manifest.json
            summary.json
            trend_30d.json
            top_sites.json
            exceptions.json
          pipeline_health/
            manifest.json
            summary.json
            failure_types.json
        20260309T180000Z/
          dlq_operations/ ...
```

## Concrete Example (contexture/prod)

```
artifacts/
  contexture/
    prod/
      current/
        run_history.json
        sent_to_udm/
          manifest.json
          summary.json
          region_summary.json
          trend_30d.json
          lifetime_detail.json
          recent_detail_30d.json
      runs/
        20260317T185142Z/
          sent_to_udm/
            manifest.json
            summary.json
            region_summary.json
            trend_30d.json
            lifetime_detail.json
            recent_detail_30d.json
```

---

## Key Principles

**Isolation**
Each `{client}/{env}` pair has an independent artifact tree. There is no cross-contamination
between clients or environments. `run_history.json` for `contexture/prod` contains only
`contexture/prod` runs.

**`current/` is mutable**
Overwritten on every successful publisher run. The portal reads from `current/` for live
dashboard data.

**`runs/` is immutable**
Historical run artifacts are never overwritten. The directory grows monotonically with
each publisher invocation. `RunDetail` in the portal deep-links directly to run artifacts.

**Publisher owns paths**
`artifact.path` in `run_history.json` is computed by the publisher as:
```
{client_id}/{env_id}/runs/{run_id}/{dashboard_id}/{filename}
```
The portal never constructs artifact paths — it uses `artifact.path` directly via
`href={/${artifact.path}}`.

**No infrastructure changes required for new clients/environments**
`vite.config.js` sets `publicDir: ../artifacts`, which serves the entire `artifacts/` tree
from the web root. Adding a new client or environment requires only running the publisher
with the appropriate `--client` and `--env` flags.

---

## Artifact Path in run_history.json

Each run entry's `artifacts` array contains fully-scoped path objects:

```json
{
  "name": "summary.json",
  "type": "summary",
  "path": "default/local/runs/20260309T140000Z/dlq_operations/summary.json"
}
```

Portal artifact link: `href={/${artifact.path}}` → `/default/local/runs/.../summary.json`

See [../json-contracts.md](../json-contracts.md) for the complete `run_history.json` schema.
