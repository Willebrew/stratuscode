import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function POST(request: NextRequest) {
  // Use Better Auth's sign-out to invalidate the session in PostgreSQL
  await auth.api.signOut({ headers: request.headers });
  return NextResponse.json({ success: true });
}
