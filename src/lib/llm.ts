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
// Model mapping  (tech doc Section 8.1)
// ---------------------------------------------------------------------------

export type ModelKey =
  | "openrouter-free"
  | "mistral-7b"
  | "gemma-2-9b"
  | "claude-haiku"
  | "gpt-4o-mini";

const MODEL_IDS: Record<ModelKey, string> = {
  "openrouter-free": "meta-llama/llama-3.1-8b-instruct",
  "mistral-7b": "mistralai/mistral-7b-instruct-v0.1",
  "gemma-2-9b": "google/gemma-2-9b-it",
  "claude-haiku": "anthropic/claude-3.5-haiku",
  "gpt-4o-mini": "openai/gpt-4o-mini",
};

// Cost per token in USDC (USD ≈ USDC at 1:1)
const COST_PER_TOKEN: Record<ModelKey, number> = {
  "openrouter-free": 0.00000006, // llama-3.1-8b
  "mistral-7b": 0.00000006,
  "gemma-2-9b": 0.00000008,
  "claude-haiku": 0.0000008, // claude-3.5-haiku
  "gpt-4o-mini": 0.0000006,
};

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
  const modelId = MODEL_IDS[modelKey];
  const costPerToken = COST_PER_TOKEN[modelKey];

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
