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
  args: { id: v.id("sessions"), title: v.string(), titleGenerated: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const patch: Record<string, any> = { title: args.title, updatedAt: Date.now() };
    if (args.titleGenerated) patch.titleGenerated = true;
    await ctx.db.patch(args.id, patch);
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
    // Set cancel flag AND status to idle for instant UI feedback.
    // Do NOT touch streaming state (isStreaming stays true) — this is critical:
    // the streaming content stays visible while the agent saves partial progress.
    // The agent will detect cancelRequested, save the partial message, then
    // call streaming.finish to cleanly transition to the persisted message.
    await ctx.db.patch(args.id, {
      cancelRequested: true,
      status: "idle",
      updatedAt: Date.now(),
    });
  },
});

/**
 * Hard-reset a session that got stuck (e.g., action failed before scheduling).
 * Unlike requestCancel (which just sets a flag for the agent to check), this
 * immediately sets status to idle and finishes streaming.
 */
export const forceReset = mutation({
  args: { id: v.id("sessions") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      cancelRequested: false,
      status: "idle",
      updatedAt: Date.now(),
    });
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

/**
 * Single mutation that prepares the session for a new agent turn.
 * Replaces 4-6 sequential mutations with one DB transaction.
 */
export const prepareSend = mutation({
  args: {
    id: v.id("sessions"),
    title: v.optional(v.string()),
    lastMessage: v.string(),
    agentMode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.id);
    const runId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const patch: Record<string, any> = {
      cancelRequested: false,
      status: "running",
      lastMessage: args.lastMessage,
      runId,
      updatedAt: Date.now(),
    };
    // Set truncated title as instant placeholder only on the FIRST message.
    // AI title replaces it later via updateTitle with titleGenerated=true.
    // After the first message, never overwrite (even if AI title gen fails).
    if (args.title && !session?.titleGenerated && !session?.lastMessage) {
      patch.title = args.title;
    }
    if (args.agentMode) patch.agent = args.agentMode;
    await ctx.db.patch(args.id, patch);

    // Initialize streaming state in the same transaction
    const existing = await ctx.db
      .query("streaming_state")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.id))
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
    // Always start with "waiting" — the agent will set "booting" if it
    // actually needs to create a fresh sandbox (which is slow).
    const initialStage = "waiting";
    await ctx.db.insert("streaming_state", {
      sessionId: args.id,
      content: "",
      reasoning: "",
      toolCalls: "[]",
      parts: "[]",
      stage: initialStage,
      isStreaming: true,
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

/**
 * Purge all data associated with a session (messages, events, todos, attachments, streaming state, agent state).
 */
export const purgeSessionData = internalMutation({
  args: { id: v.id("sessions") },
  handler: async (ctx, args) => {
    // Messages
    const messages = await ctx.db.query("messages").withIndex("by_sessionId", (q) => q.eq("sessionId", args.id)).collect();
    for (const m of messages) await ctx.db.delete(m._id);

    // Timeline events
    const events = await ctx.db.query("timeline_events").withIndex("by_sessionId", (q) => q.eq("sessionId", args.id)).collect();
    for (const e of events) await ctx.db.delete(e._id);

    // Todos
    const todos = await ctx.db.query("todos").withIndex("by_sessionId", (q) => q.eq("sessionId", args.id)).collect();
    for (const t of todos) await ctx.db.delete(t._id);

    // Attachments
    const attachments = await ctx.db.query("attachments").withIndex("by_sessionId", (q) => q.eq("sessionId", args.id)).collect();
    for (const a of attachments) {
      await ctx.storage.delete(a.storageId);
      await ctx.db.delete(a._id);
    }

    // Streaming state
    const streamingState = await ctx.db.query("streaming_state").withIndex("by_sessionId", (q) => q.eq("sessionId", args.id)).unique();
    if (streamingState) await ctx.db.delete(streamingState._id);

    // Agent state
    const agentState = await ctx.db.query("agent_state").withIndex("by_sessionId", (q) => q.eq("sessionId", args.id)).unique();
    if (agentState) await ctx.db.delete(agentState._id);

    // Session itself
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

export const updateModel = mutation({
  args: { id: v.id("sessions"), model: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      model: args.model,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Recover a session stuck in "running" state due to a transient action failure.
 *
 * When a Convex action crashes (transient error, OOM, timeout), the try/catch
 * cleanup in agent.ts never executes, leaving status="running" and
 * isStreaming=true forever.  The frontend calls this when it detects staleness
 * (no streaming activity for STALE_THRESHOLD_MS).
 */
const STALE_THRESHOLD_MS = 3 * 60 * 1000; // 3 minutes

export const recoverStaleSession = mutation({
  args: { id: v.id("sessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.id);
    if (!session || session.status !== "running") return false;

    // Check streaming_state heartbeat
    const streamingState = await ctx.db
      .query("streaming_state")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.id))
      .unique();

    const lastActivity = streamingState?.updatedAt ?? session.updatedAt;
    const elapsed = Date.now() - lastActivity;

    if (elapsed < STALE_THRESHOLD_MS) return false; // not stale yet

    // Reset session
    await ctx.db.patch(args.id, {
      status: "idle",
      cancelRequested: false,
      errorMessage: "Session recovered after agent timeout",
      updatedAt: Date.now(),
    });

    // Finish streaming
    if (streamingState && streamingState.isStreaming) {
      await ctx.db.patch(streamingState._id, {
        isStreaming: false,
        updatedAt: Date.now(),
      });
    }

    return true;
  },
});

/**
 * Cron-driven sweep that recovers ALL sessions stuck in "running".
 *
 * Uses the by_status index to efficiently find only running sessions,
 * then checks the streaming_state heartbeat to confirm staleness.
 * Runs every 2 minutes via convex/crons.ts — one invocation handles
 * every stuck session regardless of message volume.
 */
export const sweepStaleSessions = internalMutation({
  handler: async (ctx) => {
    const runningSessions = await ctx.db
      .query("sessions")
      .withIndex("by_status", (q) => q.eq("status", "running"))
      .collect();

    const now = Date.now();
    let recovered = 0;

    for (const session of runningSessions) {
      const streamingState = await ctx.db
        .query("streaming_state")
        .withIndex("by_sessionId", (q) => q.eq("sessionId", session._id))
        .unique();

      const lastActivity = streamingState?.updatedAt ?? session.updatedAt;
      const elapsed = now - lastActivity;

      if (elapsed < STALE_THRESHOLD_MS) continue; // still active

      await ctx.db.patch(session._id, {
        status: "idle",
        cancelRequested: false,
        errorMessage: "Session recovered after agent timeout",
        updatedAt: now,
      });

      if (streamingState?.isStreaming) {
        await ctx.db.patch(streamingState._id, {
          isStreaming: false,
          updatedAt: now,
        });
      }

      recovered++;
    }

    if (recovered > 0) {
      console.log(`[sweepStaleSessions] Recovered ${recovered} stale session(s)`);
    }
  },
});
