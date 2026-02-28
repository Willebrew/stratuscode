import { NextRequest, NextResponse } from "next/server";

const NQL_AUTH_URL =
  process.env.NQL_AUTH_URL || "https://auth.neuroquestlabs.ai";

export async function POST(request: NextRequest) {
  // Proxy sign-out to nql-auth to invalidate the session in PostgreSQL
  try {
    await fetch(`${NQL_AUTH_URL}/api/auth/sign-out`, {
      method: "POST",
      headers: {
        cookie: request.headers.get("cookie") || "",
        "content-type": "application/json",
      },
      cache: "no-store",
    });
  } catch {
    // Best-effort — session cookie is cleared client-side regardless
  }
  return NextResponse.json({ success: true });
}
