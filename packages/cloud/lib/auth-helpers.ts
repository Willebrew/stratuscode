import { cookies } from "next/headers";
import { createHmac } from "crypto";
import { prisma } from "@/lib/prisma";

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
 * Get the authenticated user's ID by querying the shared PostgreSQL database.
 */
export async function getUserId(): Promise<string | null> {
  const raw = await getRawCookie();
  if (!raw) {
    console.log("[getUserId] No raw cookie found");
    return null;
  }

  const token = verifyAndExtractToken(raw);
  if (!token) {
    console.log("[getUserId] HMAC verification failed. Secret present:", !!process.env.BETTER_AUTH_SECRET, "cookie length:", raw.length);
    return null;
  }

  console.log("[getUserId] Token verified, querying DB...");

  try {
    const session = await prisma.session.findUnique({
      where: { token },
      select: { userId: true, expiresAt: true },
    });

    console.log("[getUserId] DB result: found:", !!session, "expired:", session ? session.expiresAt < new Date() : "N/A");

    if (!session || session.expiresAt < new Date()) return null;
    return session.userId;
  } catch (e) {
    console.error("[getUserId] DB error:", e);
    return null;
  }
}
