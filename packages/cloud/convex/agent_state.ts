import { internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const get = internalQuery({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agent_state")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .unique();
  },
});

export const save = internalMutation({
  args: {
    sessionId: v.id("sessions"),
    sageMessages: v.string(),
    existingSummary: v.optional(v.string()),
    planFilePath: v.optional(v.string()),
    agentMode: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("agent_state")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        sageMessages: args.sageMessages,
        existingSummary: args.existingSummary,
        planFilePath: args.planFilePath,
        agentMode: args.agentMode,
      });
    } else {
      await ctx.db.insert("agent_state", {
        sessionId: args.sessionId,
        sageMessages: args.sageMessages,
        existingSummary: args.existingSummary,
        planFilePath: args.planFilePath,
        agentMode: args.agentMode,
      });
    }
  },
});

export const clear = internalMutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("agent_state")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});
