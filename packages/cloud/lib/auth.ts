import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@/lib/prisma";

/**
 * Minimal Better Auth config for StratusCode.
 *
 * This instance connects to the shared PostgreSQL database (same as nql-auth
 * and Jottly) to validate sessions in real-time. It does NOT handle signup,
 * email/password, social providers, or any write-path auth — all of that is
 * managed by nql-auth. This config exists solely so that:
 *
 * 1. `authClient.useSession()` can hit `/api/auth/get-session` locally
 * 2. The local handler reads the session token cookie and validates it
 *    against the shared `session` table in PostgreSQL
 */
export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),

  secret: process.env.BETTER_AUTH_SECRET!,

  baseURL:
    process.env.BETTER_AUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000",

  appName: "StratusCode",

  trustedOrigins: (() => {
    const origins: string[] = [];

    if (process.env.NEXT_PUBLIC_APP_URL) {
      origins.push(process.env.NEXT_PUBLIC_APP_URL);
    }
    if (process.env.BETTER_AUTH_URL) {
      origins.push(process.env.BETTER_AUTH_URL);
    }
    if (process.env.VERCEL_URL) {
      origins.push(`https://${process.env.VERCEL_URL}`);
    }
    if (process.env.NEXT_PUBLIC_VERCEL_URL) {
      origins.push(`https://${process.env.NEXT_PUBLIC_VERCEL_URL}`);
    }
    if (process.env.NODE_ENV !== "production") {
      origins.push("http://localhost:3000", "http://localhost:3001");
    }

    return origins;
  })(),

  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days (match nql-auth)
    updateAge: 60 * 60 * 24, // Refresh after 1 day
    cookieCache: {
      enabled: true,
      maxAge: 15 * 60, // 15 minutes — reduces DB lookups
    },
  },
});

export type Session = typeof auth.$Infer.Session;
export type User = Session["user"];
