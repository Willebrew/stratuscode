import { cookies } from "next/headers";
import { createHmac } from "crypto";

/**
 * Server-side session verification for Better Auth SSO cookies.
 * Replaces simple-auth.ts for all API route auth checks.
 */

export async function getServerSession() {
  const cookieStore = await cookies();
  const raw =
    cookieStore.get("__Secure-better-auth.session_token")?.value ||
    cookieStore.get("better-auth.session_token")?.value;
  if (!raw) return null;

  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) return null;

  // Verify HMAC signature: "token.base64sig"
  const lastDot = raw.lastIndexOf(".");
  if (lastDot === -1) return null;
  const token = raw.substring(0, lastDot);
  const sig = raw.substring(lastDot + 1);
  const expected = createHmac("sha256", secret).update(token).digest("base64");
  if (sig !== expected) return null;

  return { authenticated: true, token, raw };
}

export async function isAuthenticated(): Promise<boolean> {
  const session = await getServerSession();
  return !!session;
}

/**
 * Get the authenticated user's ID.
 * First tries the local user data cookie, then falls back to nql-auth.
 */
export async function getUserId(): Promise<string | null> {
  const session = await getServerSession();
  if (!session) return null;

  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) return null;

  // Try local user data cookie first
  const cookieStore = await cookies();
  const userRaw =
    cookieStore.get("__Secure-stratuscode.user")?.value ||
    cookieStore.get("stratuscode.user")?.value;

  if (userRaw) {
    const lastDot = userRaw.lastIndexOf(".");
    if (lastDot !== -1) {
      const payload = userRaw.substring(0, lastDot);
      const sig = userRaw.substring(lastDot + 1);
      const expectedSig = createHmac("sha256", secret)
        .update(payload)
        .digest("base64");
      if (sig === expectedSig) {
        try {
          const userData = JSON.parse(
            Buffer.from(payload, "base64").toString("utf-8")
          );
          if (userData?.id) return userData.id;
        } catch {
          // Fall through to nql-auth
        }
      }
    }
  }

  // Fallback: fetch from nql-auth
  const nqlAuthUrl =
    process.env.NQL_AUTH_URL || "https://auth.neuroquestlabs.ai";

  try {
    const res = await fetch(`${nqlAuthUrl}/api/auth/get-session`, {
      headers: {
        Cookie: `better-auth.session_token=${session.raw}; __Secure-better-auth.session_token=${session.raw}`,
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.user?.id || null;
  } catch {
    return null;
  }
}
