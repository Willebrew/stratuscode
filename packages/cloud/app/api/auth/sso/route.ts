import { NextRequest, NextResponse } from "next/server";

const NQL_AUTH_URL =
  process.env.NQL_AUTH_URL || "https://auth.neuroquestlabs.ai";

const NEXT_PUBLIC_NQL_AUTH_URL =
  process.env.NEXT_PUBLIC_NQL_AUTH_URL || "https://auth.neuroquestlabs.ai";

/**
 * GET /api/auth/sso?code=XXX&redirect=/chat
 *
 * SSO callback endpoint. Called by nql-auth after successful login.
 * Exchanges the one-time SSO code for a session token, sets the cookie,
 * and redirects to the final path.
 *
 * Matches the pattern used by neuroquest-labs-site.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const redirectPath = searchParams.get("redirect") || "/chat";

  if (!code) {
    return NextResponse.redirect(new URL("/login", NEXT_PUBLIC_NQL_AUTH_URL));
  }

  try {
    // Exchange the one-time code for a session token
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

    // Build redirect response
    const redirectUrl = new URL(redirectPath, request.nextUrl.origin);
    const res = NextResponse.redirect(redirectUrl);

    // Set session cookie — raw token, httpOnly: false so better-auth
    // client can read it. Matches neuroquest-labs-site pattern.
    res.cookies.set("better-auth.session_token", sessionToken, {
      httpOnly: false,
      secure: true,
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
