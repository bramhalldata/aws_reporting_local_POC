/**
 * ollamaClient.js — Local Ollama inference client for run anomaly analysis.
 *
 * Calls the Ollama REST API at localhost:11434. Inference runs entirely on the
 * developer machine — no data leaves the local environment.
 *
 * CORS note: Ollama allows localhost cross-origin requests by default.
 * If you encounter a CORS error, start Ollama with:
 *   OLLAMA_ORIGINS=* ollama serve
 *
 * Configuration:
 *   OLLAMA_MODEL   — model to use for inference (must be pulled: ollama pull llama3.2)
 *   OLLAMA_TIMEOUT — abort inference after this many milliseconds
 *   OLLAMA_BASE    — Ollama API base URL (change if running on a non-default port)
 */

export const OLLAMA_MODEL   = "llama3.2";
export const OLLAMA_TIMEOUT = 45000; // ms — increase for slower hardware or larger models
export const OLLAMA_BASE    = "http://localhost:11434";

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

function buildPrompt(payload) {
  return `You are an analytics assistant that explains differences between two pipeline runs.

The following JSON contains computed deltas between a base run and a target run for the "${payload.dashboard_id}" dashboard (client: ${payload.client_id}, env: ${payload.env_id}).

${JSON.stringify(payload, null, 0)}

Respond ONLY with valid JSON matching this exact structure (no prose, no markdown, just JSON):
{
  "summary": "<1–2 sentence description of the overall change>",
  "notable_changes": ["<item 1>", "<item 2>"],
  "likely_anomalies": ["<item 1>"],
  "caveats": "<brief note about AI interpretation>"
}

Rules:
- Be concise. Each notable_change should be one short phrase.
- Base notable_changes and likely_anomalies ONLY on the data provided.
- Do not speculate about root causes. Report what the data shows.
- If there are no anomalies, set likely_anomalies to [].
- caveats must always be present and note that this is AI-generated.`;
}

// ---------------------------------------------------------------------------
// API call
// ---------------------------------------------------------------------------

/**
 * callOllamaAnalysis — send the anomaly payload to Ollama and return structured output.
 *
 * @param {object} payload - Output of buildAnomalyPayload()
 * @returns {Promise<{summary, notable_changes, likely_anomalies, caveats}>}
 * @throws {OllamaError} with .type field for structured error handling
 */
export async function callOllamaAnalysis(payload) {
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT);

  let res;
  try {
    res = await fetch(`${OLLAMA_BASE}/api/generate`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        model:   OLLAMA_MODEL,
        prompt:  buildPrompt(payload),
        format:  "json",
        stream:  false,
        options: { temperature: 0.1 },
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      throw new OllamaError("timeout", `Analysis timed out after ${OLLAMA_TIMEOUT / 1000}s. Try a smaller model or re-analyze.`);
    }
    // fetch() threw — Ollama is not reachable
    throw new OllamaError("unavailable", `Local AI unavailable. Ensure Ollama is running at ${OLLAMA_BASE}.\nStart with: ollama serve`);
  }
  clearTimeout(timeoutId);

  if (!res.ok) {
    let hint = "";
    try {
      const body = await res.json();
      hint = body?.error ? `\n${body.error}` : "";
    } catch (_) { /* ignore */ }
    if (res.status === 404) {
      throw new OllamaError("model_not_found", `Model "${OLLAMA_MODEL}" not found.${hint}\nPull it with: ollama pull ${OLLAMA_MODEL}`);
    }
    throw new OllamaError("api_error", `Ollama returned HTTP ${res.status}.${hint}`);
  }

  let ollamaResponse;
  try {
    ollamaResponse = await res.json();
  } catch {
    throw new OllamaError("parse_error", "Could not parse Ollama API response.");
  }

  // Ollama wraps the model output in ollamaResponse.response (string)
  const rawText = ollamaResponse?.response ?? "";
  if (!rawText.trim()) {
    throw new OllamaError("empty_response", "Model returned an empty response. Try re-analyzing.");
  }

  // Parse the model's JSON output
  let result;
  try {
    result = JSON.parse(rawText);
  } catch {
    // Malformed JSON — return raw text for display; caller handles this case
    throw new OllamaError("malformed_output", rawText);
  }

  // Per-field guards — model may partially follow the schema
  return {
    summary:          typeof result.summary === "string"        ? result.summary          : null,
    notable_changes:  Array.isArray(result.notable_changes)     ? result.notable_changes  : [],
    likely_anomalies: Array.isArray(result.likely_anomalies)    ? result.likely_anomalies : [],
    caveats:          typeof result.caveats === "string"        ? result.caveats          : "AI-generated output. Verify with source data.",
  };
}

// ---------------------------------------------------------------------------
// Structured error type
// ---------------------------------------------------------------------------

export class OllamaError extends Error {
  /**
   * @param {"unavailable"|"timeout"|"model_not_found"|"api_error"|"parse_error"|"empty_response"|"malformed_output"} type
   * @param {string} message - Human-readable message for display
   */
  constructor(type, message) {
    super(message);
    this.name    = "OllamaError";
    this.type    = type;
    /** For malformed_output: contains the raw non-JSON text from the model. */
    this.rawText = type === "malformed_output" ? message : null;
  }
}
