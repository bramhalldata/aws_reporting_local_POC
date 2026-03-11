# Automated Run Health Classification — Implementation Plan

**Feature:** Automated Run Health Classification
**Output artifact:** `docs/plans/automated_run_health_classification_plan.md`
**Date:** 2026-03-10
**Status:** Draft — pending review

---

## 1. Feature Summary

Automated Run Health Classification adds a deterministic, rules-based health label
to a run comparison. When two runs are compared, the classifier consumes the
already-computed deterministic diff outputs and produces a single authoritative
judgment:

- **Critical** — significant regression or data quality failure
- **Warning** — notable degradation or new failure categories
- **Stable** — no meaningful change between runs
- **Healthy** — meaningful improvement in key metrics
- **Unknown** — insufficient data to classify

This answers: "Does this comparison deserve attention, and how urgently?"

**What this feature is NOT:**

- It does not use the LLM to determine severity. The LLM remains an optional
  explanation layer.
- It does not replace the deterministic comparison tables.
- It does not compute anything from raw artifacts — it reads only the outputs
  of the existing comparison engine.
- It does not send alerts or require external infrastructure.

The classification is deterministic, testable, and explainable by design: every
label is the result of explicit named rules with documented thresholds.

---

## 2. Core Architecture

```
Stage 1: Deterministic diff (existing — unchanged)
  runDiff.js
  ├── compareSummary()            → [{field, base, target, delta}]
  └── compareByKeyCount()         → {added, removed, changed, unchanged}

Stage 2: Health classification (new)
  runHealth.js
  ├── buildHealthInput(comparisons)   → normalized classifier input
  ├── RULES[]                         → array of named rule evaluators
  └── classifyRunHealth(comparisons)  → {classification, severity, reasons, triggered_rules}

Stage 3: Optional AI explanation (existing AnomalySummary — unchanged)
  ollamaClient.js → LLM interpretation of the same diffs
```

**Why deterministic classification is safer than LLM classification:**

1. **Reproducibility:** Given identical comparison outputs, the classifier always
   returns the same result. The LLM may not.
2. **Auditability:** Every `triggered_rules` entry corresponds to named logic in
   `runHealth.js` with explicit thresholds.
3. **Testability:** All rules are pure functions. Every classification can be
   covered by a unit test without mocking.
4. **No hallucination:** The rules cannot invent failure counts or misinterpret
   artifact structure.
5. **Latency:** Classification is synchronous and completes in < 1ms. It is
   available immediately when comparison data loads, with no user action.

The AI explanation (AnomalySummary) is additive to the classification — it
interprets what the rules found, but cannot override the classification label.

---

## 3. Health Model

**Recommended set: 5 states, ordered by attention priority.**

| State | Severity | Meaning |
|-------|----------|---------|
| Unknown | 0 | Insufficient data to classify (missing artifacts, all errors) |
| Healthy | 1 | Meaningful improvement in key failure metrics |
| Stable | 2 | No significant changes — platform operating normally |
| Warning | 3 | Notable degradation or new failure categories appeared |
| Critical | 4 | Large regression, data doubled, or significant new failure types |

**Aggregation rule:** When multiple rules trigger, the highest severity wins.
If a comparison has both a Healthy signal (failures down) and a Warning signal
(new failure type appeared), the result is Warning — degradation signals take
precedence over improvement signals (conservative, safety-first).

**Why 5 states and not fewer:**

- 3-state (Good/Neutral/Bad) loses the distinction between "improved" and "unchanged"
  and between "notable" and "severe" — both distinctions are useful in practice.
- 5 states matches the intuitive mental model operators already use.
- Unknown is necessary when data quality prevents classification — conflating
  Unknown with Stable would mislead.

---

## 4. Input Contract

The classifier takes the `comparisons` array directly from `RunCompare.jsx`.
Internal normalization is hidden inside `runHealth.js`.

**`comparisons` array shape** (already produced by `loadCompare()` in RunCompare):

```js
[
  {
    type:        "summary" | "top_sites" | "exceptions" | "failure_types",
    diffResult:  Array | object | null,   // null if both artifacts not available
    diffError:   string | null,            // non-null if compare() threw
    bFetchError: string | null,
    tFetchError: string | null,
    bArtifact:   object | null,
    tArtifact:   object | null,
  },
  ...
]
```

**Normalized internal shape** (`buildHealthInput(comparisons)` — internal helper):

```js
{
  // From compareSummary() output: [{field, base, target, delta}]
  summaryDeltas: [{field, base, target, delta}],

  // From compareByKeyCount() outputs: {added, removed, changed, unchanged}
  setDiffs: {
    top_sites:     {added, removed, changed, unchanged} | null,
    exceptions:    {added, removed, changed, unchanged} | null,
    failure_types: {added, removed, changed, unchanged} | null,
  },

  // Artifact types where bFetchError || tFetchError || diffError is set
  artifactErrors: string[],

  // Whether any usable comparison data exists at all
  hasUsableData: boolean,
}
```

