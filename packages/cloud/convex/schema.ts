import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  sessions: defineTable({
    userId: v.string(),
    owner: v.string(),
    repo: v.string(),
    branch: v.string(),
    sessionBranch: v.string(),
    agent: v.string(),
    model: v.string(),
    status: v.string(), // 'booting' | 'idle' | 'running' | 'completed' | 'error'
    sandboxId: v.optional(v.string()),
    snapshotId: v.optional(v.string()),
    title: v.string(),
    lastMessage: v.string(),
    tokenUsage: v.object({
      input: v.number(),
      output: v.number(),
    }),
    cancelRequested: v.boolean(),
    errorMessage: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_updatedAt", ["userId", "updatedAt"]),

  messages: defineTable({
    sessionId: v.id("sessions"),
    role: v.string(), // 'user' | 'assistant'
    content: v.string(),
    parts: v.array(v.any()), // MessagePart[] — preserves existing frontend shape
    createdAt: v.number(),
  })
    .index("by_sessionId", ["sessionId"])
    .index("by_sessionId_createdAt", ["sessionId", "createdAt"]),

  timeline_events: defineTable({
    sessionId: v.id("sessions"),
    kind: v.string(), // 'token' | 'reasoning' | 'tool_call' | 'tool_result' | 'mode_switch' | 'error'
    content: v.string(),
    toolCallId: v.optional(v.string()),
    toolName: v.optional(v.string()),
    status: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_sessionId", ["sessionId"])
    .index("by_sessionId_createdAt", ["sessionId", "createdAt"]),

  todos: defineTable({
    sessionId: v.id("sessions"),
    content: v.string(),
    status: v.string(), // 'pending' | 'in_progress' | 'completed'
    priority: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_sessionId", ["sessionId"]),

  agent_state: defineTable({
    sessionId: v.id("sessions"),
    sageMessages: v.string(), // JSON-serialized SAGE Message[]
    existingSummary: v.optional(v.string()), // JSON-serialized SummaryState
    planFilePath: v.optional(v.string()),
    agentMode: v.string(), // 'build' | 'plan'
  })
    .index("by_sessionId", ["sessionId"]),

  // Single mutable row per session for live streaming updates.
  // Frontend subscribes to this for real-time token-by-token display.
  // Tokens are batched (~100ms) to avoid per-token mutation overhead.
  streaming_state: defineTable({
    sessionId: v.id("sessions"),
    content: v.string(),
    reasoning: v.string(),
    toolCalls: v.string(), // JSON array of ToolCallInfo[]
    pendingQuestion: v.optional(v.string()), // JSON of question data
    pendingAnswer: v.optional(v.string()), // JSON of answer data
    isStreaming: v.boolean(),
    updatedAt: v.number(),
  })
    .index("by_sessionId", ["sessionId"]),
});
