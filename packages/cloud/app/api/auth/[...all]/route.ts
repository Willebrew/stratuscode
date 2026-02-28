import { NextRequest, NextResponse } from "next/server";

const NQL_AUTH_URL =
  process.env.NQL_AUTH_URL || "https://auth.neuroquestlabs.ai";

/**
 * Proxy Better Auth API requests to nql-auth.
 *
 * authClient (baseURL = window.location.origin) makes requests like:
 *   GET /api/auth/get-session
 *   POST /api/auth/sign-out
 *
 * Specific routes (sso, logout, session, codex/*) take priority over
 * this catch-all. Everything else is proxied to nql-auth with the
 * signed session cookie forwarded as-is (same BETTER_AUTH_SECRET).
 */
async function proxyToNqlAuth(request: NextRequest) {
  // Read local signed cookie — forward as-is since nql-auth shares
  // the same BETTER_AUTH_SECRET and expects HMAC-signed cookies.
  const signedToken =
    request.cookies.get("__Secure-better-auth.session_token")?.value ||
    request.cookies.get("better-auth.session_token")?.value;

  // Build the nql-auth URL with the same path
  const url = new URL(
    request.nextUrl.pathname + request.nextUrl.search,
    NQL_AUTH_URL
  );

  // Build headers for the upstream request
  const headers: HeadersInit = {};
  const contentType = request.headers.get("content-type");
  if (contentType) headers["Content-Type"] = contentType;

  // nql-auth validates trustedOrigins via the Origin header
  const origin =
    request.headers.get("origin") ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://stratuscode.dev";
  headers["Origin"] = origin;

  // Forward the signed session cookie to nql-auth
  if (signedToken) {
    headers["Cookie"] = `better-auth.session_token=${signedToken}`;
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
