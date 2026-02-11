import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";

// ─── Queries ───

export const list = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sessions")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .order("desc")
      .collect();
  },
});

export const get = query({
  args: { id: v.id("sessions") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getInternal = internalQuery({
  args: { id: v.id("sessions") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// ─── Mutations ───

export const create = mutation({
  args: {
    userId: v.string(),
    owner: v.string(),
    repo: v.string(),
    branch: v.string(),
    agent: v.optional(v.string()),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const sessionId = await ctx.db.insert("sessions", {
      userId: args.userId,
      owner: args.owner,
      repo: args.repo,
      branch: args.branch,
      sessionBranch: "",
      agent: args.agent ?? "build",
      model: args.model ?? "gpt-5-mini",
      status: "idle",
      title: `${args.owner}/${args.repo}`,
      lastMessage: "",
      tokenUsage: { input: 0, output: 0 },
      cancelRequested: false,
      createdAt: now,
      updatedAt: now,
    });
    return sessionId;
  },
});

export const updateStatus = internalMutation({
  args: {
    id: v.id("sessions"),
    status: v.string(),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, any> = {
      status: args.status,
      updatedAt: Date.now(),
    };
    if (args.errorMessage !== undefined) {
      patch.errorMessage = args.errorMessage;
    }
    await ctx.db.patch(args.id, patch);
  },
});

export const updateTitle = internalMutation({
  args: { id: v.id("sessions"), title: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { title: args.title, updatedAt: Date.now() });
  },
});

export const updateLastMessage = internalMutation({
  args: { id: v.id("sessions"), lastMessage: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      lastMessage: args.lastMessage,
      updatedAt: Date.now(),
    });
  },
});

export const setSandboxId = internalMutation({
  args: { id: v.id("sessions"), sandboxId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      sandboxId: args.sandboxId,
      updatedAt: Date.now(),
    });
  },
});

export const setSnapshotId = internalMutation({
  args: { id: v.id("sessions"), snapshotId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      snapshotId: args.snapshotId,
      updatedAt: Date.now(),
    });
  },
});

export const setSessionBranch = internalMutation({
  args: { id: v.id("sessions"), sessionBranch: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      sessionBranch: args.sessionBranch,
      updatedAt: Date.now(),
    });
  },
});

export const requestCancel = mutation({
  args: { id: v.id("sessions") },
  handler: async (ctx, args) => {
    // Set cancel flag AND immediately update status so UI responds instantly.
    // The background action will stop at its next cancellation check.
    await ctx.db.patch(args.id, {
      cancelRequested: true,
      status: "idle",
      updatedAt: Date.now(),
    });

    // Also finish streaming so the UI stops showing the streaming indicator
    const streamingState = await ctx.db
      .query("streaming_state")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.id))
      .unique();
    if (streamingState && streamingState.isStreaming) {
      await ctx.db.patch(streamingState._id, {
        isStreaming: false,
        updatedAt: Date.now(),
      });
    }
  },
});

export const clearCancel = internalMutation({
  args: { id: v.id("sessions") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      cancelRequested: false,
      updatedAt: Date.now(),
    });
  },
});

export const updateTokenUsage = internalMutation({
  args: {
    id: v.id("sessions"),
    inputTokens: v.number(),
    outputTokens: v.number(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.id);
    if (!session) return;
    await ctx.db.patch(args.id, {
      tokenUsage: {
        input: session.tokenUsage.input + args.inputTokens,
        output: session.tokenUsage.output + args.outputTokens,
      },
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("sessions") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

export const markHasChanges = internalMutation({
  args: { id: v.id("sessions") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      hasChanges: true,
      updatedAt: Date.now(),
    });
  },
});

export const updateAgent = internalMutation({
  args: { id: v.id("sessions"), agent: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      agent: args.agent,
      updatedAt: Date.now(),
    });
  },
});
