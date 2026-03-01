import { NextResponse } from "next/server";
import { getSessionToken } from "@/lib/auth-helpers";

const NQL_AUTH_URL =
  process.env.NQL_AUTH_URL || "https://auth.neuroquestlabs.ai";

/**
 * GET /api/auth/session
 *
 * Validates the HMAC-signed session cookie and returns user data.
 * Calls nql-auth's /api/sso/session endpoint with the raw token
 * (avoids needing direct PostgreSQL access from Vercel).
 */
export async function GET() {
  const token = await getSessionToken();
  if (!token) {
    return NextResponse.json(null);
  }

  try {
    const res = await fetch(`${NQL_AUTH_URL}/api/sso/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json(null);
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(null, { status: 500 });
  }
}
