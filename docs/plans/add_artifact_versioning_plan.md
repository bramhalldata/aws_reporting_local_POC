# Plan: Add Artifact Versioning / History

## Context

The publisher previously wrote all artifacts to a single flat `artifacts/` directory,
silently overwriting the previous run on every publish. This plan introduces a versioned
run folder per publish alongside a stable `artifacts/current/` location so the portal
continues to work without architectural changes.

---

## Architecture Compliance

| Requirement | How it is met |
|-------------|---------------|
| Metrics stay in SQL | No SQL changes |
| Publisher deterministic | `run_id` derived from existing `report_ts`; no new randomness |
| Portal presentation-only | `App.jsx` unchanged; only `vite.config.js` `publicDir` updated |
| Artifact schemas valid | manifest schema updated to add `run_id`; all other schemas unchanged |
| Manifest is source of truth | `manifest.json` exists in both run folder and `current/` |
| Local POC still works | Same CLI invocation; portal loads from `current/` |

---

## Impacted Layers

| Layer | Change |
|-------|--------|
| Publisher | Write to `runs/<run_id>/`; copy to `current/`; add `run_id` to manifest |
| Manifest schema | Add `run_id` field; bump `SCHEMA_VERSION` to `1.1.0` |
| Portal (Vite config) | `publicDir: "../artifacts/current"` |

---

## Files Changed

| File | Change |
|------|--------|
| `src/publisher/main.py` | `shutil` import; new path constants; `run_id` derivation; write to run folder; copy to `current/`; add `run_id` to manifest; bump `SCHEMA_VERSION` to `1.1.0` |
| `src/publisher/validators/manifest_schema.py` | Add `run_id` to `properties` + `required`; bump `SCHEMA_VERSION` constant to `1.1.0` |
| `portal/vite.config.js` | `publicDir: "../artifacts/current"` |

---

## Directory Structure

```
artifacts/
  runs/
    20260307T224959Z/      ← versioned run folder; immutable after write
      summary.json
      trend_30d.json
      top_sites.json
      exceptions.json
      manifest.json
    20260308T101530Z/      ← next run
      ...
  current/                 ← always reflects the latest run; portal reads here
    summary.json
    trend_30d.json
    top_sites.json
    exceptions.json
    manifest.json
```

Old flat `artifacts/*.json` files are not deleted but are no longer updated.

---

## run_id Format

Derived from `report_ts` by stripping non-alphanumeric characters:

```
report_ts  : "2026-03-07T22:49:59Z"
run_id     : "20260307T224959Z"
```

- No new dependencies (`re` already imported in `main.py`)
- Lexicographically sortable — newest run = last alphabetically
- Filesystem-safe on Windows and Linux
- Anchored to the same timestamp that scopes all SQL metric windows

---

## Write Strategy

1. `os.makedirs(run_dir, exist_ok=True)`
2. Write all 5 artifacts to `run_dir/` — payload files first, `manifest.json` last
3. `os.makedirs(ARTIFACTS_CURRENT_DIR, exist_ok=True)`
4. `shutil.copy2` each file from `run_dir/` → `current/`

Writing to the run folder first ensures the run record is complete before `current/`
is updated. A mid-run failure leaves the run folder partial but `current/` unchanged.

---

## Manifest Schema Change

`manifest.json` now includes `run_id`:

```json
{
  "schema_version": "1.1.0",
  "run_id": "20260307T224959Z",
  "generated_at": "2026-03-07T22:49:59+00:00",
  "report_ts": "2026-03-07T22:49:59Z",
  "status": "SUCCESS",
  "artifacts": ["summary.json", "trend_30d.json", "top_sites.json", "exceptions.json"]
}
```

`manifest_schema.py` has `additionalProperties: False`; `run_id` was added to both
`properties` and `required`. `SCHEMA_VERSION` bumped from `1.0.0` → `1.1.0` in both
`manifest_schema.py` and `main.py`.

---

## Portal Change

`vite.config.js` `publicDir` changed from `"../artifacts"` to `"../artifacts/current"`.

The portal fetches `/manifest.json`, `/summary.json`, etc. — these URLs are unchanged.
No changes to `App.jsx` or any portal component.

---

## Backward Compatibility

- Old flat `artifacts/*.json` remain on disk; they are simply no longer written to.
- `python src/publisher/main.py` (legacy) still works; same output; same CLI shape.
- `publisher run --env local --dashboard dlq_operations` unchanged.

---

## Retention / Cleanup

No automatic cleanup. Run folders accumulate in `artifacts/runs/`. For local development
this is acceptable.

Recommended `.gitignore` entries (if not already present):

```
artifacts/runs/
artifacts/current/
```

---

## Future Improvement: Atomic current/ Updates

The current implementation copies files one by one, which could expose a reader to a
mixed state during the copy window. For local POC this risk is negligible.

A future hardening pass can make `current/` atomic:

1. Write all files to a temporary sibling: `artifacts/current_new/`
2. Rename `current_new/` → `current/` using `os.replace()` (atomic on POSIX; near-atomic
   on Windows via a delete-then-rename fallback)

This mirrors the production S3 pattern: upload to a versioned prefix, update a pointer
object last.

---

## Verification Steps

### Positive tests

1. `publisher run --env local --dashboard dlq_operations`
   - `artifacts/runs/<run_id>/` created with 5 files
   - `artifacts/current/` created/updated with 5 files
   - `artifacts/current/manifest.json` contains `"run_id": "<run_id>"` and `"schema_version": "1.1.0"`
   - `cd portal && npm run dev` — portal loads and displays data normally

2. Run publisher a second time (wait one second for a different timestamp)
   - `artifacts/runs/` contains two subfolders
   - `artifacts/current/` reflects the newest run
   - First run folder is unchanged

3. `cd portal && npm run build` — exits 0

### Negative tests

4. Delete `artifacts/current/` manually → run publisher → `current/` is recreated
5. Corrupt a file in an old run folder → `current/` is unaffected
6. Inspect old flat `artifacts/manifest.json` — `run_id` field absent; `generated_at`
   pre-dates the versioning change (confirms old files are not being updated)
7. Schema validation:
   ```python
   import json
   from src.publisher.validators import manifest_schema
   with open("artifacts/current/manifest.json") as f:
       manifest_schema.validate(json.load(f))  # must not raise
   ```
