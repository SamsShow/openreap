import OpenAI from "openai";

// ---------------------------------------------------------------------------
// OpenRouter client (OpenAI-compatible)
// ---------------------------------------------------------------------------

const openrouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY!,
  defaultHeaders: {
    "HTTP-Referer": "https://openreap.xyz",
    "X-Title": "OpenReap",
  },
});

// ---------------------------------------------------------------------------
// Model mapping
//
// Agents may store either a friendly key ("inhouse") or a raw OpenRouter
// model ID ("meta-llama/llama-3.1-8b-instruct:free"). Both resolve to the
// same wire call. Anything unrecognized falls back to the free Llama model
// so a mis-set agent row doesn't 400 out.
//
// Free-tier requests (any resolved ID ending in ":free") route to our
// in-house Qwen 3.5 4B server when INHOUSE_LLM_URL is set, with automatic
// fallback to OpenRouter's free Llama on failure.
// ---------------------------------------------------------------------------

export type ModelKey = string;

// OpenRouter's free tier is thinning out — llama-3.1-8b:free, mistral-7b:free,
// gemma-2-9b:free, and gemini-2.0-flash-exp:free all 404 now. Stick to the
// models that still resolve (llama-3.2-3b:free, llama-3.3-70b:free). The
// in-house path covers free-tier normally; OpenRouter is only the fallback
// when the local server is unreachable, and rate limiting there is fine.
const DEFAULT_MODEL = "meta-llama/llama-3.2-3b-instruct:free";

const FRIENDLY_ALIASES: Record<string, string> = {
  inhouse: DEFAULT_MODEL,
  "openrouter-free": DEFAULT_MODEL,
  "llama-3.3-70b": "meta-llama/llama-3.3-70b-instruct:free",
  "claude-haiku": "anthropic/claude-3.5-haiku",
  "gpt-4o-mini": "openai/gpt-4o-mini",
  // Defensive aliases for a few values we've seen in the wild
  standard: DEFAULT_MODEL,
  none: DEFAULT_MODEL,
  "": DEFAULT_MODEL,
};

const COST_PER_TOKEN: Record<string, number> = {
  "meta-llama/llama-3.2-3b-instruct:free": 0,
  "meta-llama/llama-3.3-70b-instruct:free": 0,
  "anthropic/claude-3.5-haiku": 0.0000008,
  "openai/gpt-4o-mini": 0.0000006,
};

const DEFAULT_COST_PER_TOKEN = 0.0000001; // conservative estimate for unknown models

function resolveModelId(key: string | null | undefined): string {
  const raw = (key ?? "").trim();
  if (!raw) return DEFAULT_MODEL;
  if (raw in FRIENDLY_ALIASES) return FRIENDLY_ALIASES[raw];
  // Anything containing a slash looks like a provider/model OpenRouter id
  if (raw.includes("/")) return raw;
  console.warn(
    `[llm] Unknown model "${raw}" — falling back to ${DEFAULT_MODEL}`
  );
  return DEFAULT_MODEL;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LLMResult {
  content: object;
  raw: string;
  tokens: number;
  latency_ms: number;
  model: string;
  cost_usdc: number;
}

// ---------------------------------------------------------------------------
// Tolerant JSON extraction
//
// Every agent in the platform asks its model for JSON, but model outputs
// routinely violate strict JSON in three predictable ways:
//   1. Wrapped in markdown fences  (```json\n{...}\n```)
//   2. Preamble/postamble narration around the JSON object
//   3. Truncated mid-value when the model runs out of tokens
//
// parseModelJson runs a series of repairs in order and returns the first
// object that parses. If nothing parses we surface {error, raw} so the UI
// can fall back. Used by both callInhouseLLM and callOpenRouterLLM so every
// hired agent gets the same resilience.
// ---------------------------------------------------------------------------

export function parseModelJson(raw: string): object {
  if (!raw) return { error: "output_invalid", raw: "" };

  const attempts: string[] = [];

  // Attempt 1: raw string as-is.
  attempts.push(raw.trim());

  // Attempt 2: strip a surrounding markdown code fence.
  const fenced = raw.trim().match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  if (fenced) attempts.push(fenced[1].trim());

  // Attempt 3: slice between the first `{` and the last `}` — strips
  // preamble and postamble.
  const base = fenced ? fenced[1].trim() : raw.trim();
  const first = base.indexOf("{");
  const last = base.lastIndexOf("}");
  if (first >= 0 && last > first) attempts.push(base.slice(first, last + 1));

  // Attempt 4: truncation repair — close unclosed containers, rewinding
  // past any trailing incomplete token.
  if (first >= 0) {
    const repaired = repairTruncatedJson(base.slice(first));
    if (repaired) attempts.push(repaired);
  }

  for (const candidate of attempts) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (parsed && typeof parsed === "object") return parsed as object;
    } catch {
      // try next strategy
    }
  }

  return { error: "output_invalid", raw };
}

