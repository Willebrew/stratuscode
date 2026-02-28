import { NextRequest, NextResponse } from "next/server";

const NQL_AUTH_URL =
  process.env.NQL_AUTH_URL || "https://auth.neuroquestlabs.ai";

/**
 * Proxy Better Auth API requests to the central nql-auth service.
 * This avoids needing direct PostgreSQL access from Vercel.
 *
 * Handles: get-session, sign-out, and any other Better Auth endpoints
 * that authClient calls.
 */
async function proxyToNqlAuth(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  // e.g. /api/auth/get-session → /api/auth/get-session
  const targetUrl = `${NQL_AUTH_URL}${url.pathname}${url.search}`;

  const headers = new Headers();
  // Forward the session cookie
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);
  headers.set("content-type", request.headers.get("content-type") || "application/json");

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
