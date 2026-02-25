import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const get = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("streaming_state")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .unique();
  },
});

export const getInternal = internalQuery({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("streaming_state")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .unique();
  },
});

export const start = internalMutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    // Delete any existing streaming state for this session
    const existing = await ctx.db
      .query("streaming_state")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
    await ctx.db.insert("streaming_state", {
      sessionId: args.sessionId,
      content: "",
      reasoning: "",
      toolCalls: "[]",
      parts: "[]",
      isStreaming: true,
      updatedAt: Date.now(),
    });
  },
});

export const appendToken = internalMutation({
  args: { sessionId: v.id("sessions"), content: v.string() },
  handler: async (ctx, args) => {
    const state = await ctx.db
      .query("streaming_state")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .unique();
    if (!state) return;

    // Update ordered parts — append to last text part or create new one
    const parts = state.parts ? JSON.parse(state.parts) : [];
    const last = parts[parts.length - 1];
    if (last && last.type === "text") {
      last.content += args.content;
    } else {
      parts.push({ type: "text", content: args.content });
    }

    await ctx.db.patch(state._id, {
      content: state.content + args.content,
      parts: JSON.stringify(parts),
      updatedAt: Date.now(),
    });
  },
});

export const appendReasoning = internalMutation({
  args: { sessionId: v.id("sessions"), content: v.string() },
  handler: async (ctx, args) => {
    const state = await ctx.db
      .query("streaming_state")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .unique();
    if (!state) return;
    await ctx.db.patch(state._id, {
      reasoning: state.reasoning + args.content,
      updatedAt: Date.now(),
    });
  },
});

export const addToolCall = internalMutation({
  args: {
    sessionId: v.id("sessions"),
    toolCallId: v.string(),
    toolName: v.string(),
    toolArgs: v.string(),
  },
  handler: async (ctx, args) => {
    const state = await ctx.db
      .query("streaming_state")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .unique();
    if (!state) return;

    const toolCalls = JSON.parse(state.toolCalls);

    // If updateToolResult already added this tool call (race condition),
    // just update the name/args on the existing entry and skip adding a duplicate.
    const existing = toolCalls.find((t: any) => t.id === args.toolCallId);
    if (existing) {
      if (!existing.name) existing.name = args.toolName;
      if (!existing.args || existing.args === "") existing.args = args.toolArgs;

      // Also update in parts
      const parts = state.parts ? JSON.parse(state.parts) : [];
      for (const part of parts) {
        if (part.type === "tool_call" && part.toolCall?.id === args.toolCallId) {
          if (!part.toolCall.name) part.toolCall.name = args.toolName;
          if (!part.toolCall.args || part.toolCall.args === "") part.toolCall.args = args.toolArgs;
          break;
        }
      }

      await ctx.db.patch(state._id, {
        toolCalls: JSON.stringify(toolCalls),
        parts: JSON.stringify(parts),
        updatedAt: Date.now(),
      });
      return;
    }

    const toolCall = {
      id: args.toolCallId,
      name: args.toolName,
      args: args.toolArgs,
      status: "running",
    };

    toolCalls.push(toolCall);

    // Add to ordered parts
    const parts = state.parts ? JSON.parse(state.parts) : [];
    parts.push({ type: "tool_call", toolCall });

    await ctx.db.patch(state._id, {
      toolCalls: JSON.stringify(toolCalls),
      parts: JSON.stringify(parts),
      updatedAt: Date.now(),
    });
  },
});

export const updateToolResult = internalMutation({
  args: {
    sessionId: v.id("sessions"),
    toolCallId: v.string(),
    toolName: v.optional(v.string()),
    result: v.string(),
    toolArgs: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const state = await ctx.db
      .query("streaming_state")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .unique();
    if (!state) return;
    const toolCalls = JSON.parse(state.toolCalls);
    const tc = toolCalls.find((t: any) => t.id === args.toolCallId);
    if (tc) {
      tc.result = args.result;
      tc.status = "completed";
      if (args.toolArgs) tc.args = args.toolArgs;
    } else {
      // Race condition: onToolResult arrived before onToolCall's addToolCall
      // mutation committed (SAGE fires callbacks without awaiting them).
      // Add the tool call directly as completed so it doesn't stay stuck.
      toolCalls.push({
        id: args.toolCallId,
        name: args.toolName || "",
        args: args.toolArgs || "",
        result: args.result,
        status: "completed",
      });
    }

    // Also update in ordered parts
    const parts = state.parts ? JSON.parse(state.parts) : [];
    let foundInParts = false;
    for (const part of parts) {
      if (part.type === "tool_call" && part.toolCall?.id === args.toolCallId) {
        part.toolCall.result = args.result;
        part.toolCall.status = "completed";
        if (args.toolArgs) part.toolCall.args = args.toolArgs;
        foundInParts = true;
        break;
      }
    }
    if (!foundInParts) {
      // Same race condition — add to parts as completed
      parts.push({
        type: "tool_call",
        toolCall: {
          id: args.toolCallId,
          name: args.toolName || "",
          args: args.toolArgs || "",
          result: args.result,
          status: "completed",
        },
      });
    }

    await ctx.db.patch(state._id, {
      toolCalls: JSON.stringify(toolCalls),
      parts: JSON.stringify(parts),
      updatedAt: Date.now(),
    });
  },
});