/**
 * Repair a JSON string that was truncated mid-generation. Rewinds past the
 * last incomplete token and appends closers for still-open containers.
 * Returns null if the input is unsalvageable.
 */
function repairTruncatedJson(start: string): string | null {
  const depth: Array<"}" | "]"> = [];
  let inString = false;
  let escape = false;
  let lastSafeCut = -1;

  for (let i = 0; i < start.length; i += 1) {
    const c = start[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (c === "\\") escape = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "{") depth.push("}");
    else if (c === "[") depth.push("]");
    else if (c === "}" || c === "]") {
      if (depth[depth.length - 1] === c) {
        depth.pop();
        lastSafeCut = i + 1;
      } else {
        return null; // structural mismatch
      }
    } else if (c === ",") {
      if (depth.length > 0) lastSafeCut = i; // cut before the comma
    }
  }

  let candidate = start;
  if (inString || escape) {
    if (lastSafeCut < 0) return null;
    candidate = start.slice(0, lastSafeCut);
  }

  candidate = candidate.replace(/,\s*$/, "");

  // Recount depth on the trimmed candidate so the closers match.
  const finalDepth: Array<"}" | "]"> = [];
  let s = false;
  let e = false;
  for (const c of candidate) {
    if (e) {
      e = false;
      continue;
    }
    if (s) {
      if (c === "\\") e = true;
      else if (c === '"') s = false;
      continue;
    }
    if (c === '"') {
      s = true;
      continue;
    }
    if (c === "{") finalDepth.push("}");
    else if (c === "[") finalDepth.push("]");
    else if (
      (c === "}" || c === "]") &&
      finalDepth[finalDepth.length - 1] === c
    ) {
      finalDepth.pop();
    }
  }

  while (finalDepth.length > 0) {
    candidate += finalDepth.pop();
  }

  return candidate;
}

// ---------------------------------------------------------------------------
// In-house LLM (Qwen 3.5 4B served from INHOUSE_LLM_URL)
// ---------------------------------------------------------------------------

const INHOUSE_DEFAULT_MODEL_ID = "llama-3.2-3b-instruct";
// 60s default suits reasoning models (deepseek-r1 needs 30-50s on typical
// prompts). Fast non-reasoning models like llama-3.2 finish in <10s so the
// higher ceiling is harmless. Override with INHOUSE_LLM_TIMEOUT_MS.
const INHOUSE_DEFAULT_TIMEOUT_MS = 260_000;
const INHOUSE_MAX_ATTEMPTS = 1;
const INHOUSE_BASE_BACKOFF_MS = 300;

function inhouseTimeoutMs(): number {
  const raw = process.env.INHOUSE_LLM_TIMEOUT_MS;
  if (!raw) return INHOUSE_DEFAULT_TIMEOUT_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : INHOUSE_DEFAULT_TIMEOUT_MS;
}

interface InhouseChatCompletion {
  id?: string;
  model?: string;
  choices: Array<{
    message?: { content?: string | null };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

async function callInhouseLLM(
  systemPrompt: string,
  userInput: string
): Promise<LLMResult> {
  // LM Studio's native /api/v1/chat ties into a server-level Structured
  // Output toggle that 400s ("JSON schema is missing in json-mode request")
  // when it's on without a schema. The OpenAI-compatible endpoint has a
  // stable documented schema and ignores that toggle entirely.
  const url = `${process.env.INHOUSE_LLM_URL}/v1/chat/completions`;
  const modelId = process.env.INHOUSE_LLM_MODEL || INHOUSE_DEFAULT_MODEL_ID;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), inhouseTimeoutMs());

