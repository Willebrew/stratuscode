import { NextRequest, NextResponse } from "next/server";
import { verifyAndExtractToken } from "@/lib/auth-helpers";

const NQL_AUTH_URL =
  process.env.NQL_AUTH_URL || "https://auth.neuroquestlabs.ai";

const SESSION_COOKIE_NAMES = [
  "__Secure-better-auth.session_token",
  "better-auth.session_token",
];

/**
 * Proxy Better Auth API requests to the central nql-auth service.
 *
 * StratusCode's SSO route wraps the session token with an HMAC signature:
 *   cookie = {raw_token}.{hmac}
 * But nql-auth expects the raw token. So we strip the HMAC before forwarding.
 */
async function proxyToNqlAuth(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const targetUrl = `${NQL_AUTH_URL}${url.pathname}${url.search}`;

  // Build a new cookie string with the HMAC stripped from session tokens
  const cookies = request.cookies.getAll();
  const cookieParts: string[] = [];

  for (const c of cookies) {
    if (SESSION_COOKIE_NAMES.includes(c.name)) {
      const rawToken = verifyAndExtractToken(c.value);
      if (rawToken) {
        cookieParts.push(`${c.name}=${rawToken}`);
      }
    } else {
      cookieParts.push(`${c.name}=${c.value}`);
    }
  }

  const headers = new Headers();
  if (cookieParts.length > 0) {
    headers.set("cookie", cookieParts.join("; "));
  }
  const ct = request.headers.get("content-type");
  if (ct) headers.set("content-type", ct);

  const res = await fetch(targetUrl, {
    method: request.method,
    headers,
    body: request.method !== "GET" ? await request.text() : undefined,
    cache: "no-store",
  });

  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}

export async function GET(request: NextRequest) {
  return proxyToNqlAuth(request);
}

export async function POST(request: NextRequest) {
  return proxyToNqlAuth(request);
}
