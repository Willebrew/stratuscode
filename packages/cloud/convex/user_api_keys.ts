import { mutation, query, internalQuery } from "./_generated/server";
import { v } from "convex/values";

/**
 * Save (upsert) an API key for a user + provider pair.
 * Called by the Settings page when a user enters their key.
 */
export const save = mutation({
  args: {
    userId: v.string(),
    provider: v.string(), // "openai" | "anthropic" | "openrouter" | "custom"
    apiKey: v.string(),
    baseUrl: v.optional(v.string()), // Only for "custom" provider
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("user_api_keys")
      .withIndex("by_userId_provider", (q) =>
        q.eq("userId", args.userId).eq("provider", args.provider)
      )
      .unique();

    const data = {
      userId: args.userId,
      provider: args.provider,
      apiKey: args.apiKey,
      baseUrl: args.baseUrl,
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, data);
    } else {
      await ctx.db.insert("user_api_keys", data);
    }
  },
});

/**
 * Read a user's API key for a provider (internal — used by the agent action).
 * Never exposed to the frontend.
 */
export const get = internalQuery({
  args: { userId: v.string(), provider: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("user_api_keys")
      .withIndex("by_userId_provider", (q) =>
        q.eq("userId", args.userId).eq("provider", args.provider)
      )
      .unique();
  },
});

/**
 * Return which providers the user has configured (no keys exposed).
 * Used by the Settings page to show status indicators.
 */
export const getConfigured = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const keys = await ctx.db
      .query("user_api_keys")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();

    return keys.map((k) => ({
      provider: k.provider,
      configured: true,
      hasBaseUrl: !!k.baseUrl,
    }));
  },
});

/**
 * Delete a user's API key for a provider.
 */
export const remove = mutation({
  args: { userId: v.string(), provider: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("user_api_keys")
      .withIndex("by_userId_provider", (q) =>
        q.eq("userId", args.userId).eq("provider", args.provider)
      )
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});
