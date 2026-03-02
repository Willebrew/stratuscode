import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export const runtime = "nodejs";

/**
 * POST /api/auth/revoke-all-sessions
 * Revokes ALL sessions for the current user across all NQL apps.
 * Used during sign-out to ensure cross-app session invalidation.
 */
export async function POST() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await prisma.session.deleteMany({
      where: { userId: session.user.id },
    });

    console.log(
      `[AUTH] Revoked ${result.count} sessions for user ${session.user.id}`
    );

    return NextResponse.json({ success: true, revoked: result.count });
  } catch (error) {
    console.error("[AUTH] Failed to revoke all sessions:", error);
    return NextResponse.json(
      { error: "Failed to revoke sessions" },
      { status: 500 }
    );
  }
}
