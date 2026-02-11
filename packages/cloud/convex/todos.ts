import { query, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("todos")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .collect();
  },
});

export const listInternal = internalQuery({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("todos")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .collect();
  },
});

export const replace = internalMutation({
  args: {
    sessionId: v.id("sessions"),
    todos: v.array(
      v.object({
        content: v.string(),
        status: v.optional(v.string()),
        priority: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    // Delete all existing todos for this session
    const existing = await ctx.db
      .query("todos")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .collect();
    for (const todo of existing) {
      await ctx.db.delete(todo._id);
    }
    // Insert new todos
    const now = Date.now();
    for (const todo of args.todos) {
      await ctx.db.insert("todos", {
        sessionId: args.sessionId,
        content: todo.content,
        status: todo.status ?? "pending",
        priority: todo.priority,
        createdAt: now,
      });
    }
  },
});

export const updateStatus = internalMutation({
  args: {
    id: v.id("todos"),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { status: args.status });
  },
});
