import { NextRequest, NextResponse } from "next/server";

const NQL_AUTH_URL =
  process.env.NQL_AUTH_URL || "https://auth.neuroquestlabs.ai";

/**
 * Debug endpoint — traces the full auth flow to find where it breaks.
 * DELETE THIS after debugging.
 */
export async function GET(request: NextRequest) {
  const debug: Record<string, unknown> = {};

  // 1. What cookies does the browser send?
  const secureCookie = request.cookies.get(
    "__Secure-better-auth.session_token"
  )?.value;
  const plainCookie = request.cookies.get(
    "better-auth.session_token"
  )?.value;

  debug.cookies = {
    "__Secure-better-auth.session_token": secureCookie
      ? `${secureCookie.substring(0, 20)}...`
      : null,
    "better-auth.session_token": plainCookie
      ? `${plainCookie.substring(0, 20)}...`
      : null,
    allCookieNames: request.cookies.getAll().map((c) => c.name),
  };

  const signedToken = secureCookie || plainCookie;
  debug.hasSignedToken = !!signedToken;

  // 2. What does the proxy URL look like?
  const proxyUrl = new URL("/api/auth/get-session", NQL_AUTH_URL);
  debug.proxyUrl = proxyUrl.toString();

  // 3. What does nql-auth return when we forward the cookie?
  if (signedToken) {
    try {
      const res = await fetch(proxyUrl.toString(), {
        method: "GET",
        headers: {
          Cookie: `better-auth.session_token=${signedToken}`,
          Origin: "https://stratuscode.dev",
        },
      });
      const text = await res.text();
      debug.nqlAuthResponse = {
        status: res.status,
        body: text.substring(0, 500),
        headers: Object.fromEntries(res.headers.entries()),
      };
    } catch (e) {
      debug.nqlAuthResponse = {
        error: String(e),
      };
    }

    // 4. Also try with raw token (in case nql-auth doesn't expect HMAC)
    const lastDot = signedToken.lastIndexOf(".");
    if (lastDot !== -1) {
      const rawToken = signedToken.substring(0, lastDot);
      try {
        const res2 = await fetch(proxyUrl.toString(), {
          method: "GET",
          headers: {
            Cookie: `better-auth.session_token=${rawToken}`,
            Origin: "https://stratuscode.dev",
          },
        });
        const text2 = await res2.text();
        debug.nqlAuthResponseRaw = {
          status: res2.status,
          body: text2.substring(0, 500),
        };
      } catch (e) {
        debug.nqlAuthResponseRaw = {
          error: String(e),
        };
      }
    }
  } else {
    debug.nqlAuthResponse = "skipped - no cookie";
  }

  // 5. Check env vars
  debug.env = {
    NQL_AUTH_URL: process.env.NQL_AUTH_URL ? "set" : "NOT SET",
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ? "set" : "NOT SET",
    NEXT_PUBLIC_NQL_AUTH_URL: process.env.NEXT_PUBLIC_NQL_AUTH_URL
      ? "set"
      : "NOT SET",
    NODE_ENV: process.env.NODE_ENV,
  };

  return NextResponse.json(debug, { status: 200 });
}
