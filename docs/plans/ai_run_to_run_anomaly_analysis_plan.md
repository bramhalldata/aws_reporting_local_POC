# AI Run-to-Run Anomaly Analysis — Implementation Plan

**Feature:** AI Run-to-Run Anomaly Analysis
**Output artifact:** `docs/plans/ai_run_to_run_anomaly_analysis_plan.md`
**Date:** 2026-03-10
**Status:** Draft — pending review

---

## 1. Feature Summary

AI Run-to-Run Anomaly Analysis adds a natural-language explanation layer on top of
the existing deterministic run comparison feature. When a user views two runs side
by side on the Run Comparison page, they can click "Analyze with AI" to receive a
short structured interpretation of the already-computed deltas.

The feature answers questions like:

- What changed between these two runs?
- Did failures go up or down significantly?
- Which sites or failure types changed the most?
- Are there patterns that look like anomalies worth investigating?

**What this feature is NOT:**

- It does not replace the existing deterministic comparison engine (`runDiff.js`).
- It does not allow free-form chat over artifact JSON.
- It does not compare across different dashboards, clients, or environments.
- It does not autonomously scan for issues without user interaction.

The architecture requirement is explicit: **deterministic diff first, LLM explanation second.**
The LLM sees only the structured output of the comparison — never raw artifact files.

---

## 2. Core Architecture

### Two-stage pipeline

```
Stage 1: Deterministic diff (existing)
  RunCompare.jsx
  └── COMPARE_WHITELIST (runDiff.js)
        ├── compareSummary()   → [{field, base, target, delta}]
        ├── compareByKeyCount() → {added, removed, changed, unchanged}
        └── ...per artifact type

Stage 2: LLM explanation (new)
  anomalyPayload.js
  └── buildAnomalyPayload(compareResults)
        → normalized JSON payload (compact, schema-constrained)

  ollamaClient.js
  └── callOllamaAnalysis(payload)
        → {summary, notable_changes, likely_anomalies, caveats}

  AnomalySummary.jsx
  └── renders structured LLM output with disclaimer
```

**Why this is safer than sending raw artifacts to the LLM:**

1. **Token budget:** Raw artifacts can be large. The normalized payload is O(dozens of fields) regardless of artifact size.
2. **Determinism preserved:** The numbers shown in the comparison UI are identical to the numbers the LLM sees. There is no re-computation by the LLM.
3. **Prompt stability:** A consistent, schema-bounded payload produces more consistent LLM output than variable-length raw JSON.
4. **No hallucination of metrics:** The LLM cannot invent numbers; it can only interpret the already-computed deltas.
5. **Testability:** `buildAnomalyPayload()` is a pure function testable without any LLM.

The deterministic comparison remains the source of truth at all times. The AI panel is additive and optional.

---

## 3. Scope of Phase 1

Phase 1 is intentionally minimal:

| In Phase 1 | Out of Phase 1 |
|-----------|----------------|
| Same dashboard, same client/env | Cross-dashboard, cross-scope |
| Whitelisted artifact types only (summary, top_sites, exceptions, failure_types) | trend_30d and future types |
| On-demand trigger (button on Run Comparison page) | Precomputed/auto-triggered |
| Local Ollama inference | Cloud API inference |
| Structured 4-field JSON output | Rich multi-section report |
| Display in AnomalySummary panel | Separate page / saved history |
| Browser → Ollama direct call | Dedicated backend service |

The smallest useful Phase 1 is: user presses a button on the Run Comparison page,
gets a short structured explanation within ~10 seconds. If Ollama is not running, the
button shows a clear error. Everything else degrades gracefully.

---

## 4. Input Contract to the LLM

`buildAnomalyPayload()` in `portal/src/utils/anomalyPayload.js` takes the already-computed
diff results from `RunCompare.jsx` and produces a compact normalized payload.

**Payload schema:**

```json
{
  "client_id": "default",
  "env_id": "local",
  "dashboard_id": "dlq_operations",
  "base_run_id": "20260309T175159Z",
  "target_run_id": "20260310T181111Z",
  "summary_deltas": [
    { "field": "failures_last_24h", "base": 42, "target": 67, "delta": 25 },
    { "field": "failures_last_7d",  "base": 180, "target": 220, "delta": 40 }
  ],
  "top_sites_diff": {
    "added":     [{ "key": "site_new", "count": 12 }],
    "removed":   [{ "key": "site_old", "count": 3 }],
    "changed":   [{ "key": "site_x", "base": 5, "target": 30, "delta": 25 }],
    "unchanged": []
  },
  "exceptions_diff": {
    "added": [...], "removed": [...], "changed": [...], "unchanged": [...]
  },
  "failure_types_diff": {
    "added": [...], "removed": [...], "changed": [...], "unchanged": [...]
  },
  "missing_artifacts": ["trend_30d"],
  "artifacts_not_in_whitelist": []
}
```

