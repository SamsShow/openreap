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

const DEFAULT_MODEL = "meta-llama/llama-3.1-8b-instruct:free";

const FRIENDLY_ALIASES: Record<string, string> = {
  inhouse: DEFAULT_MODEL,
  "openrouter-free": DEFAULT_MODEL,
  "mistral-7b": "mistralai/mistral-7b-instruct:free",
  "gemma-2-9b": "google/gemma-2-9b-it:free",
  "claude-haiku": "anthropic/claude-3.5-haiku",
  "gpt-4o-mini": "openai/gpt-4o-mini",
  // Defensive aliases for a few values we've seen in the wild
  standard: DEFAULT_MODEL,
  none: DEFAULT_MODEL,
  "": DEFAULT_MODEL,
};

const COST_PER_TOKEN: Record<string, number> = {
  "meta-llama/llama-3.1-8b-instruct:free": 0,
  "meta-llama/llama-3.1-8b-instruct": 0.00000006,
  "mistralai/mistral-7b-instruct:free": 0,
  "google/gemma-2-9b-it:free": 0,
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
// In-house LLM (Qwen 3.5 4B served from INHOUSE_LLM_URL)
// ---------------------------------------------------------------------------

const INHOUSE_DEFAULT_MODEL_ID = "llama-3.2-3b-instruct";
// 60s default suits reasoning models (deepseek-r1 needs 30-50s on typical
// prompts). Fast non-reasoning models like llama-3.2 finish in <10s so the
// higher ceiling is harmless. Override with INHOUSE_LLM_TIMEOUT_MS.
const INHOUSE_DEFAULT_TIMEOUT_MS = 60_000;
const INHOUSE_MAX_ATTEMPTS = 3;
const INHOUSE_BASE_BACKOFF_MS = 300;

function inhouseTimeoutMs(): number {
  const raw = process.env.INHOUSE_LLM_TIMEOUT_MS;
  if (!raw) return INHOUSE_DEFAULT_TIMEOUT_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : INHOUSE_DEFAULT_TIMEOUT_MS;
}

interface InhouseResponse {
  model_instance_id: string;
  output: Array<{ type: string; content: string }>;
  stats: {
    input_tokens: number;
    total_output_tokens: number;
    reasoning_output_tokens?: number;
  };
}

async function callInhouseLLM(
  systemPrompt: string,
  userInput: string
): Promise<LLMResult> {
  const url = `${process.env.INHOUSE_LLM_URL}/api/v1/chat`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), inhouseTimeoutMs());

  const startMs = Date.now();
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.INHOUSE_LLM_MODEL || INHOUSE_DEFAULT_MODEL_ID,
        system_prompt: systemPrompt,
        input: userInput,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) throw new Error(`inhouse HTTP ${res.status}`);

  const body = (await res.json()) as InhouseResponse;
  const latency_ms = Date.now() - startMs;

  // The server interleaves `reasoning` and `message` entries; we only want
  // the final `message`.
  const message = [...body.output]
    .reverse()
    .find((o) => o.type === "message");
  const raw = (message?.content ?? "").trim();

  // LM Studio has no json-object response_format like OpenAI does, so
  // instruct-tuned models often wrap JSON in ```json ... ``` fences. Strip
  // those before parsing.
  const fenced = raw.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  const jsonCandidate = fenced ? fenced[1].trim() : raw;

  let content: object;
  try {
    content = JSON.parse(jsonCandidate) as object;
  } catch {
    content = { error: "output_invalid", raw };
  }

  return {
    content,
    raw,
    tokens: body.stats.input_tokens + body.stats.total_output_tokens,
    latency_ms,
    model: `inhouse:${body.model_instance_id}`,
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
      // Deterministic failures — don't burn retries.
      if (/inhouse HTTP 4\d\d/.test(msg)) throw err;

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
  let content: object;
  try {
    content = JSON.parse(raw) as object;
  } catch {
    content = { error: "output_invalid", raw };
  }
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
    try {
      return await callInhouseLLMWithRetry(systemPrompt, userInput);
    } catch (err) {
      console.warn(
        `[llm] inhouse exhausted retries, falling back to OpenRouter:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  return callOpenRouterLLM(systemPrompt, userInput, modelId);
}
