/**
 * SKILL.md parser for OpenReap
 *
 * Converts raw SKILL.md text into a structured ParsedSkill object.
 * Pure library module — no dependencies on the rest of the app.
 *
 * Tech doc refs:
 *   Section 2.1 — SKILL.md format
 *   Section 2.3 — System prompt generation
 *   Section 2.4 — Validation rules
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type SkillCategory =
  | "legal"
  | "finance"
  | "tech"
  | "health"
  | "hr"
  | "defi"
  | "other";

export type ModelTier = "standard" | "pro";

export interface SkillMeta {
  name: string;
  version: string;
  author: string;
  price_usdc: number;
  category: SkillCategory;
  model_tier: ModelTier;
}

export interface SkillService {
  description: string;
  accepts: string[];
  rejects: string[];
}

export interface SkillExample {
  input: string;
  output: string;
}

export interface ParsedSkill {
  meta: SkillMeta;
  service: SkillService;
  /** Raw output schema JSON string (validated parseable) */
  output_schema: string;
  examples: SkillExample[];
  escalate_patterns: string[];
  /** Ready-to-use system prompt derived from all sections */
  system_prompt: string;
}

export interface ParseError {
  field: string;
  message: string;
  /** true = parse result is null (hard failure); false = warning only */
  blocking: boolean;
}

export interface ParseResult {
  skill: ParsedSkill | null;
  errors: ParseError[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_FILE_BYTES = 100 * 1024; // 100 KB
const MIN_DESCRIPTION_CHARS = 50;
const MIN_EXAMPLES = 2;

const VALID_CATEGORIES = new Set<string>([
  "legal",
  "finance",
  "tech",
  "health",
  "hr",
  "defi",
  "other",
]);

const VALID_MODEL_TIERS = new Set<string>(["standard", "pro"]);

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Split raw text into named sections keyed by `## heading`.
 * Keys are lower-cased heading names; values are the raw body text.
 */
function extractSections(raw: string): Map<string, string> {
  const sections = new Map<string, string>();
  // Split on lines that start with "## "
  const parts = raw.split(/^##\s+/m);
  for (const part of parts) {
    if (!part.trim()) continue;
    const newlineIdx = part.indexOf("\n");
    if (newlineIdx === -1) continue;
    const heading = part.slice(0, newlineIdx).trim().toLowerCase();
    const body = part.slice(newlineIdx + 1);
    sections.set(heading, body);
  }
  return sections;
}

/**
 * Strip inline YAML comments (everything after a bare `#` that is not inside
 * quotes) and surrounding whitespace / quotes from a scalar value string.
 */
function cleanScalar(raw: string): string {
  // Remove inline comment: a `#` preceded by whitespace and not inside a string
  const withoutComment = raw.replace(/\s+#[^\n]*$/, "");
  // Strip surrounding whitespace
  let value = withoutComment.trim();
  // Strip surrounding double or single quotes
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return value;
}

/**
 * Parse a simple key:value YAML-like block.
 * Handles multi-line block scalar values (introduced with `|`).
 */
function parseKeyValueBlock(block: string): Map<string, string> {
  const result = new Map<string, string>();
  const lines = block.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    // Skip blank lines and comment-only lines
    if (!line.trim() || line.trim().startsWith("#")) {
      i++;
      continue;
    }

    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) {
      i++;
      continue;
    }

    const key = line.slice(0, colonIdx).trim();
    const rawValue = line.slice(colonIdx + 1);

    if (rawValue.trim() === "|") {
      // Block scalar — collect indented lines that follow
      const baseIndent = line.match(/^(\s*)/)?.[1].length ?? 0;
      const bodyLines: string[] = [];
      i++;
      while (i < lines.length) {
        const nextLine = lines[i];
        // If the line is blank or more indented than the key, it belongs to the block
        if (
          nextLine.trim() === "" ||
          (nextLine.match(/^(\s*)/)?.[1].length ?? 0) > baseIndent
        ) {
          // Strip exactly baseIndent+2 leading spaces (standard YAML block indent)
          const stripped = nextLine.replace(
            new RegExp(`^\\s{0,${baseIndent + 2}}`),
            ""
          );
          bodyLines.push(stripped);
          i++;
        } else {
          break;
        }
      }
      // Trim trailing blank lines then join
      while (bodyLines.length && bodyLines[bodyLines.length - 1].trim() === "") {
        bodyLines.pop();
      }
      result.set(key, bodyLines.join("\n"));
    } else {
      result.set(key, cleanScalar(rawValue));
      i++;
    }
  }

  return result;
}

/**
 * Parse a YAML-style bullet list.  Returns items with the leading `- ` stripped.
 */
function parseBulletList(block: string): string[] {
  return block
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("- "))
    .map((l) => l.slice(2).trim())
    .filter((l) => l.length > 0);
}

/**
 * Extract the JSON object / array literal from a section body.
 * Handles leading/trailing whitespace and extra text before / after the JSON.
 */
function extractJsonBlock(body: string): string {
  // Find the first `{` or `[` and the matching closing bracket
  const startBrace = body.indexOf("{");
  const startBracket = body.indexOf("[");

  let start = -1;
  let openChar: string;
  let closeChar: string;

  if (startBrace === -1 && startBracket === -1) return "";
  if (startBrace === -1) {
    start = startBracket;
    openChar = "[";
    closeChar = "]";
  } else if (startBracket === -1) {
    start = startBrace;
    openChar = "{";
    closeChar = "}";
  } else if (startBrace < startBracket) {
    start = startBrace;
    openChar = "{";
    closeChar = "}";
  } else {
    start = startBracket;
    openChar = "[";
    closeChar = "]";
  }

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < body.length; i++) {
    const ch = body[i];

    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === openChar) depth++;
    else if (ch === closeChar) {
      depth--;
      if (depth === 0) {
        return body.slice(start, i + 1);
      }
    }
  }

  return "";
}

