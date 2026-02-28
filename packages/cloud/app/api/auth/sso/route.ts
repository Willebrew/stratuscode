import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";

const NQL_AUTH_URL =
  process.env.NQL_AUTH_URL || "https://auth.neuroquestlabs.ai";

const NEXT_PUBLIC_NQL_AUTH_URL =
  process.env.NEXT_PUBLIC_NQL_AUTH_URL || "https://auth.neuroquestlabs.ai";

function signCookieValue(value: string, secret: string): string {
  const signature = createHmac("sha256", secret)
    .update(value)
    .digest("base64");
  return `${value}.${signature}`;
}

/**
 * GET /api/auth/sso?code=XXX&redirect=/chat
 *
 * SSO callback endpoint. Called by nql-auth after successful login.
 * Exchanges the one-time SSO code for a session token, signs it
 * to match Better Auth's cookie format, and redirects to the final path.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const redirectPath = searchParams.get("redirect") || "/chat";

  if (!code) {
    return NextResponse.redirect(new URL("/login", NEXT_PUBLIC_NQL_AUTH_URL));
  }

  try {
    const response = await fetch(`${NQL_AUTH_URL}/api/sso/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });

    if (!response.ok) {
      const errorUrl = new URL("/login", NEXT_PUBLIC_NQL_AUTH_URL);
      errorUrl.searchParams.set(
        "error",
        "SSO authentication failed. Please try again."
      );
      return NextResponse.redirect(errorUrl);
    }

    const data = await response.json();
    const { sessionToken } = data;

    if (!sessionToken) {
      const errorUrl = new URL("/login", NEXT_PUBLIC_NQL_AUTH_URL);
      errorUrl.searchParams.set("error", "Invalid SSO response.");
      return NextResponse.redirect(errorUrl);
    }

    const secret = process.env.BETTER_AUTH_SECRET;
    if (!secret) {
      throw new Error("BETTER_AUTH_SECRET is not configured");
    }

    const signedToken = signCookieValue(sessionToken, secret);
    const redirectUrl = new URL(redirectPath, request.nextUrl.origin);
    const res = NextResponse.redirect(redirectUrl);

    const isSecure =
      request.nextUrl.protocol === "https:" ||
      process.env.NODE_ENV === "production";
    const cookieName = isSecure
      ? "__Secure-better-auth.session_token"
      : "better-auth.session_token";

    res.cookies.set(cookieName, signedToken, {
      httpOnly: true,
      secure: isSecure,
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
    });

    return res;
  } catch {
    const errorUrl = new URL("/login", NEXT_PUBLIC_NQL_AUTH_URL);
    errorUrl.searchParams.set(
      "error",
      "Authentication service unavailable. Please try again."
    );
    return NextResponse.redirect(errorUrl);
  }
}

export const runtime = "nodejs";
