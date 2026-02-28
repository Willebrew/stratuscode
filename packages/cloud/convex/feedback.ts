import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// Get all feedback for a session (batch load for message-list)
export const listForSession = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("feedback")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .collect();
  },
});

// Toggle rating: set, change, or remove
export const setRating = mutation({
  args: {
    messageId: v.id("messages"),
    sessionId: v.id("sessions"),
    userId: v.string(),
    rating: v.string(), // 'up' | 'down'
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("feedback")
      .withIndex("by_messageId", (q) => q.eq("messageId", args.messageId))
      .unique();

    if (existing) {
      if (existing.rating === args.rating) {
        // Same rating clicked again — toggle off
        await ctx.db.delete(existing._id);
        return null;
      } else {
        // Different rating — update
        await ctx.db.patch(existing._id, {
          rating: args.rating,
          comment: undefined, // clear comment when switching rating
          createdAt: Date.now(),
        });
        return existing._id;
      }
    } else {
      // New rating
      return await ctx.db.insert("feedback", {
        messageId: args.messageId,
        sessionId: args.sessionId,
        userId: args.userId,
        rating: args.rating,
        createdAt: Date.now(),
      });
    }
  },
});

// Add comment to existing feedback
export const addComment = mutation({
  args: {
    messageId: v.id("messages"),
    comment: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("feedback")
      .withIndex("by_messageId", (q) => q.eq("messageId", args.messageId))
      .unique();
    if (!existing) return;
    await ctx.db.patch(existing._id, { comment: args.comment });
  },
});