This normalization is an internal implementation detail. The public API of
`runHealth.js` is `classifyRunHealth(comparisons)`.

---

## 5. Classification Rules

### Rule design

Each rule is a named object with an `evaluate(input)` function returning
`{ triggered, reason }`. Rules are evaluated in sequence; all triggered rules
contribute to the final classification.

```js
{
  id:       "RULE_ID",
  severity: 4,          // 0=Unknown, 1=Healthy, 2=Stable, 3=Warning, 4=Critical
  evaluate: (input) => ({ triggered: boolean, reason: string })
}
```

### Threshold constants (exported, documented)

```js
export const HEALTH_THRESHOLDS = {
  FAILURE_CRITICAL_RATIO:     1.0,  // delta/base > 1.0  → Critical (doubled)
  FAILURE_WARNING_RATIO:      0.25, // delta/base > 0.25 → Warning (25%+ increase)
  FAILURE_HEALTHY_RATIO:     -0.20, // delta/base < -0.20 → Healthy (20%+ reduction)
  NEW_FAILURE_TYPES_CRITICAL: 3,    // >= 3 new types    → Critical
  NEW_FAILURE_TYPES_WARNING:  1,    // >= 1 new type     → Warning
};
```

### Field classification

Failure metric detection uses a name-pattern approach:
- Fields containing `"failure"` in the name → failure metrics (e.g. `failures_last_24h`, `failures_last_7d`)
- All other summary fields → not covered by failure rules in Phase 1

This is explicit, matches the known dashboard schemas, and requires no configuration.

### Rule set (Phase 1 — 7 rules)

**Rules from summary deltas** (applied to each failure-family field):

| Rule ID | Trigger | Severity | Reason template |
|---------|---------|----------|-----------------|
| `CRITICAL_FAILURE_SPIKE` | delta/base > 1.0 | Critical | `"${field} more than doubled (${base} → ${target}, +${delta})"` |
| `WARNING_FAILURE_INCREASE` | 0.25 < delta/base ≤ 1.0 | Warning | `"${field} increased ${pct}% (${base} → ${target})"` |
| `HEALTHY_FAILURE_REDUCTION` | delta/base < -0.20 | Healthy | `"${field} reduced ${pct}% (${base} → ${target})"` |
| `WARNING_FAILURES_APPEARED` | base === 0 AND target > 0 | Warning | `"${field} went from 0 to ${target} (new failures)"` |

**Rules from set-diff results** (applied to `exceptions` and `failure_types` added arrays):

| Rule ID | Trigger | Severity | Reason template |
|---------|---------|----------|-----------------|
| `CRITICAL_MANY_NEW_FAILURE_TYPES` | added.length ≥ 3 | Critical | `"${count} new failure types appeared: ${names}"` |
| `WARNING_NEW_FAILURE_TYPE` | added.length ≥ 1 | Warning | `"${count} new failure type(s): ${names}"` |

**Rules from artifact errors:**

| Rule ID | Trigger | Severity | Reason template |
|---------|---------|----------|-----------------|
| `WARNING_ARTIFACT_ERROR` | bFetchError OR tFetchError for any type | Warning | `"Artifact fetch failed for: ${types}"` |

**Special case — base = 0 with delta:**

When base = 0 and target > 0, `delta/base` is undefined. The
`WARNING_FAILURES_APPEARED` rule handles this explicitly. The ratio-based rules
skip entries where base = 0.

**Unknown fallback (not a rule — a post-evaluation check):**

If `hasUsableData === false` (no summary deltas and no set-diff results and no
artifact errors) → return Unknown regardless of triggered rules.

### Global vs. dashboard-specific

**Phase 1: global rules only.**

Both `dlq_operations` (failure metrics in summary) and `pipeline_health` (failure
info in `failure_types` artifact) are covered by the same rule set:
- Failure summary fields → matched by field name pattern
- New failure types → covered by set-diff rules

Dashboard-specific threshold configs (e.g. `pipeline_health` may tolerate 50%
failure swings) are a Phase 2 extension. Hardcoding a global set of thresholds
and rules is correct for Phase 1.

### Aggregation algorithm

```
1. Run all RULES against normalized input
2. Collect triggered rules: [{id, severity, reason}]
3. If no rules triggered:
     - if hasUsableData → return Stable (severity 2)
     - else            → return Unknown (severity 0)
4. Find maxSeverity = Math.max(...triggeredRules.map(r => r.severity))
5. Return {classification, severity: maxSeverity, reasons, triggered_rules}
```

