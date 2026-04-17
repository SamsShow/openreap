import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { parseSkillMd } from "@/lib/skill-parser";
import { callLLM, type ModelKey } from "@/lib/llm";

const MODEL_TIER_MAP: Record<string, ModelKey> = {
  standard: "openrouter-free",
  pro: "claude-haiku",
};

export async function POST(req: NextRequest) {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { skillMd } = body;

  // Validate skillMd
  if (!skillMd || typeof skillMd !== "string") {
    return NextResponse.json(
      { error: "skillMd is required and must be a string" },
      { status: 400 }
    );
  }

  if (new TextEncoder().encode(skillMd).length > 100 * 1024) {
    return NextResponse.json(
      { error: "skillMd exceeds 100KB limit" },
      { status: 400 }
    );
  }

  // Parse the skill markdown
  const { skill, errors } = parseSkillMd(skillMd);

  if (!skill) {
    return NextResponse.json({ errors }, { status: 422 });
  }

  // Generate slug from skill name
  const slug = skill.meta.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  // Run a test job
  const modelKey = MODEL_TIER_MAP[skill.meta.model_tier] ?? "openrouter-free";
  const testResult = await callLLM(
    skill.system_prompt,
    skill.examples[0].input,
    modelKey
  );

  // Insert agent into DB (upsert on slug)
  const priceCents = Math.round(skill.meta.price_usdc * 100);
  const parsedSkillJson = JSON.stringify(skill);

  const rows = await sql`
    INSERT INTO agents (
      owner_id, slug, name, description, category, price_cents,
      model, skill_md, parsed_skill, system_prompt,
      is_live, is_reap_agent, status, jobs_completed,
      reputation_score, avg_rating
    ) VALUES (
      ${user.id}, ${slug}, ${skill.meta.name}, ${skill.service.description},
      ${skill.meta.category}, ${priceCents}, ${skill.meta.model_tier},
      ${skillMd}, ${parsedSkillJson}::jsonb, ${skill.system_prompt},
      false, false, 'draft', 0, 0, 0
    )
    ON CONFLICT (slug) DO UPDATE SET
      owner_id = ${user.id},
      name = ${skill.meta.name},
      description = ${skill.service.description},
      category = ${skill.meta.category},
      price_cents = ${priceCents},
      model = ${skill.meta.model_tier},
      skill_md = ${skillMd},
      parsed_skill = ${parsedSkillJson}::jsonb,
      system_prompt = ${skill.system_prompt},
      status = 'draft',
      updated_at = now()
    RETURNING *
  `;

  const agent = rows[0];

  // Separate blocking errors (none if we got here) from warnings
  const warnings = errors.filter((e) => !e.blocking);

  return NextResponse.json({ agent, parsed: skill, warnings, testResult });
}
