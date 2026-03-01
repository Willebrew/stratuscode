import { NextResponse } from "next/server";

/**
 * Catch-all for Better Auth API routes.
 * Session validation is handled by /api/auth/session instead.
 * This catch-all returns 404 for any unhandled Better Auth paths.
 */
export async function GET() {
  return NextResponse.json(null, { status: 404 });
}

export async function POST() {
  return NextResponse.json(null, { status: 404 });
}