---

## 6. Output Contract

```js
{
  // Human-readable label
  classification: "Critical" | "Warning" | "Stable" | "Healthy" | "Unknown",

  // Numeric severity (0–4); higher = more urgent
  // Useful for sorting run history by health in future phases
  severity: 0 | 1 | 2 | 3 | 4,

  // Human-readable explanations, one per triggered rule
  reasons: string[],   // e.g. ["failures_last_24h more than doubled (42 → 85)"]

  // Rule IDs that fired; for programmatic use, logging, and future filtering
  triggered_rules: string[],  // e.g. ["CRITICAL_FAILURE_SPIKE"]
}
```

**Empty results:**

- `reasons: []` and `triggered_rules: []` for Stable or Unknown (no rules fired)
- The classification field is always populated — never null

---

## 7. UI Integration

**Phase 1: health badge in Run Comparison page header only.**

The badge appears next to the dashboard name in the RunCompare header, immediately
after comparison data loads. It is synchronous — no loading state needed.

```
Compare Runs — dlq_operations   [Warning ▲]
default / local
```

**`HealthBadge.jsx`** — a single `<span>` with conditional styling per classification.

```jsx
// Usage in RunCompare header:
<HealthBadge classification={health.classification} />

// Returns a colored pill: e.g.
// [Critical]  (red)
// [Warning]   (amber)
// [Stable]    (grey)
// [Healthy]   (green)
// [Unknown]   (grey, subdued)
```

Colors map to existing theme tokens:
- Critical → `errorBg` / `errorText` / `errorBorder`
- Warning → `warningBg` / `warningText` / `warningBorder`
- Stable → `divider` / `textSecondary`
- Healthy → `successBg` / `successText` / `successBorder`
- Unknown → `background` / `textMuted` / `border`

**Why Run Comparison only for Phase 1:**

- Run Comparison is where the diff data lives — no new data fetch needed
- The badge is computable immediately from already-loaded state
- Run History integration requires the classifier to run at history list load time
  (each row needs its own comparison) — that's a Phase 2 concern involving
  additional data fetching or precomputation

---

## 8. Relationship to AI Summary

The health classification and the AI anomaly summary are independent, additive layers.

```
RunCompare page layout:
  [Header]      Compare Runs — dlq_operations  [Warning ▲]   ← deterministic
  [Run cards]   Base run / Target run
  [Tables]      Summary delta, top_sites, exceptions, failure_types
  [AnomalySummary]   "Analyze with AI" panel    ← optional, user-triggered
```

**Invariants:**

1. Health badge is always present once comparison data loads (no user action needed)
2. AI summary requires user to click "Analyze with AI" (opt-in, async)
3. The AI summary never modifies or overrides the health classification
4. The `reasons[]` from the classifier may optionally be surfaced to the AI in a
   Phase 2 enhancement, but the AI cannot change the label

In a future phase, the `AnomalySummary` prompt could receive the health
classification and reasons as additional context, improving the LLM explanation.
This is not implemented in Phase 1.

---

## 9. Failure / Unknown Handling

| Scenario | Behavior |
|----------|---------|
| No summary deltas AND no set-diff data | `Unknown` — no rules can fire |
| All artifact fetches failed | `Unknown` (no usable data) |
| Some artifacts fetched, some errored | `WARNING_ARTIFACT_ERROR` fires for errored types; other rules run normally |
| `diffResult` is null for all comparisons | `Unknown` |
| `diffResult` is empty array for summary | No summary rules fire; set-diff rules may still fire |
| `delta` is null for a field (one side missing) | Rule skips that field |
| base === 0 for a failure field | Ratio-based rules skip; `WARNING_FAILURES_APPEARED` handles target > 0 case |
| base === 0 AND target === 0 | No rule fires for that field |
| Compare throws (`diffError` set) | Treated same as fetch error; `WARNING_ARTIFACT_ERROR` fires |

**Unknown is not an error state** — it means "I cannot judge." The comparison tables
are still shown normally. Unknown is displayed with a subdued badge, not an error color.

---

## 10. Files to Create / Modify

### Create

| File | Purpose |
|------|---------|
| `portal/src/utils/runHealth.js` | Classifier: rules, thresholds, `classifyRunHealth()` |
| `portal/src/utils/runHealth.test.js` | Unit tests for all rules and edge cases |
| `portal/src/components/HealthBadge.jsx` | Inline classification badge component |

### Modify

| File | Change |
|------|--------|
| `portal/src/pages/RunCompare.jsx` | Import `classifyRunHealth` and `HealthBadge`; compute health from `comparisons` state; render badge in header |

### No changes to

