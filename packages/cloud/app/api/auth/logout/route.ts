import { NextRequest, NextResponse } from "next/server";
import { getSessionToken } from "@/lib/auth-helpers";

const NQL_AUTH_URL =
  process.env.NQL_AUTH_URL || "https://auth.neuroquestlabs.ai";

export async function POST(request: NextRequest) {
  // Get the raw token (HMAC stripped) and proxy sign-out to nql-auth
  const token = await getSessionToken();
  if (token) {
    try {
      await fetch(`${NQL_AUTH_URL}/api/auth/sign-out`, {
        method: "POST",
        headers: {
          cookie: `__Secure-better-auth.session_token=${token}`,
          "content-type": "application/json",
        },
        cache: "no-store",
      });
    } catch {
      // Best-effort — session cookie is cleared client-side regardless
    }
  }
  return NextResponse.json({ success: true });
}