**Why this payload instead of raw artifacts:**

- Excludes metadata fields (`generated_at`, `schema_version`, `report_ts`) that add noise
- Filters to only changed/added/removed entries — unchanged items trimmed from context
- Provides both absolute values and deltas (LLM doesn't need to subtract)
- `missing_artifacts` communicates data gaps honestly
- Total payload size is typically < 2 KB for current dashboards

The payload structure mirrors the existing `COMPARE_WHITELIST` in `runDiff.js` exactly —
artifact types not in the whitelist simply don't appear. No new comparison logic is needed.

---

## 5. Output Contract from the LLM

The LLM is instructed to return **structured JSON** with exactly four fields:

```json
{
  "summary": "Failures increased 59% over the compared period. Site X shows the largest spike. A new failure category appeared.",
  "notable_changes": [
    "failures_last_24h up +25 (42 → 67)",
    "site_x failures up +25 (5 → 30)",
    "NEW failure type: connection_timeout"
  ],
  "likely_anomalies": [
    "site_x spike (5x increase) is disproportionate — possible infrastructure issue or data gap"
  ],
  "caveats": "AI-generated interpretation. Verify findings against source data and pipeline logs."
}
```

**Why structured JSON instead of free-form prose:**

- The portal can render each field distinctly (summary card, bulleted notable_changes, anomaly list)
- JSON parsing failure is detectable — falls back gracefully to raw text display
- Prevents the LLM from producing verbose paragraphs that obscure the key signal
- Each field has a bounded purpose; the model is less likely to hallucinate when constrained

**Fallback:** If the LLM returns malformed JSON or plain text, the component displays
the raw response text in a `<pre>` block with a "structured output unavailable" warning.
The deterministic comparison is never affected.

---

## 6. Ollama Integration Strategy

### Evaluation: Local Ollama vs. Cloud API

| Criterion | Local Ollama | Cloud API (e.g., Claude / OpenAI) |
|-----------|-------------|-----------------------------------|
| **Setup** | Already installed on dev machine | Requires API key, network access |
| **Latency** | 3–15s (3B–7B model) | 1–5s typically |
| **Cost** | Free | Per-token cost |
| **Data privacy** | All data stays local | Data sent to third party |
| **Offline use** | Yes | No |
| **Production feasibility** | No (won't be on CloudFront server) | Yes |
| **Phase 1 effort** | Minimal (browser fetch to localhost) | Low (API key + client config) |

**Recommendation: Local Ollama for Phase 1.**

The payload is small internal analytics data. Local inference is free, private, and
sufficient for developer-facing analysis at POC scale.

### Where inference runs

**Browser → Ollama localhost API directly.**

Ollama exposes a REST API at `http://localhost:11434` with CORS headers that allow
same-machine requests. The portal is served from `localhost:5173` (Vite dev server).
A browser `fetch()` from `localhost:5173` to `localhost:11434` succeeds without
a backend proxy.

This means:
- No new server process needed
- No publisher changes
- No Vite proxy configuration required (both are localhost)
- The feature is purely browser-side JavaScript

### Ollama API call

```js
POST http://localhost:11434/api/generate
Content-Type: application/json

{
  "model": "llama3.2",    // configurable constant
  "prompt": "<system + payload>",
  "format": "json",       // instructs Ollama to return valid JSON
  "stream": false,
  "options": { "temperature": 0.1 }  // low temp for consistent structured output
}
```

The `format: "json"` parameter constrains Ollama to return valid JSON. Combined
with a structured output schema in the prompt, this reliably produces parseable output.

### Model recommendation

Do not hardcode model name as a magic string — export `OLLAMA_MODEL` from a
config constant in `ollamaClient.js`. Default: `"llama3.2"` (3B, fast, widely
available). Users can change the constant without modifying component code.

Models that work well for structured JSON summarization at local scale:
- `llama3.2` (3B) — fast, 2–5s on most hardware
- `llama3.1:8b` — higher quality, 5–15s
- `mistral` (7B) — good JSON compliance

The plan does not commit to a specific model version — `llama3.2` is a reasonable
default for Phase 1 given speed requirements.

### Production consideration

In a deployed environment (CloudFront + S3), Ollama is not available. The
`AnomalySummary` component must detect the "Ollama not running" error and display
a message like: "Local AI analysis requires Ollama running on this machine."
This is a clear, non-disruptive degradation — the comparison tables are unaffected.

Phase 2 can add an optional cloud inference fallback (Claude API or similar) for
production use. Phase 1 explicitly defers this.

---

## 7. Trigger Model

**Recommendation: On-demand from Run Comparison page (button click).**

Rationale:

| Option | Assessment |
|--------|-----------|
| On-demand button (chosen) | User controls when inference runs; no latency impact on comparison load; no wasted inference on uninteresting diffs |
| Precomputed during publisher run | Would require publisher → Ollama dependency; adds 5–15s to every run; inference at publish time ≠ inference at analysis time |
| Precomputed during bootstrap | Same concerns as above; multiplied by N dashboards |
| Separate CLI utility | Useful for future batch analysis; not needed for Phase 1 |

**UI flow:**

1. User navigates to Run Comparison page — deterministic comparison loads as today
2. `AnomalySummary` panel renders at the bottom with "Analyze with AI" button and idle state
3. User clicks "Analyze with AI"
4. Panel transitions to loading state (spinner + "Calling local AI...")
5. On success: structured analysis displayed
6. On error: error message displayed with troubleshooting hint

The button does not auto-trigger on page load. This is intentional: analysis takes
3–15s, and users may not want it for every comparison.

---

## 8. UI Integration

**Recommendation: Collapsible panel at the bottom of the Run Comparison page.**

The Run Comparison page already shows:
- Run metadata cards (base vs target)
- Per-artifact comparison tables

The `AnomalySummary` panel is added below all comparison tables as a new card section,
consistent with the existing card styling. It contains:

```
┌─────────────────────────────────────────────────────────┐
│  AI ANOMALY ANALYSIS                     [Analyze ▶]    │
│                                                         │
│  (idle)  Click "Analyze" to generate an AI explanation  │
│          of the differences above. Requires Ollama      │
│          running locally.                               │
└─────────────────────────────────────────────────────────┘
```

After successful analysis:

```
┌─────────────────────────────────────────────────────────┐
│  AI ANOMALY ANALYSIS                   [Re-analyze ↺]   │
├─────────────────────────────────────────────────────────┤
│  Summary                                                │
│  Failures increased 59% over the compared period...     │
│                                                         │
│  Notable Changes                                        │
│  • failures_last_24h up +25 (42 → 67)                  │
│  • site_x failures up +25 (5 → 30)                     │
│  • NEW failure type: connection_timeout                 │
│                                                         │
│  Likely Anomalies                                       │
│  • site_x spike (5x increase)...                       │
│                                                         │
│  ⚠ AI-generated interpretation. Verify with source data.│
└─────────────────────────────────────────────────────────┘
```

The panel uses existing `card`, `cardTitle`, and `theme` styles for visual consistency.
No new styles library needed.

---

## 9. Failure Handling

| Scenario | Behavior |
|----------|---------|
| Ollama not running | Catch `fetch` error → "Local AI unavailable. Ensure Ollama is running at http://localhost:11434. Start with: `ollama serve`" |
| Model not pulled | Ollama returns 404 / error body → display model name and "Run: `ollama pull llama3.2`" |
| Inference timeout (> 30s) | `AbortController` signal cancels fetch → "Analysis timed out. Try a smaller model or re-analyze." |
| LLM returns malformed JSON | `JSON.parse` catch → display raw text response in `<pre>` block with "Structured output unavailable" note |
| LLM returns empty response | Check `response.length === 0` → "Model returned empty response. Try re-analyzing." |
| Deterministic comparison fails | AI panel never loads (RunCompare renders an error before AnomalySummary mounts) |
| No whitelisted artifacts in common | `buildAnomalyPayload()` returns a payload with all diff objects empty → LLM receives this honestly; AnomalySummary may show "No comparable data" before calling Ollama |

The deterministic comparison is never blocked or degraded by AI failure. The AI panel
is a separate, isolated card rendered after all comparison data is already displayed.

---

## 10. Privacy / Safety / Reliability Considerations

**Local inference benefits:**

- Analytics data (failure counts, site names, error types) stays on the developer machine
- No API keys to manage
- Works fully offline
- Free — no per-token cost during iterative development

**Deterministic comparison remains source of truth:**

All numbers displayed in the comparison tables come from `runDiff.js` computations.
The LLM receives these already-computed numbers; it cannot change them. If the LLM
misinterprets a delta, the user can see the correct delta directly in the table above.

**AI output must be labeled as interpretive:**

The `caveats` field of the LLM output is always displayed. The panel header includes
a persistent "AI-generated" label regardless of the LLM's confidence. The feature
should not use language like "This analysis is accurate" or display a confidence score
as if it validates correctness.

**Avoiding overconfident output:**

The prompt instructs the model: "Do not speculate about root causes. Report only what
the data shows." The `temperature: 0.1` setting reduces hallucination risk for
factual summarization tasks.

---

## 11. Files to Create / Modify

### Create

| File | Purpose |
|------|---------|
| `portal/src/utils/anomalyPayload.js` | Pure function: transform compareResults → normalized LLM input payload |
| `portal/src/utils/ollamaClient.js` | Ollama API client: build prompt, call API, parse response, handle errors |
| `portal/src/components/AnomalySummary.jsx` | UI panel: idle / loading / success / error states; renders structured output |

### Modify

| File | Change |
|------|--------|
| `portal/src/pages/RunCompare.jsx` | Add `<AnomalySummary>` at the bottom of the comparison page; pass `compareResults`, `client`, `env`, `dashboard`, `baseRunId`, `targetRunId` as props |

### No changes to

- `portal/src/utils/runDiff.js` — deterministic comparison unchanged
- `portal/src/utils/runDiff.test.js` — existing 17 tests unchanged
- `src/publisher/` — no publisher changes in Phase 1
- All other portal files
- `artifacts/` tree — no new artifact types in Phase 1

---

## 12. Verification Plan

### Unit tests

```js
// portal/src/utils/anomalyPayload.test.js

// 1. Full payload generation
test("buildAnomalyPayload includes all whitelisted diff sections", ...)
test("buildAnomalyPayload trims unchanged entries from top-level fields", ...)
test("buildAnomalyPayload lists missing artifacts correctly", ...)
test("buildAnomalyPayload handles null/empty compareResults gracefully", ...)
```

### Manual / integration tests

```bash
# 1. Existing tests still pass
cd portal && npm test
# Expected: 32 + N new anomalyPayload tests pass

# 2. Build passes
cd portal && npm run build

# 3. Deterministic comparison works without Ollama
# - Stop Ollama (or do not start it)
# - Navigate to a Run Comparison page
# - Comparison tables render as today
# - AnomalySummary panel shows idle state with button
# - Click "Analyze with AI" → shows "Ollama unavailable" error
# - All comparison tables unaffected

# 4. Successful analysis generation
# - Start Ollama: ollama serve && ollama pull llama3.2
# - Navigate to Run Comparison page with two real runs
# - Click "Analyze with AI"
# - Panel transitions to loading, then shows 4-field structured output
# - summary, notable_changes, likely_anomalies, caveats all populated

# 5. Malformed output fallback
# - Temporarily set OLLAMA_MODEL to a model that returns plain text
# - Click "Analyze with AI"
# - Panel shows raw text in <pre> block with "Structured output unavailable" note
# - No crash; comparison tables unaffected

# 6. Timeout fallback
# - Use a very slow/unavailable model (force timeout via AbortController test)
# - Panel shows timeout error after 30s
# - No crash

# 7. Same-scope / same-dashboard enforcement
# - buildAnomalyPayload only called from RunCompare which already enforces
#   same client/env (URL params) and same dashboard (query param)
# - No cross-scope comparison is possible via the UI
```

---

## 13. Non-Goals

| Excluded | Reason |
|----------|--------|
| Replacing deterministic comparison logic | LLM explains the diff; it does not compute it |
| Free-form chat over artifacts | Out of scope; adds attack surface and complexity |
| Cross-dashboard comparison | Incomparable schemas and metrics |
| Cross-client/env analysis | Scope isolation is a core platform principle |
| Cloud-only architecture | Phase 1 is local-first; cloud deferred to Phase 2 |
| Autonomous anomaly scanning | User-triggered only; no background jobs |
| Saved anomaly summaries / history | Phase 2 |
| Precomputed AI artifacts in publisher | Phase 2 |
| Streaming output | Phase 1 uses `stream: false`; streaming deferred |
| Model selection UI | OLLAMA_MODEL constant; no runtime dropdown |

---

## 14. Future Extensions

| Extension | Description |
|-----------|-------------|
| Cloud inference fallback | If Ollama unavailable, offer Claude/OpenAI as optional fallback (requires API key config) |
| Saved anomaly summaries | Write `anomaly_analysis.json` to publisher artifact tree per run pair |
| AI comparison history | List saved analyses on RunHistory page |
| Manifest-driven analysis discovery | Platform manifest could list which run pairs have saved analyses |
| Richer model options | Model selector in developer settings; support for larger local models |
| Publisher precompute | `publisher analyze --base <runId> --target <runId>` CLI command |
| Trend anomaly detection | Extend to `trend_30d` artifact type with time-series summarization |

None of these are in Phase 1.

---

## 15. Review

**See:** `docs/reviews/ai_run_to_run_anomaly_analysis_review.md`
