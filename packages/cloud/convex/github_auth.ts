import { mutation, query, internalQuery } from "./_generated/server";
import { v } from "convex/values";

/**
 * Save (upsert) GitHub OAuth token + identity for a user.
 * Called by the OAuth callback route after token exchange.
 */
export const save = mutation({
  args: {
    userId: v.string(),
    accessToken: v.string(),
    login: v.string(),
    githubId: v.number(),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("github_auth")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();

    const data = {
      userId: args.userId,
      accessToken: args.accessToken,
      login: args.login,
      githubId: args.githubId,
      name: args.name,
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, data);
    } else {
      await ctx.db.insert("github_auth", data);
    }
  },
});

/**
 * Read GitHub token for a user (internal — used by the agent action).
 */
export const get = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("github_auth")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
  },
});

/**
 * Read GitHub token for a user (public — used by Next.js API routes via ConvexHttpClient).
 * Returns full record including accessToken for server-side use.
 */
export const getForApi = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const record = await ctx.db
      .query("github_auth")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();

    if (!record) return null;

    return {
      accessToken: record.accessToken,
      login: record.login,
      githubId: record.githubId,
    };
  },
});

/**
 * Check if a user has connected GitHub (public — used by frontend).
 * Does NOT expose the access token.
 */
export const getStatus = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const record = await ctx.db
      .query("github_auth")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();

    if (!record) {
      return { connected: false };
    }

    return {
      connected: true,
      login: record.login,
    };
  },
});

/**
 * Delete GitHub token for a user (disconnect).
 */
export const remove = mutation({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("github_auth")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});
