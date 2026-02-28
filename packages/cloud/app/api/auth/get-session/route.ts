import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHmac } from "crypto";

/**
 * GET /api/auth/get-session
 *
 * Returns the authenticated user's session data by reading local cookies.
 * Both the session token and user data are stored as HMAC-signed cookies
 * set during SSO login. No external calls needed.
 */
export async function GET() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    return NextResponse.json({ user: null, session: null });
  }

  const cookieStore = await cookies();

  // 1. Verify session token cookie
  const sessionRaw =
    cookieStore.get("__Secure-better-auth.session_token")?.value ||
    cookieStore.get("better-auth.session_token")?.value;

  if (!sessionRaw) {
    return NextResponse.json({ user: null, session: null });
  }

  const lastDot = sessionRaw.lastIndexOf(".");
  if (lastDot === -1) {
    return NextResponse.json({ user: null, session: null });
  }

  const token = sessionRaw.substring(0, lastDot);
  const sig = sessionRaw.substring(lastDot + 1);
  const expectedSig = createHmac("sha256", secret)
    .update(token)
    .digest("base64");

  if (sig !== expectedSig) {
    return NextResponse.json({ user: null, session: null });
  }

  // 2. Read user data cookie
  const userRaw =
    cookieStore.get("__Secure-stratuscode.user")?.value ||
    cookieStore.get("stratuscode.user")?.value;

  if (!userRaw) {
    // Session is valid but no user data cookie — still authenticated
    return NextResponse.json({
      user: { id: token },
      session: { token },
    });
  }

  // Verify user data cookie signature
  const userLastDot = userRaw.lastIndexOf(".");
  if (userLastDot === -1) {
    return NextResponse.json({
      user: { id: token },
      session: { token },
    });
  }

  const userPayload = userRaw.substring(0, userLastDot);
  const userSig = userRaw.substring(userLastDot + 1);
  const expectedUserSig = createHmac("sha256", secret)
    .update(userPayload)
    .digest("base64");

  if (userSig !== expectedUserSig) {
    return NextResponse.json({
      user: { id: token },
      session: { token },
    });
  }

  try {
    const userData = JSON.parse(
      Buffer.from(userPayload, "base64").toString("utf-8")
    );
    return NextResponse.json({
      user: userData,
      session: { token },
    });
  } catch {
    return NextResponse.json({
      user: { id: token },
      session: { token },
    });
  }
}