/**
 * Parse individual named examples from the `## examples` section body.
 *
 * Each example looks like:
 *   example_N:
 *     input: "..."
 *     output: '...'
 */
function parseExamples(body: string): SkillExample[] {
  const examples: SkillExample[] = [];
  // Split on lines that look like "example_N:" at the start (zero or more leading spaces)
  const exampleBlocks = body.split(/^[ \t]*example_\d+\s*:/m);

  for (let i = 1; i < exampleBlocks.length; i++) {
    const block = exampleBlocks[i];
    const kv = parseKeyValueBlock(block);
    const input = kv.get("input");
    const output = kv.get("output");
    if (input !== undefined && output !== undefined) {
      examples.push({ input, output });
    }
  }

  return examples;
}

// ---------------------------------------------------------------------------
// System prompt builder (tech doc Section 2.3)
// ---------------------------------------------------------------------------

function buildSystemPrompt(
  meta: SkillMeta,
  service: SkillService,
  outputSchema: string,
  examples: SkillExample[],
  escalatePatterns: string[]
): string {
  const acceptsList = service.accepts
    .map((a) => `  - ${a}`)
    .join("\n");

  const rejectsList = service.rejects
    .map((r) => `  - ${r}`)
    .join("\n");

  const examplesText = examples
    .map(
      (ex, idx) =>
        `Example ${idx + 1}:\n  Input: ${ex.input}\n  Output: ${ex.output}`
    )
    .join("\n\n");

  const escalateText =
    escalatePatterns.length > 0
      ? escalatePatterns.map((p) => `  - ${p}`).join("\n")
      : "  (none)";

  return `You are ${meta.author}, providing the "${meta.name}" service on OpenReap.

## Your Service
${service.description}

## What You Accept
${acceptsList || "  (any input)"}

## What You Reject
${rejectsList || "  (nothing explicitly excluded)"}

## Output Format
You MUST always respond with a valid JSON object matching this schema:
${outputSchema}

## Examples
${examplesText}

## Escalation Triggers
Escalate to a human professional if any of the following apply:
${escalateText}

## Critical Rules
1. ALWAYS respond with valid JSON — no prose, no markdown fences, just raw JSON.
2. If the user's input falls outside what you accept, respond with:
   {"error": "out_of_scope", "message": "<brief reason>"}
3. NEVER fabricate legal opinions, financial advice, or factual claims you cannot verify from the provided input.
4. If asked to do something outside this service definition, respond with the out_of_scope error above.`;
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

/**
 * Parse a raw SKILL.md string into a structured ParsedSkill.
 *
 * Returns `{ skill: ParsedSkill, errors: ParseError[] }` on success (errors
 * may contain non-blocking warnings).  Returns `{ skill: null, errors }` if
 * any blocking validation rule fails.
 */
export function parseSkillMd(raw: string): ParseResult {
  const errors: ParseError[] = [];

  // ------------------------------------------------------------------
  // File-size guard (tech doc Section 2.4)
  // ------------------------------------------------------------------
  const byteLength = new TextEncoder().encode(raw).length;
  if (byteLength > MAX_FILE_BYTES) {
    errors.push({
      field: "file",
      message: `File size ${byteLength} bytes exceeds the 100 KB limit.`,
      blocking: true,
    });
    return { skill: null, errors };
  }

  // ------------------------------------------------------------------
  // Section extraction
  // ------------------------------------------------------------------
  const sections = extractSections(raw);

  const requiredSections: Array<"meta" | "service" | "output_format" | "examples"> =
    ["meta", "service", "output_format", "examples"];

  for (const section of requiredSections) {
    if (!sections.has(section)) {
      errors.push({
        field: section,
        message: `Required section "## ${section}" is missing.`,
        blocking: true,
      });
    }
  }

  if (errors.some((e) => e.blocking)) {
    return { skill: null, errors };
  }

  // ------------------------------------------------------------------
  // Parse ## meta
  // ------------------------------------------------------------------
  const metaBlock = sections.get("meta")!;
  const metaKV = parseKeyValueBlock(metaBlock);

  // name
  const rawName = metaKV.get("name") ?? "";
  if (!rawName) {
    errors.push({ field: "meta.name", message: "name is required.", blocking: true });
  }

  // version
  const rawVersion = metaKV.get("version") ?? "";
  if (!rawVersion) {
    errors.push({
      field: "meta.version",
      message: "version is required.",
      blocking: true,
    });
  }

  // author
  const rawAuthor = metaKV.get("author") ?? "";
  if (!rawAuthor) {
    errors.push({ field: "meta.author", message: "author is required.", blocking: true });
  }

  // price_usdc
  const rawPrice = metaKV.get("price_usdc") ?? "";
  const price = parseFloat(rawPrice);
  if (isNaN(price) || price <= 0) {
    errors.push({
      field: "meta.price_usdc",
      message: `price_usdc must be a number greater than 0 (got "${rawPrice}").`,
      blocking: true,
    });
  }

  // category
  const rawCategory = metaKV.get("category") ?? "";
  if (!VALID_CATEGORIES.has(rawCategory)) {
    errors.push({
      field: "meta.category",
      message: `category must be one of: ${[...VALID_CATEGORIES].join(", ")} (got "${rawCategory}").`,
      blocking: true,
    });
  }

  // model_tier
  const rawModelTier = metaKV.get("model_tier") ?? "standard";
  if (!VALID_MODEL_TIERS.has(rawModelTier)) {
    errors.push({
      field: "meta.model_tier",
      message: `model_tier must be "standard" or "pro" (got "${rawModelTier}").`,
      blocking: true,
    });
  }

  if (errors.some((e) => e.blocking)) {
    return { skill: null, errors };
  }

  const meta: SkillMeta = {
    name: rawName,
    version: rawVersion,
    author: rawAuthor,
    price_usdc: price,
    category: rawCategory as SkillCategory,
    model_tier: rawModelTier as ModelTier,
  };

  // ------------------------------------------------------------------
  // Parse ## service
  // ------------------------------------------------------------------
  const serviceBlock = sections.get("service")!;
  const serviceKV = parseKeyValueBlock(serviceBlock);

  const description = serviceKV.get("description") ?? "";

  if (description.length < MIN_DESCRIPTION_CHARS) {
    errors.push({
      field: "service.description",
      message: `description should be at least ${MIN_DESCRIPTION_CHARS} characters (got ${description.length}).`,
      blocking: false,
    });
  }

  // Parse accepts / rejects lists directly from the raw block
  // (they are YAML block lists, not key:value pairs)
  const acceptsMatch = serviceBlock.match(
    /^accepts\s*:\s*\n((?:[ \t]*-[ \t]+[^\n]+\n?)+)/m
  );
  const rejectsMatch = serviceBlock.match(
    /^rejects\s*:\s*\n((?:[ \t]*-[ \t]+[^\n]+\n?)+)/m
  );

  const accepts = acceptsMatch ? parseBulletList(acceptsMatch[1]) : [];
  const rejects = rejectsMatch ? parseBulletList(rejectsMatch[1]) : [];

  const service: SkillService = { description, accepts, rejects };

  // ------------------------------------------------------------------
  // Parse ## output_format
  // ------------------------------------------------------------------
  const outputBlock = sections.get("output_format")!;
  const outputSchema = extractJsonBlock(outputBlock);

  if (!outputSchema) {
    errors.push({
      field: "output_format",
      message: "output_format section must contain a valid JSON object or array.",
      blocking: true,
    });
    return { skill: null, errors };
  }

  try {
    JSON.parse(outputSchema);
  } catch {
    errors.push({
      field: "output_format",
      message: "output_format JSON is not valid.",
      blocking: true,
    });
    return { skill: null, errors };
  }

  // ------------------------------------------------------------------
  // Parse ## examples
  // ------------------------------------------------------------------
  const examplesBlock = sections.get("examples")!;
  const examples = parseExamples(examplesBlock);

  if (examples.length < MIN_EXAMPLES) {
    errors.push({
      field: "examples",
      message: `At least ${MIN_EXAMPLES} examples are required (found ${examples.length}).`,
      blocking: true,
    });
    return { skill: null, errors };
  }

  // ------------------------------------------------------------------
  // Parse ## escalate_if (optional section)
  // ------------------------------------------------------------------
  const escalateBlock = sections.get("escalate_if") ?? "";
  const escalatePatterns = escalateBlock
    ? parseBulletList(escalateBlock)
    : [];

  // ------------------------------------------------------------------
  // Build system prompt
  // ------------------------------------------------------------------
  const system_prompt = buildSystemPrompt(
    meta,
    service,
    outputSchema,
    examples,
    escalatePatterns
  );

  // ------------------------------------------------------------------
  // Return success
  // ------------------------------------------------------------------
  const skill: ParsedSkill = {
    meta,
    service,
    output_schema: outputSchema,
    examples,
    escalate_patterns: escalatePatterns,
    system_prompt,
  };

  return { skill, errors };
}
