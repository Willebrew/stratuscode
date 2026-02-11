import { query, internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("messages")
      .withIndex("by_sessionId_createdAt", (q) =>
        q.eq("sessionId", args.sessionId)
      )
      .order("asc")
      .collect();
  },
});

export const create = internalMutation({
  args: {
    sessionId: v.id("sessions"),
    role: v.string(),
    content: v.string(),
    parts: v.array(v.any()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("messages", {
      sessionId: args.sessionId,
      role: args.role,
      content: args.content,
      parts: args.parts,
      createdAt: Date.now(),
    });
    return id;
  },
});

export const updateParts = internalMutation({
  args: {
    id: v.id("messages"),
    parts: v.array(v.any()),
    content: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, any> = { parts: args.parts };
    if (args.content !== undefined) {
      patch.content = args.content;
    }
    await ctx.db.patch(args.id, patch);
  },
});
