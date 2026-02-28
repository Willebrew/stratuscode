import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHmac } from "crypto";

/**
 * GET /api/auth/me
 *
 * Returns the current user from locally-stored signed cookies.
 * No external calls — reads the user data cookie set during SSO.
 */
export async function GET() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    return NextResponse.json({ user: null });
  }

  const cookieStore = await cookies();

  // Verify session token exists and is valid
  const sessionRaw =
    cookieStore.get("__Secure-better-auth.session_token")?.value ||
    cookieStore.get("better-auth.session_token")?.value;

  if (!sessionRaw || !verifySigned(sessionRaw, secret)) {
    return NextResponse.json({ user: null });
  }

  // Read user data cookie
  const userRaw =
    cookieStore.get("__Secure-stratuscode.user")?.value ||
    cookieStore.get("stratuscode.user")?.value;

  if (!userRaw) {
    return NextResponse.json({ user: null });
  }

  const userPayload = verifySigned(userRaw, secret);
  if (!userPayload) {
    return NextResponse.json({ user: null });
  }

  try {
    const user = JSON.parse(Buffer.from(userPayload, "base64").toString());
    return NextResponse.json({ user });
  } catch {
    return NextResponse.json({ user: null });
  }
}

function verifySigned(raw: string, secret: string): string | null {
  const lastDot = raw.lastIndexOf(".");
  if (lastDot === -1) return null;

  const payload = raw.substring(0, lastDot);
  const sig = raw.substring(lastDot + 1);
  const expected = createHmac("sha256", secret)
    .update(payload)
    .digest("base64");

  if (sig !== expected) return null;
  return payload;
}