- `portal/src/utils/runDiff.js` — comparison engine unchanged
- `portal/src/utils/runDiff.test.js` — existing tests unchanged
- `portal/src/utils/anomalyPayload.js` — payload builder unchanged
- `portal/src/components/AnomalySummary.jsx` — AI panel unchanged
- All publisher files, all other portal files

---

## 11. Verification Plan

### Unit tests (`runHealth.test.js`)

```js
// 1. Critical — failure doubled
classifyRunHealth(comparisons with failures_last_24h: 42 → 90)
// Expected: { classification: "Critical", triggered_rules: ["CRITICAL_FAILURE_SPIKE"] }

// 2. Warning — failure increased 30%
classifyRunHealth(comparisons with failures_last_24h: 100 → 130)
// Expected: { classification: "Warning", triggered_rules: ["WARNING_FAILURE_INCREASE"] }

// 3. Healthy — failure reduced 25%
classifyRunHealth(comparisons with failures_last_24h: 100 → 75)
// Expected: { classification: "Healthy", triggered_rules: ["HEALTHY_FAILURE_REDUCTION"] }

// 4. Stable — small change (5%)
classifyRunHealth(comparisons with failures_last_24h: 100 → 105)
// Expected: { classification: "Stable", triggered_rules: [] }

// 5. Warning — new failure type appeared
classifyRunHealth(comparisons with 1 new failure type in exceptions)
// Expected: { classification: "Warning", triggered_rules: ["WARNING_NEW_FAILURE_TYPE"] }

// 6. Critical — 3+ new failure types
classifyRunHealth(comparisons with 3 new failure types in failure_types)
// Expected: { classification: "Critical", triggered_rules: ["CRITICAL_MANY_NEW_FAILURE_TYPES", ...] }

// 7. Warning wins over Healthy (max severity)
classifyRunHealth(comparisons with failures_last_24h: 100 → 75 AND 1 new failure type)
// Expected: { classification: "Warning", reasons include both }

// 8. Unknown — no usable data
classifyRunHealth(comparisons all with null diffResult, no errors)
// Expected: { classification: "Unknown" }

// 9. Warning — artifact fetch error
classifyRunHealth(comparisons with bFetchError on "top_sites")
// Expected: { classification: "Warning", triggered_rules: ["WARNING_ARTIFACT_ERROR"] }

// 10. base = 0, target > 0 — failures appeared
classifyRunHealth(comparisons with failures_last_24h: 0 → 5)
// Expected: { classification: "Warning", triggered_rules: ["WARNING_FAILURES_APPEARED"] }

// 11. base = 0, target = 0 — no change
classifyRunHealth(comparisons with failures_last_24h: 0 → 0)
// Expected: { classification: "Stable" }

// 12. Missing delta (null) skipped gracefully
classifyRunHealth(comparisons with {field, base: null, target: 5, delta: null})
// Expected: no failure rule fires for that field
```

### Build verification

```bash
cd portal && npm test     # all tests pass (existing + new runHealth tests)
cd portal && npm run build  # exits 0
```

### Manual

```
- Navigate to RunCompare page with two real runs
- Verify badge appears in header immediately on load
- Verify badge updates if comparison data changes (different run pair)
- Verify AnomalySummary panel is unaffected (still works independently)
- Verify Unknown shows for a run pair with all artifacts errored
```

---

## 12. Non-Goals

| Excluded | Reason |
|----------|--------|
| LLM-based classification | Deterministic classification is the source of truth |
| Cross-dashboard classification | Incomparable schemas and thresholds |
| Cross-client/env aggregation | Scope isolation is a core platform principle |
| Automatic alert delivery | No backend; no push infrastructure in Phase 1 |
| Backend services | Classification is browser-side, synchronous |
| Policy engines | Explicit rule array is sufficient; no DSL needed |
| User-configurable thresholds in Phase 1 | Named constants; override in Phase 2 |
| Run History integration in Phase 1 | Requires per-row comparison fetches; Phase 2 |
| Platform manifest health rollup | Phase 2 |

---

## 13. Future Extensions

| Extension | Description |
|-----------|-------------|
| Dashboard-specific thresholds | Config object per dashboard ID; overrides global `HEALTH_THRESHOLDS` |
| Health labels in Run History | Precompute or lazy-load classification per row in the history table |
| Health labels in platform manifest | Publisher adds `latest_health` field to platform-manifest.json |
| AI explanation of triggered rules | Pass `triggered_rules` and `reasons` to `AnomalySummary` as context |
| Alerting integration | CloudWatch / PagerDuty hook when classification reaches Critical |
| Trend health | Classify the direction of health over the last N runs |

None of these are in Phase 1.

---

## 14. Review

**See:** `docs/reviews/automated_run_health_classification_review.md`