export const setQuestion = internalMutation({
  args: {
    sessionId: v.id("sessions"),
    question: v.string(), // JSON of question data
  },
  handler: async (ctx, args) => {
    const state = await ctx.db
      .query("streaming_state")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .unique();
    if (!state) return;
    await ctx.db.patch(state._id, {
      pendingQuestion: args.question,
      pendingAnswer: undefined,
      updatedAt: Date.now(),
    });
  },
});

// Called by the frontend when user answers a question
export const answerQuestion = mutation({
  args: {
    sessionId: v.id("sessions"),
    answer: v.string(), // JSON of answer data
  },
  handler: async (ctx, args) => {
    const state = await ctx.db
      .query("streaming_state")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .unique();
    if (!state) return;
    await ctx.db.patch(state._id, {
      pendingAnswer: args.answer,
      updatedAt: Date.now(),
    });
  },
});

// Called by the action after reading the answer
export const clearQuestion = internalMutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const state = await ctx.db
      .query("streaming_state")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .unique();
    if (!state) return;
    await ctx.db.patch(state._id, {
      pendingQuestion: undefined,
      pendingAnswer: undefined,
      updatedAt: Date.now(),
    });
  },
});

export const setThinkingSeconds = internalMutation({
  args: { sessionId: v.id("sessions"), seconds: v.number() },
  handler: async (ctx, args) => {
    const state = await ctx.db
      .query("streaming_state")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .unique();
    if (!state) return;
    await ctx.db.patch(state._id, {
      thinkingSeconds: args.seconds,
      updatedAt: Date.now(),
    });
  },
});

export const addSubagentStart = internalMutation({
  args: {
    sessionId: v.id("sessions"),
    agentName: v.string(),
    task: v.string(),
  },
  handler: async (ctx, args) => {
    const state = await ctx.db
      .query("streaming_state")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .unique();
    if (!state) return;

    const parts = state.parts ? JSON.parse(state.parts) : [];
    parts.push({ type: "subagent_start", agentName: args.agentName, task: args.task });

    await ctx.db.patch(state._id, {
      parts: JSON.stringify(parts),
      updatedAt: Date.now(),
    });
  },
});

export const updateSubagentStatus = internalMutation({
  args: {
    sessionId: v.id("sessions"),
    agentName: v.string(),
    statusText: v.string(),
  },
  handler: async (ctx, args) => {
    const state = await ctx.db
      .query("streaming_state")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .unique();
    if (!state) return;

    const parts = state.parts ? JSON.parse(state.parts) : [];
    // Find the LAST subagent_start matching this agentName and update its statusText
    for (let i = parts.length - 1; i >= 0; i--) {
      if (parts[i].type === "subagent_start" && parts[i].agentName === args.agentName) {
        parts[i].statusText = args.statusText;
        break;
      }
    }

    await ctx.db.patch(state._id, {
      parts: JSON.stringify(parts),
      updatedAt: Date.now(),
    });
  },
});

export const addSubagentEnd = internalMutation({
  args: {
    sessionId: v.id("sessions"),
    agentName: v.string(),
    result: v.string(),
  },
  handler: async (ctx, args) => {
    const state = await ctx.db
      .query("streaming_state")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .unique();
    if (!state) return;

    const parts = state.parts ? JSON.parse(state.parts) : [];
    parts.push({ type: "subagent_end", agentName: args.agentName, result: args.result });

    await ctx.db.patch(state._id, {
      parts: JSON.stringify(parts),
      updatedAt: Date.now(),
    });
  },
});

export const updateToolCallArgs = internalMutation({
  args: {
    sessionId: v.id("sessions"),
    toolCallId: v.string(),
    args: v.string(),
  },
  handler: async (ctx, { sessionId, toolCallId, args: newArgs }) => {
    const state = await ctx.db
      .query("streaming_state")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .unique();
    if (!state) return;

    const toolCalls = JSON.parse(state.toolCalls);
    const tc = toolCalls.find((t: any) => t.id === toolCallId);
    if (tc) tc.args = newArgs;

    const parts = state.parts ? JSON.parse(state.parts) : [];
    for (const part of parts) {
      if (part.type === "tool_call" && part.toolCall?.id === toolCallId) {
        part.toolCall.args = newArgs;
        break;
      }
    }

    await ctx.db.patch(state._id, {
      toolCalls: JSON.stringify(toolCalls),
      parts: JSON.stringify(parts),
      updatedAt: Date.now(),
    });
  },
});

export const finish = internalMutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const state = await ctx.db
      .query("streaming_state")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .unique();
    if (!state) return;
    await ctx.db.patch(state._id, {
      isStreaming: false,
      updatedAt: Date.now(),
    });
  },
});
