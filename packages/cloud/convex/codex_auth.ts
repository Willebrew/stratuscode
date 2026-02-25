import { mutation, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

/**
 * Save (upsert) Codex OAuth tokens for a user.
 * Called by the frontend after device auth completes.
 */
export const save = mutation({
  args: {
    userId: v.string(),
    accessToken: v.string(),
    refreshToken: v.string(),
    accountId: v.optional(v.string()),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("codex_auth")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();

    const data = {
      userId: args.userId,
      accessToken: args.accessToken,
      refreshToken: args.refreshToken,
      accountId: args.accountId,
      expiresAt: args.expiresAt,
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, data);
    } else {
      await ctx.db.insert("codex_auth", data);
    }
  },
});

/**
 * Read Codex tokens for a user (internal — used by the agent action).
 */
export const get = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("codex_auth")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
  },
});

/**
 * Update tokens after a refresh (internal — used by the agent action).
 */
export const updateTokens = internalMutation({
  args: {
    userId: v.string(),
    accessToken: v.string(),
    refreshToken: v.string(),
    accountId: v.optional(v.string()),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("codex_auth")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        accessToken: args.accessToken,
        refreshToken: args.refreshToken,
        accountId: args.accountId,
        expiresAt: args.expiresAt,
        updatedAt: Date.now(),
      });
    }
  },
});

/**
 * Delete Codex tokens for a user (for logout).
 */
export const remove = mutation({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("codex_auth")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});
