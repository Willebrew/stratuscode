import { query, mutation, internalMutation } from "./_generated/server";
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
    thinkingSeconds: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("messages", {
      sessionId: args.sessionId,
      role: args.role,
      content: args.content,
      parts: args.parts,
      createdAt: Date.now(),
      ...(args.thinkingSeconds !== undefined ? { thinkingSeconds: args.thinkingSeconds } : {}),
    });
    return id;
  },
});

// Public mutation for user messages — called from frontend for instant subscription updates
export const sendUserMessage = mutation({
  args: {
    sessionId: v.id("sessions"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("messages", {
      sessionId: args.sessionId,
      role: "user",
      content: args.content,
      parts: [{ type: "text", content: args.content }],
      createdAt: Date.now(),
    });
    return id;
  },
});

// Truncate conversation from a specific message onward.
// Used by retry (delete assistant message + after) and edit (delete user message + after).
// Rebuilds agent_state from remaining messages and cleans up attachments + feedback.
export const truncateFromMessage = mutation({
  args: {
    sessionId: v.id("sessions"),
    messageId: v.id("messages"),
    inclusive: v.boolean(), // true = delete this message too; false = keep it
  },
  handler: async (ctx, args) => {
    const target = await ctx.db.get(args.messageId);
    if (!target || target.sessionId !== args.sessionId) {
      throw new Error("Message not found in this session");
    }

    const allMessages = await ctx.db
      .query("messages")
      .withIndex("by_sessionId_createdAt", (q) => q.eq("sessionId", args.sessionId))
      .order("asc")
      .collect();

    const targetIdx = allMessages.findIndex((m) => m._id === args.messageId);
    if (targetIdx === -1) throw new Error("Message not found");

    const deleteFrom = args.inclusive ? targetIdx : targetIdx + 1;
    const toDelete = allMessages.slice(deleteFrom);
    const remaining = allMessages.slice(0, deleteFrom);

    // Delete messages
    for (const msg of toDelete) {
      await ctx.db.delete(msg._id);
    }

    // Rebuild agent_state.sageMessages from remaining DB messages.
    // Simplified {role, content} pairs — SAGE rebuilds context via summarization.
    const agentState = await ctx.db
      .query("agent_state")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .unique();

    if (agentState) {
      const reconstructed = remaining.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));
      await ctx.db.patch(agentState._id, {
        sageMessages: JSON.stringify(reconstructed),
        existingSummary: undefined,
      });
    }

    // Delete attachments for removed messages
    for (const msg of toDelete) {
      const attachments = await ctx.db
        .query("attachments")
        .withIndex("by_messageId", (q) => q.eq("messageId", msg._id))
        .collect();
      for (const a of attachments) {
        await ctx.storage.delete(a.storageId);
        await ctx.db.delete(a._id);
      }
    }

    // Delete feedback for removed messages
    for (const msg of toDelete) {
      const feedbacks = await ctx.db
        .query("feedback")
        .withIndex("by_messageId", (q) => q.eq("messageId", msg._id))
        .collect();
      for (const f of feedbacks) {
        await ctx.db.delete(f._id);
      }
    }

    return { deletedCount: toDelete.length, remainingCount: remaining.length };
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
