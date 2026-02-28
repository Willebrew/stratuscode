import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";

const NQL_AUTH_URL =
  process.env.NQL_AUTH_URL || "https://auth.neuroquestlabs.ai";

/**
 * Verify HMAC signature and extract the raw session token.
 */
function verifyAndExtractToken(raw: string): string | null {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) return null;

  const lastDot = raw.lastIndexOf(".");
  if (lastDot === -1) return null;

  const token = raw.substring(0, lastDot);
  const sig = raw.substring(lastDot + 1);
  const expected = createHmac("sha256", secret).update(token).digest("base64");

  if (sig !== expected) return null;
  return token;
}

/**
 * Proxy Better Auth API requests to nql-auth.
 *
 * authClient (baseURL = window.location.origin) makes requests like:
 *   GET /api/auth/get-session
 *   POST /api/auth/sign-out
 *
 * Specific routes (sso, logout, session, codex/*) take priority over
 * this catch-all. Everything else is proxied to nql-auth with the
 * verified session token forwarded as a cookie.
 */
async function proxyToNqlAuth(request: NextRequest) {
  // Read local signed cookie
  const raw =
    request.cookies.get("__Secure-better-auth.session_token")?.value ||
    request.cookies.get("better-auth.session_token")?.value;

  let rawToken: string | null = null;
  if (raw) {
    rawToken = verifyAndExtractToken(raw);
  }

  // Build the nql-auth URL with the same path
  const url = new URL(
    request.nextUrl.pathname + request.nextUrl.search,
    NQL_AUTH_URL
  );

  // Build headers for the upstream request
  const headers: HeadersInit = {};
  const contentType = request.headers.get("content-type");
  if (contentType) headers["Content-Type"] = contentType;

  // Forward the raw session token as a cookie to nql-auth
  if (rawToken) {
    headers["Cookie"] = `better-auth.session_token=${rawToken}`;
  }

  const fetchOptions: RequestInit = {
    method: request.method,
    headers,
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    fetchOptions.body = await request.text();
  }

  try {
    const res = await fetch(url.toString(), fetchOptions);
    const data = await res.text();

    const responseHeaders: Record<string, string> = {};
    const resContentType = res.headers.get("content-type");
    if (resContentType) responseHeaders["Content-Type"] = resContentType;

    const response = new NextResponse(data, {
      status: res.status,
      headers: responseHeaders,
    });

    // If this was a sign-out request, also clear the local cookie
    if (request.nextUrl.pathname.includes("/sign-out")) {
      response.cookies.delete("__Secure-better-auth.session_token");
      response.cookies.delete("better-auth.session_token");
    }

    return response;
  } catch {
    return NextResponse.json({ user: null, session: null }, { status: 502 });
  }
}

export async function GET(request: NextRequest) {
  return proxyToNqlAuth(request);
}

export async function POST(request: NextRequest) {
  return proxyToNqlAuth(request);
}

export const runtime = "nodejs";
