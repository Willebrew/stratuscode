import { convexTest } from "convex-test";
import { describe, test, expect } from "bun:test";
import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules = {
  "./_generated/api.ts": () => import("./_generated/api"),
  "./_generated/server.ts": () => import("./_generated/server"),
  "./schema.ts": () => import("./schema"),
  "./sessions.ts": () => import("./sessions"),
  "./messages.ts": () => import("./messages"),
  "./streaming.ts": () => import("./streaming"),
  "./todos.ts": () => import("./todos"),
  "./agent_state.ts": () => import("./agent_state"),
  "./agent.ts": () => import("./agent"),
  "./lib/tools.ts": () => import("./lib/tools"),
} as any;

// Helper to create a session and return its id
async function createSession(t: ReturnType<typeof convexTest>) {
  return await t.mutation(api.sessions.create, {
    userId: "user1",
    owner: "alice",
    repo: "repo-a",
    branch: "main",
  });
}

describe("streaming", () => {
  // ─── get ───

  describe("get", () => {
    test("returns null when no streaming state exists", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);

      const state = await t.query(api.streaming.get, { sessionId });
      expect(state).toBeNull();
    });

    test("returns streaming state after start", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);

      await t.mutation(internal.streaming.start, { sessionId });

      const state = await t.query(api.streaming.get, { sessionId });
      expect(state).not.toBeNull();
      expect(state!.sessionId).toBe(sessionId);
      expect(state!.content).toBe("");
      expect(state!.reasoning).toBe("");
      expect(state!.toolCalls).toBe("[]");
      expect(state!.isStreaming).toBe(true);
    });
  });

  // ─── getInternal ───

  describe("getInternal", () => {
    test("returns null when no streaming state exists", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);

      const state = await t.query(internal.streaming.getInternal, {
        sessionId,
      });
      expect(state).toBeNull();
    });

    test("returns streaming state after start", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);

      await t.mutation(internal.streaming.start, { sessionId });

      const state = await t.query(internal.streaming.getInternal, {
        sessionId,
      });
      expect(state).not.toBeNull();
      expect(state!.isStreaming).toBe(true);
    });
  });

  // ─── start ───

  describe("start", () => {
    test("creates initial streaming row with defaults", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);

      await t.mutation(internal.streaming.start, { sessionId });

      const state = await t.query(api.streaming.get, { sessionId });
      expect(state).not.toBeNull();
      expect(state!.content).toBe("");
      expect(state!.reasoning).toBe("");
      expect(state!.toolCalls).toBe("[]");
      expect(state!.isStreaming).toBe(true);
      expect(state!.pendingQuestion).toBeUndefined();
      expect(state!.pendingAnswer).toBeUndefined();
    });

    test("sets updatedAt timestamp", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);

      const before = Date.now();
      await t.mutation(internal.streaming.start, { sessionId });
      const after = Date.now();

      const state = await t.query(api.streaming.get, { sessionId });
      expect(state!.updatedAt).toBeGreaterThanOrEqual(before);
      expect(state!.updatedAt).toBeLessThanOrEqual(after);
    });

    test("replaces existing streaming state when called again", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);

      await t.mutation(internal.streaming.start, { sessionId });
      await t.mutation(internal.streaming.appendToken, {
        sessionId,
        content: "some content",
      });

      // Start again should replace
      await t.mutation(internal.streaming.start, { sessionId });

      const state = await t.query(api.streaming.get, { sessionId });
      expect(state!.content).toBe("");
      expect(state!.isStreaming).toBe(true);
    });
  });

  // ─── appendToken ───

  describe("appendToken", () => {
    test("appends to content", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);
      await t.mutation(internal.streaming.start, { sessionId });

      await t.mutation(internal.streaming.appendToken, {
        sessionId,
        content: "Hello",
      });

      const state = await t.query(api.streaming.get, { sessionId });
      expect(state!.content).toBe("Hello");
    });

    test("concatenates multiple appends", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);
      await t.mutation(internal.streaming.start, { sessionId });

      await t.mutation(internal.streaming.appendToken, {
        sessionId,
        content: "Hello",
      });
      await t.mutation(internal.streaming.appendToken, {
        sessionId,
        content: " world",
      });
      await t.mutation(internal.streaming.appendToken, {
        sessionId,
        content: "!",
      });

      const state = await t.query(api.streaming.get, { sessionId });
      expect(state!.content).toBe("Hello world!");
    });

    test("does nothing when no streaming state exists", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);

      // Should not throw
      await t.mutation(internal.streaming.appendToken, {
        sessionId,
        content: "orphaned token",
      });

      const state = await t.query(api.streaming.get, { sessionId });
      expect(state).toBeNull();
    });

    test("updates the updatedAt timestamp", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);
      await t.mutation(internal.streaming.start, { sessionId });

      const before = (await t.query(api.streaming.get, { sessionId }))!
        .updatedAt;
      await new Promise((r) => setTimeout(r, 5));

      await t.mutation(internal.streaming.appendToken, {
        sessionId,
        content: "tok",
      });

      const after = (await t.query(api.streaming.get, { sessionId }))!
        .updatedAt;
      expect(after).toBeGreaterThanOrEqual(before);
    });
  });

  // ─── appendReasoning ───

  describe("appendReasoning", () => {
    test("appends to reasoning", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);
      await t.mutation(internal.streaming.start, { sessionId });

      await t.mutation(internal.streaming.appendReasoning, {
        sessionId,
        content: "Thinking...",
      });

      const state = await t.query(api.streaming.get, { sessionId });
      expect(state!.reasoning).toBe("Thinking...");
    });

    test("concatenates multiple reasoning appends", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);
      await t.mutation(internal.streaming.start, { sessionId });

      await t.mutation(internal.streaming.appendReasoning, {
        sessionId,
        content: "Step 1. ",
      });
      await t.mutation(internal.streaming.appendReasoning, {
        sessionId,
        content: "Step 2.",
      });

      const state = await t.query(api.streaming.get, { sessionId });
      expect(state!.reasoning).toBe("Step 1. Step 2.");
    });

    test("does nothing when no streaming state exists", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);

      await t.mutation(internal.streaming.appendReasoning, {
        sessionId,
        content: "orphaned reasoning",
      });

      const state = await t.query(api.streaming.get, { sessionId });
      expect(state).toBeNull();
    });

    test("does not affect content field", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);
      await t.mutation(internal.streaming.start, { sessionId });

      await t.mutation(internal.streaming.appendToken, {
        sessionId,
        content: "visible",
      });
      await t.mutation(internal.streaming.appendReasoning, {
        sessionId,
        content: "internal",
      });

      const state = await t.query(api.streaming.get, { sessionId });
      expect(state!.content).toBe("visible");
      expect(state!.reasoning).toBe("internal");
    });
  });

  // ─── addToolCall ───

  describe("addToolCall", () => {
    test("adds a tool call to the JSON array", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);
      await t.mutation(internal.streaming.start, { sessionId });

      await t.mutation(internal.streaming.addToolCall, {
        sessionId,
        toolCallId: "tc-1",
        toolName: "readFile",
        toolArgs: JSON.stringify({ path: "/foo.ts" }),
      });

      const state = await t.query(api.streaming.get, { sessionId });
      const toolCalls = JSON.parse(state!.toolCalls);
      expect(toolCalls).toHaveLength(1);
      expect(toolCalls[0]).toEqual({
        id: "tc-1",
        name: "readFile",
        args: JSON.stringify({ path: "/foo.ts" }),
        status: "running",
      });
    });

    test("adds multiple tool calls", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);
      await t.mutation(internal.streaming.start, { sessionId });

      await t.mutation(internal.streaming.addToolCall, {
        sessionId,
        toolCallId: "tc-1",
        toolName: "readFile",
        toolArgs: "{}",
      });
      await t.mutation(internal.streaming.addToolCall, {
        sessionId,
        toolCallId: "tc-2",
        toolName: "writeFile",
        toolArgs: '{"path": "/bar.ts"}',
      });

      const state = await t.query(api.streaming.get, { sessionId });
      const toolCalls = JSON.parse(state!.toolCalls);
      expect(toolCalls).toHaveLength(2);
      expect(toolCalls[0].id).toBe("tc-1");
      expect(toolCalls[1].id).toBe("tc-2");
    });

    test("does nothing when no streaming state exists", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);

      await t.mutation(internal.streaming.addToolCall, {
        sessionId,
        toolCallId: "tc-1",
        toolName: "readFile",
        toolArgs: "{}",
      });

      const state = await t.query(api.streaming.get, { sessionId });
      expect(state).toBeNull();
    });

    test("all added tool calls start with status running", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);
      await t.mutation(internal.streaming.start, { sessionId });

      await t.mutation(internal.streaming.addToolCall, {
        sessionId,
        toolCallId: "tc-1",
        toolName: "bash",
        toolArgs: '{"cmd":"ls"}',
      });

      const state = await t.query(api.streaming.get, { sessionId });
      const toolCalls = JSON.parse(state!.toolCalls);
      expect(toolCalls[0].status).toBe("running");
    });
  });

  // ─── updateToolResult ───

  describe("updateToolResult", () => {
    test("updates specific tool call result and sets status to completed", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);
      await t.mutation(internal.streaming.start, { sessionId });

      await t.mutation(internal.streaming.addToolCall, {
        sessionId,
        toolCallId: "tc-1",
        toolName: "readFile",
        toolArgs: '{"path":"/foo.ts"}',
      });

      await t.mutation(internal.streaming.updateToolResult, {
        sessionId,
        toolCallId: "tc-1",
        result: "file contents here",
      });

      const state = await t.query(api.streaming.get, { sessionId });
      const toolCalls = JSON.parse(state!.toolCalls);
      expect(toolCalls[0].result).toBe("file contents here");
      expect(toolCalls[0].status).toBe("completed");
    });

    test("updates toolArgs when provided", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);
      await t.mutation(internal.streaming.start, { sessionId });

      await t.mutation(internal.streaming.addToolCall, {
        sessionId,
        toolCallId: "tc-1",
        toolName: "bash",
        toolArgs: '{"cmd":"ls"}',
      });

      await t.mutation(internal.streaming.updateToolResult, {
        sessionId,
        toolCallId: "tc-1",
        result: "done",
        toolArgs: '{"cmd":"ls -la"}',
      });

      const state = await t.query(api.streaming.get, { sessionId });
      const toolCalls = JSON.parse(state!.toolCalls);
      expect(toolCalls[0].args).toBe('{"cmd":"ls -la"}');
    });

    test("only updates the targeted tool call among multiple", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);
      await t.mutation(internal.streaming.start, { sessionId });

      await t.mutation(internal.streaming.addToolCall, {
        sessionId,
        toolCallId: "tc-1",
        toolName: "readFile",
        toolArgs: "{}",
      });
      await t.mutation(internal.streaming.addToolCall, {
        sessionId,
        toolCallId: "tc-2",
        toolName: "writeFile",
        toolArgs: "{}",
      });

      await t.mutation(internal.streaming.updateToolResult, {
        sessionId,
        toolCallId: "tc-1",
        result: "result-1",
      });

      const state = await t.query(api.streaming.get, { sessionId });
      const toolCalls = JSON.parse(state!.toolCalls);
      expect(toolCalls[0].result).toBe("result-1");
      expect(toolCalls[0].status).toBe("completed");
      expect(toolCalls[1].result).toBeUndefined();
      expect(toolCalls[1].status).toBe("running");
    });

    test("does nothing when no streaming state exists", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);

      await t.mutation(internal.streaming.updateToolResult, {
        sessionId,
        toolCallId: "tc-1",
        result: "orphaned",
      });

      const state = await t.query(api.streaming.get, { sessionId });
      expect(state).toBeNull();
    });

    test("does nothing when toolCallId is not found", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);
      await t.mutation(internal.streaming.start, { sessionId });

      await t.mutation(internal.streaming.addToolCall, {
        sessionId,
        toolCallId: "tc-1",
        toolName: "readFile",
        toolArgs: "{}",
      });

      // Update a non-existent tool call id
      await t.mutation(internal.streaming.updateToolResult, {
        sessionId,
        toolCallId: "tc-nonexistent",
        result: "should not appear",
      });

      const state = await t.query(api.streaming.get, { sessionId });
      const toolCalls = JSON.parse(state!.toolCalls);
      expect(toolCalls).toHaveLength(1);
      expect(toolCalls[0].result).toBeUndefined();
      expect(toolCalls[0].status).toBe("running");
    });
  });

  // ─── setQuestion ───

  describe("setQuestion", () => {
    test("sets pendingQuestion", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);
      await t.mutation(internal.streaming.start, { sessionId });

      const questionData = JSON.stringify({
        type: "confirm",
        message: "Proceed?",
      });
      await t.mutation(internal.streaming.setQuestion, {
        sessionId,
        question: questionData,
      });

      const state = await t.query(api.streaming.get, { sessionId });
      expect(state!.pendingQuestion).toBe(questionData);
    });

    test("clears pendingAnswer when setting question", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);
      await t.mutation(internal.streaming.start, { sessionId });

      // First set a question and answer
      await t.mutation(internal.streaming.setQuestion, {
        sessionId,
        question: '"Q1"',
      });
      await t.mutation(api.streaming.answerQuestion, {
        sessionId,
        answer: '"A1"',
      });

      // Set a new question should clear the answer
      await t.mutation(internal.streaming.setQuestion, {
        sessionId,
        question: '"Q2"',
      });

      const state = await t.query(api.streaming.get, { sessionId });
      expect(state!.pendingQuestion).toBe('"Q2"');
      expect(state!.pendingAnswer).toBeUndefined();
    });

    test("does nothing when no streaming state exists", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);

      await t.mutation(internal.streaming.setQuestion, {
        sessionId,
        question: '"Q"',
      });

      const state = await t.query(api.streaming.get, { sessionId });
      expect(state).toBeNull();
    });
  });

  // ─── answerQuestion ───

  describe("answerQuestion", () => {
    test("sets pendingAnswer", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);
      await t.mutation(internal.streaming.start, { sessionId });

      await t.mutation(internal.streaming.setQuestion, {
        sessionId,
        question: '"Do it?"',
      });
      await t.mutation(api.streaming.answerQuestion, {
        sessionId,
        answer: '"yes"',
      });

      const state = await t.query(api.streaming.get, { sessionId });
      expect(state!.pendingAnswer).toBe('"yes"');
    });

    test("does nothing when no streaming state exists", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);

      await t.mutation(api.streaming.answerQuestion, {
        sessionId,
        answer: '"orphaned"',
      });

      const state = await t.query(api.streaming.get, { sessionId });
      expect(state).toBeNull();
    });

    test("updates the updatedAt timestamp", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);
      await t.mutation(internal.streaming.start, { sessionId });

      const before = (await t.query(api.streaming.get, { sessionId }))!
        .updatedAt;
      await new Promise((r) => setTimeout(r, 5));

      await t.mutation(api.streaming.answerQuestion, {
        sessionId,
        answer: '"ans"',
      });

      const after = (await t.query(api.streaming.get, { sessionId }))!
        .updatedAt;
      expect(after).toBeGreaterThanOrEqual(before);
    });
  });

  // ─── clearQuestion ───

  describe("clearQuestion", () => {
    test("clears both pendingQuestion and pendingAnswer", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);
      await t.mutation(internal.streaming.start, { sessionId });

      await t.mutation(internal.streaming.setQuestion, {
        sessionId,
        question: '"Q"',
      });
      await t.mutation(api.streaming.answerQuestion, {
        sessionId,
        answer: '"A"',
      });

      // Verify they're set
      let state = await t.query(api.streaming.get, { sessionId });
      expect(state!.pendingQuestion).toBe('"Q"');
      expect(state!.pendingAnswer).toBe('"A"');

      await t.mutation(internal.streaming.clearQuestion, { sessionId });

      state = await t.query(api.streaming.get, { sessionId });
      expect(state!.pendingQuestion).toBeUndefined();
      expect(state!.pendingAnswer).toBeUndefined();
    });

    test("does nothing when no streaming state exists", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);

      // Should not throw
      await t.mutation(internal.streaming.clearQuestion, { sessionId });

      const state = await t.query(api.streaming.get, { sessionId });
      expect(state).toBeNull();
    });

    test("updates the updatedAt timestamp", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);
      await t.mutation(internal.streaming.start, { sessionId });

      await t.mutation(internal.streaming.setQuestion, {
        sessionId,
        question: '"Q"',
      });

      const before = (await t.query(api.streaming.get, { sessionId }))!
        .updatedAt;
      await new Promise((r) => setTimeout(r, 5));

      await t.mutation(internal.streaming.clearQuestion, { sessionId });

      const after = (await t.query(api.streaming.get, { sessionId }))!
        .updatedAt;
      expect(after).toBeGreaterThanOrEqual(before);
    });
  });

  // ─── finish ───

  describe("finish", () => {
    test("sets isStreaming to false", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);
      await t.mutation(internal.streaming.start, { sessionId });

      let state = await t.query(api.streaming.get, { sessionId });
      expect(state!.isStreaming).toBe(true);

      await t.mutation(internal.streaming.finish, { sessionId });

      state = await t.query(api.streaming.get, { sessionId });
      expect(state!.isStreaming).toBe(false);
    });

    test("preserves accumulated content and toolCalls", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);
      await t.mutation(internal.streaming.start, { sessionId });

      await t.mutation(internal.streaming.appendToken, {
        sessionId,
        content: "Hello world",
      });
      await t.mutation(internal.streaming.addToolCall, {
        sessionId,
        toolCallId: "tc-1",
        toolName: "readFile",
        toolArgs: "{}",
      });

      await t.mutation(internal.streaming.finish, { sessionId });

      const state = await t.query(api.streaming.get, { sessionId });
      expect(state!.isStreaming).toBe(false);
      // Content and toolCalls are preserved after finish
      expect(state!.content).toBe("Hello world");
      const toolCalls = JSON.parse(state!.toolCalls);
      expect(toolCalls).toHaveLength(1);
    });

    test("does nothing when no streaming state exists", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);

      // Should not throw
      await t.mutation(internal.streaming.finish, { sessionId });

      const state = await t.query(api.streaming.get, { sessionId });
      expect(state).toBeNull();
    });

    test("updates the updatedAt timestamp", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);
      await t.mutation(internal.streaming.start, { sessionId });

      const before = (await t.query(api.streaming.get, { sessionId }))!
        .updatedAt;
      await new Promise((r) => setTimeout(r, 5));

      await t.mutation(internal.streaming.finish, { sessionId });

      const after = (await t.query(api.streaming.get, { sessionId }))!
        .updatedAt;
      expect(after).toBeGreaterThanOrEqual(before);
    });
  });

  // ─── Integration: full streaming lifecycle ───

  describe("integration: full streaming lifecycle", () => {
    test("start -> append tokens -> add tools -> update result -> finish", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);

      // Start streaming
      await t.mutation(internal.streaming.start, { sessionId });
      let state = await t.query(api.streaming.get, { sessionId });
      expect(state!.isStreaming).toBe(true);

      // Append tokens
      await t.mutation(internal.streaming.appendToken, {
        sessionId,
        content: "I'll read the file...",
      });

      // Add a tool call
      await t.mutation(internal.streaming.addToolCall, {
        sessionId,
        toolCallId: "tc-1",
        toolName: "readFile",
        toolArgs: '{"path":"/src/index.ts"}',
      });

      // Update tool result
      await t.mutation(internal.streaming.updateToolResult, {
        sessionId,
        toolCallId: "tc-1",
        result: "export default function() {}",
      });

      // Add reasoning
      await t.mutation(internal.streaming.appendReasoning, {
        sessionId,
        content: "The file exports a default function.",
      });

      // More tokens
      await t.mutation(internal.streaming.appendToken, {
        sessionId,
        content: " Done reading.",
      });

      // Finish
      await t.mutation(internal.streaming.finish, { sessionId });

      state = await t.query(api.streaming.get, { sessionId });
      expect(state!.isStreaming).toBe(false);
      expect(state!.content).toBe("I'll read the file... Done reading.");
      expect(state!.reasoning).toBe(
        "The file exports a default function.",
      );

      const toolCalls = JSON.parse(state!.toolCalls);
      expect(toolCalls).toHaveLength(1);
      expect(toolCalls[0].status).toBe("completed");
      expect(toolCalls[0].result).toBe("export default function() {}");
    });
  });
});
