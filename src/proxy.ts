import { NextResponse } from "next/server";
import type { NextRequest, NextFetchEvent } from "next/server";
import { jwtVerify } from "jose";
import { recordDailySession } from "./lib/admin/sessions";

const secret = new TextEncoder().encode(
  process.env.SESSION_SECRET || "openreap-session-secret-change-in-production"
);

const PROTECTED_PATHS = ["/dashboard", "/settings", "/queue"];
const SESSION_COOKIE = "reap_sid";
const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const BOT_UA = /bot|crawl|spider|preview|monitor|fetch|curl|wget/i;
const SKIP_PATH_PREFIXES = ["/_next/", "/api/", "/favicon", "/robots.txt", "/sitemap.xml"];
const SKIP_PATH_SUFFIXES = [".png", ".jpg", ".jpeg", ".svg", ".ico", ".webp", ".gif", ".css", ".js", ".map", ".woff", ".woff2", ".ttf"];

function shouldTrack(pathname: string, userAgent: string): boolean {
  if (BOT_UA.test(userAgent)) return false;
  if (SKIP_PATH_PREFIXES.some((p) => pathname.startsWith(p))) return false;
  if (SKIP_PATH_SUFFIXES.some((s) => pathname.endsWith(s))) return false;
  return true;
}

function newSessionId(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getUserIdFromSession(request: NextRequest): Promise<string | null> {
  const token = request.cookies.get("session")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

  if (isProtected) {
    const token = request.cookies.get("session")?.value;
    if (!token) {
      return NextResponse.redirect(new URL("/auth", request.url));
    }
    try {
      await jwtVerify(token, secret);
    } catch {
      return NextResponse.redirect(new URL("/auth", request.url));
    }
  }

  const userAgent = request.headers.get("user-agent") ?? "";
  if (!shouldTrack(pathname, userAgent)) {
    return NextResponse.next();
  }

  const existing = request.cookies.get(SESSION_COOKIE)?.value;
  const sessionId = existing ?? newSessionId();
  const response = NextResponse.next();

  if (!existing) {
    response.cookies.set({
      name: SESSION_COOKIE,
      value: sessionId,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_COOKIE_MAX_AGE,
    });
  }

  event.waitUntil(
    (async () => {
      const userId = await getUserIdFromSession(request);
      await recordDailySession({ sessionId, userId, firstPath: pathname });
    })()
  );

  return response;
}
