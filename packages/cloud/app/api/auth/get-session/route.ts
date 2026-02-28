import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-helpers";

const NQL_AUTH_URL =
  process.env.NQL_AUTH_URL || "https://auth.neuroquestlabs.ai";

/**
 * GET /api/auth/get-session
 *
 * Returns the authenticated user's session data by proxying to nql-auth.
 * Used by AuthContext on the client to check authentication status.
 */
export async function GET() {
  const session = await getServerSession();

  if (!session) {
    return NextResponse.json({ user: null, session: null });
  }

  try {
    // Forward the full signed cookie to nql-auth for validation.
    // Send both cookie name variants so nql-auth finds it regardless
    // of whether it expects the __Secure- prefix or not.
    const res = await fetch(`${NQL_AUTH_URL}/api/auth/get-session`, {
      headers: {
        Cookie: `better-auth.session_token=${session.raw}; __Secure-better-auth.session_token=${session.raw}`,
      },
    });

    if (!res.ok) {
      console.error("[get-session] nql-auth returned", res.status);
      return NextResponse.json({ user: null, session: null });
    }

    const data = await res.json();

    if (!data?.user) {
      console.error("[get-session] nql-auth returned no user:", JSON.stringify(data));
      return NextResponse.json({ user: null, session: null });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("[get-session] proxy error:", err);
    return NextResponse.json({ user: null, session: null });
  }
}
