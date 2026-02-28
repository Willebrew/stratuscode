import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-helpers";

const NQL_AUTH_URL =
  process.env.NQL_AUTH_URL || "https://auth.neuroquestlabs.ai";

/**
 * GET /api/auth/get-session
 *
 * Proxy for Better Auth's get-session endpoint.
 * authClient.useSession() calls this automatically.
 * We verify the local cookie signature, then forward the full signed
 * cookie to nql-auth which runs the actual Better Auth server.
 */
export async function GET() {
  const session = await getServerSession();

  if (!session) {
    return NextResponse.json(null);
  }

  try {
    // Forward the full signed cookie value so nql-auth can validate it
    const res = await fetch(`${NQL_AUTH_URL}/api/auth/get-session`, {
      headers: {
        Cookie: `better-auth.session_token=${session.raw}`,
      },
    });

    if (!res.ok) {
      return NextResponse.json(null);
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(null);
  }
}
