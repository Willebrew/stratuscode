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
    containerId: v.optional(v.string()), // Docker container ID
    title: v.string(),
    titleGenerated: v.optional(v.boolean()),
    lastMessage: v.string(),
    tokenUsage: v.object({
      input: v.number(),
      output: v.number(),
    }),
    cancelRequested: v.boolean(),
    hasChanges: v.optional(v.boolean()),
    runId: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_updatedAt", ["userId", "updatedAt"])
    .index("by_status", ["status"]),

  messages: defineTable({
    sessionId: v.id("sessions"),
    role: v.string(), // 'user' | 'assistant'
    content: v.string(),
    parts: v.array(v.any()), // MessagePart[] — preserves existing frontend shape
    thinkingSeconds: v.optional(v.number()), // Time spent thinking
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
    parts: v.optional(v.string()), // JSON array of ordered MessagePart[] (text + tool_call interleaved)
    pendingQuestion: v.optional(v.string()), // JSON of question data
    pendingAnswer: v.optional(v.string()), // JSON of answer data
    thinkingSeconds: v.optional(v.number()), // Set server-side the instant reasoning stops
    stage: v.optional(v.string()), // "booting" | "thinking" | undefined (content flowing)
    isStreaming: v.boolean(),
    updatedAt: v.number(),
  })
    .index("by_sessionId", ["sessionId"]),

  // GitHub OAuth tokens — stored per-user for GitHub API access
  github_auth: defineTable({
    userId: v.string(),
    accessToken: v.string(),
    login: v.string(), // GitHub username
    githubId: v.number(), // GitHub user ID
    name: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"]),

  // Codex OAuth tokens — stored per-user so Convex actions can access them
  // (cookies aren't accessible from Convex server-side actions)
  codex_auth: defineTable({
    userId: v.string(),
    accessToken: v.string(),
    refreshToken: v.string(),
    accountId: v.optional(v.string()),
    expiresAt: v.number(), // Unix timestamp (ms)
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"]),

  // Feedback — thumbs up/down ratings on assistant messages
  feedback: defineTable({
    messageId: v.id("messages"),
    sessionId: v.id("sessions"),
    userId: v.string(),
    rating: v.string(), // 'up' | 'down'
    comment: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_messageId", ["messageId"])
    .index("by_sessionId", ["sessionId"])
    .index("by_userId", ["userId"]),

  // Attachments — file uploads (images, code files)
  attachments: defineTable({
    sessionId: v.id("sessions"),
    messageId: v.optional(v.id("messages")),
    filename: v.string(),
    mimeType: v.string(),
    size: v.number(),
    storageId: v.id("_storage"),
    createdAt: v.number(),
  })
    .index("by_sessionId", ["sessionId"])
    .index("by_messageId", ["messageId"]),
});