  const startMs = Date.now();
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // ngrok's free tier serves an HTML browser-warning page on every
        // request without this header. Harmless on other hosts.
        "ngrok-skip-browser-warning": "true",
      },
      body: JSON.stringify({
        model: modelId,
        // Assistant prefill: seeding the turn with `{` forces the model
        // to continue from there — no room for planning, reasoning, or
        // "Let me think..." preambles. Saves 1500-2000 tokens that
        // Gemma otherwise burns on meta-chatter before emitting JSON.
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userInput },
          { role: "assistant", content: "{" },
        ],
        temperature: 0.1,
        max_tokens: 16000,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    console.warn(
      `[inhouse] ${res.status} from ${url} (model=${modelId}); body: ${errBody.slice(0, 500)}`
    );
    throw new Error(`inhouse HTTP ${res.status}: ${errBody.slice(0, 200)}`);
  }

  const body = (await res.json()) as InhouseChatCompletion;
  const latency_ms = Date.now() - startMs;

  // Re-attach the prefill `{` — some backends strip it from the response
  // (continuing from the seeded assistant turn), others echo it back.
  // Only prepend if the response doesn't already start with it.
  const rawContent = (body.choices[0]?.message?.content ?? "").trim();
  const raw = rawContent.startsWith("{") ? rawContent : "{" + rawContent;
  const content = parseModelJson(raw);

  return {
    content,
    raw,
    tokens: body.usage?.total_tokens ?? 0,
    latency_ms,
    model: `inhouse:${body.model ?? modelId}`,
    cost_usdc: 0,
  };
}

async function callInhouseLLMWithRetry(
  systemPrompt: string,
  userInput: string
): Promise<LLMResult> {
  let lastErr: unknown;

  for (let attempt = 0; attempt < INHOUSE_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await callInhouseLLM(systemPrompt, userInput);
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const name = err instanceof Error ? err.name : "";

      // Deterministic failures — don't burn retries.
      //  - 4xx from the upstream: server-side bug
      //  - AbortError / "This operation was aborted": we hit our own
      //    timeout, which means the server already accepted the request
      //    and is probably still working on it. Retrying piles another
      //    request onto the same queue, compounding the jam.
      if (/inhouse HTTP 4\d\d/.test(msg)) throw err;
      if (name === "AbortError" || /aborted/i.test(msg)) throw err;

      if (attempt < INHOUSE_MAX_ATTEMPTS - 1) {
        const backoff = INHOUSE_BASE_BACKOFF_MS * Math.pow(3, attempt);
        console.warn(
          `[llm] inhouse attempt ${attempt + 1}/${INHOUSE_MAX_ATTEMPTS} failed (${msg}); retrying in ${backoff}ms`
        );
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------------------
// OpenRouter path
// ---------------------------------------------------------------------------

async function callOpenRouterLLM(
  systemPrompt: string,
  userInput: string,
  modelId: string
): Promise<LLMResult> {
  const costPerToken = COST_PER_TOKEN[modelId] ?? DEFAULT_COST_PER_TOKEN;

  const startMs = Date.now();

  const completion = await openrouter.chat.completions.create({
    model: modelId,
    response_format: { type: "json_object" },
    max_tokens: 2048,
    temperature: 0.1,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userInput },
    ],
  });

  const latency_ms = Date.now() - startMs;

  const raw = completion.choices[0]?.message?.content ?? "";
  const tokens = completion.usage?.total_tokens ?? 0;
  // Even with response_format: json_object, models occasionally emit
  // preambles or trucate at max_tokens. parseModelJson is tolerant.
  const content = parseModelJson(raw);
  const cost_usdc = tokens * costPerToken;

  return {
    content,
    raw,
    tokens,
    latency_ms,
    model: modelId,
    cost_usdc,
  };
}

// ---------------------------------------------------------------------------
// callLLM — dispatch with in-house-first routing for free tier
// ---------------------------------------------------------------------------

export async function callLLM(
  systemPrompt: string,
  userInput: string,
  modelKey: ModelKey
): Promise<LLMResult> {
  const modelId = resolveModelId(modelKey);
  const isFreeTier = modelId.endsWith(":free");

  if (isFreeTier && process.env.INHOUSE_LLM_URL) {
    // No OpenRouter fallback. Free-tier OpenRouter routinely 429s and
    // served as a silent "success" that looked like an in-house failure
    // to the user. Agents configured as 'inhouse' should succeed or fail
    // on the in-house path only — the error the user sees is the real one.
    return callInhouseLLMWithRetry(systemPrompt, userInput);
  }

  return callOpenRouterLLM(systemPrompt, userInput, modelId);
}
