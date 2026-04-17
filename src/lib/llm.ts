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
// Agents may store either a friendly key ("openrouter-free") or a raw
// OpenRouter model ID ("meta-llama/llama-3.1-8b-instruct:free"). Both
// resolve to the same wire call. Anything unrecognized falls back to the
// free Llama endpoint so a mis-set agent row doesn't 400 out.
// ---------------------------------------------------------------------------

export type ModelKey = string;

const DEFAULT_MODEL = "meta-llama/llama-3.1-8b-instruct:free";

const FRIENDLY_ALIASES: Record<string, string> = {
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
// callLLM
// ---------------------------------------------------------------------------

export async function callLLM(
  systemPrompt: string,
  userInput: string,
  modelKey: ModelKey
): Promise<LLMResult> {
  const modelId = resolveModelId(modelKey);
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
