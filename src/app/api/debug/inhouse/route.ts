import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

type Probe = {
  step: string;
  ok: boolean;
  ms: number;
  detail?: unknown;
  error?: string;
};

async function timed<T>(
  step: string,
  fn: () => Promise<T>
): Promise<Probe & { data?: T }> {
  const start = Date.now();
  try {
    const data = await fn();
    return { step, ok: true, ms: Date.now() - start, data };
  } catch (err) {
    return {
      step,
      ok: false,
      ms: Date.now() - start,
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    };
  }
}

export async function GET() {
  const rawUrl = process.env.INHOUSE_LLM_URL ?? "";
  const model =
    process.env.INHOUSE_LLM_MODEL || "(INHOUSE_LLM_MODEL unset)";

  const report: {
    env: {
      inhouseUrlPresent: boolean;
      inhouseUrlLength: number;
      inhouseUrlStartsWithHttps: boolean;
      inhouseUrlTrailingWhitespace: boolean;
      inhouseUrlSample: string;
      model: string;
      openrouterKeyPresent: boolean;
    };
    probes: Probe[];
  } = {
    env: {
      inhouseUrlPresent: rawUrl.length > 0,
      inhouseUrlLength: rawUrl.length,
      inhouseUrlStartsWithHttps: rawUrl.startsWith("https://"),
      inhouseUrlTrailingWhitespace: rawUrl !== rawUrl.trim(),
      inhouseUrlSample: rawUrl
        ? `${rawUrl.slice(0, 24)}…${rawUrl.slice(-12)}`
        : "(empty)",
      model,
      openrouterKeyPresent: Boolean(process.env.OPENROUTER_API_KEY),
    },
    probes: [],
  };

  if (!rawUrl) {
    return NextResponse.json(report);
  }

  const url = rawUrl.trim();

  // Probe 1: /v1/models (lists loaded models)
  report.probes.push(
    await timed("GET /v1/models", async () => {
      const res = await fetch(`${url}/v1/models`, {
        headers: {
          "ngrok-skip-browser-warning": "true",
          "User-Agent": "OpenReap-Debug/1.0",
        },
        signal: AbortSignal.timeout(15_000),
      });
      const bodyText = await res.text();
      return {
        httpStatus: res.status,
        contentType: res.headers.get("content-type"),
        bodyStart: bodyText.slice(0, 400),
        bodyLength: bodyText.length,
      };
    })
  );

  // Probe 2: actual chat/completions with a trivial prompt
  report.probes.push(
    await timed("POST /v1/chat/completions (ping)", async () => {
      const res = await fetch(`${url}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
          "User-Agent": "OpenReap-Debug/1.0",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "reply with the JSON {\"ok\":true}" }],
          temperature: 0.1,
          max_tokens: 64,
        }),
        signal: AbortSignal.timeout(20_000),
      });
      const bodyText = await res.text();
      return {
        httpStatus: res.status,
        contentType: res.headers.get("content-type"),
        bodyStart: bodyText.slice(0, 600),
        bodyLength: bodyText.length,
      };
    })
  );

  return NextResponse.json(report);
}
