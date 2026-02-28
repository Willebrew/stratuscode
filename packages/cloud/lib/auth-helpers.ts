import { cookies } from "next/headers";

const NQL_AUTH_URL =
  process.env.NQL_AUTH_URL || "https://auth.neuroquestlabs.ai";

/**
 * Server-side auth check. Reads the session cookie and validates
 * it against nql-auth.
 */
export async function isAuthenticated(): Promise<boolean> {
  const token = await getSessionToken();
  return !!token;
}

/**
 * Get the raw session token from the cookie.
 */
export async function getSessionToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("better-auth.session_token")?.value || null;
}

/**
 * Get the authenticated user's ID by querying nql-auth.
 */
export async function getUserId(): Promise<string | null> {
  const token = await getSessionToken();
  if (!token) return null;

  try {
    const res = await fetch(`${NQL_AUTH_URL}/api/auth/get-session`, {
      headers: {
        Cookie: `better-auth.session_token=${token}`,
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.user?.id || null;
  } catch {
    return null;
  }
}
