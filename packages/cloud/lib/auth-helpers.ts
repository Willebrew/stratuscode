import { cookies } from "next/headers";
import { createHmac } from "crypto";

/**
 * Read the raw signed cookie value from the request.
 */
async function getRawCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  return (
    cookieStore.get("__Secure-better-auth.session_token")?.value ||
    cookieStore.get("better-auth.session_token")?.value ||
    null
  );
}

/**
 * Verify HMAC signature and extract the raw session token.
 */
function verifyAndExtractToken(raw: string): string | null {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) return null;

  const lastDot = raw.lastIndexOf(".");
  if (lastDot === -1) return null;

  const token = raw.substring(0, lastDot);
  const sig = raw.substring(lastDot + 1);
  const expected = createHmac("sha256", secret).update(token).digest("base64");

  if (sig !== expected) return null;
  return token;
}

/**
 * Server-side auth check. Reads and verifies the signed session cookie.
 */
export async function isAuthenticated(): Promise<boolean> {
  const token = await getSessionToken();
  return !!token;
}

/**
 * Get the verified raw session token from the cookie.
 */
export async function getSessionToken(): Promise<string | null> {
  const raw = await getRawCookie();
  if (!raw) return null;
  return verifyAndExtractToken(raw);
}

/**
 * Get the authenticated user's ID by calling the nql-auth session endpoint.
 * This avoids requiring direct PostgreSQL access from Vercel.
 */
export async function getUserId(): Promise<string | null> {
  const raw = await getRawCookie();
  if (!raw) return null;

  const token = verifyAndExtractToken(raw);
  if (!token) return null;

  const nqlAuthUrl =
    process.env.NQL_AUTH_URL || "https://auth.neuroquestlabs.ai";

  try {
    const res = await fetch(`${nqlAuthUrl}/api/auth/get-session`, {
      headers: {
        Cookie: `__Secure-better-auth.session_token=${raw}`,
      },
      cache: "no-store",
    });

    if (!res.ok) return null;

    const data = await res.json();
    return data?.user?.id ?? null;
  } catch (e) {
    console.error("[getUserId] nql-auth request failed:", e);
    return null;
  }
}
