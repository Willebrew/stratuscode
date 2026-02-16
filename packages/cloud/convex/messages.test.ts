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

describe("messages", () => {
  // ─── list ───

  describe("list", () => {
    test("returns messages for a sessionId", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);

      await t.mutation(internal.messages.create, {
        sessionId,
        role: "user",
        content: "Hello",
        parts: [{ type: "text", text: "Hello" }],
      });
      await t.mutation(internal.messages.create, {
        sessionId,
        role: "assistant",
        content: "Hi there",
        parts: [{ type: "text", text: "Hi there" }],
      });

      const messages = await t.query(api.messages.list, { sessionId });
      expect(messages).toHaveLength(2);
    });

    test("returns messages ordered by createdAt ascending", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);

      const id1 = await t.mutation(internal.messages.create, {
        sessionId,
        role: "user",
        content: "First",
        parts: [{ type: "text", text: "First" }],
      });
      const id2 = await t.mutation(internal.messages.create, {
        sessionId,
        role: "assistant",
        content: "Second",
        parts: [{ type: "text", text: "Second" }],
      });

      const messages = await t.query(api.messages.list, { sessionId });
      expect(messages[0]._id).toBe(id1);
      expect(messages[1]._id).toBe(id2);
      expect(messages[0].createdAt).toBeLessThanOrEqual(
        messages[1].createdAt,
      );
    });

    test("returns empty array when no messages exist", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);

      const messages = await t.query(api.messages.list, { sessionId });
      expect(messages).toEqual([]);
    });

    test("does not return messages from other sessions", async () => {
      const t = convexTest(schema, modules);
      const sessionId1 = await createSession(t);
      const sessionId2 = await t.mutation(api.sessions.create, {
        userId: "user2",
        owner: "bob",
        repo: "repo-b",
        branch: "main",
      });

      await t.mutation(internal.messages.create, {
        sessionId: sessionId1,
        role: "user",
        content: "Message for session 1",
        parts: [{ type: "text", text: "Message for session 1" }],
      });
      await t.mutation(internal.messages.create, {
        sessionId: sessionId2,
        role: "user",
        content: "Message for session 2",
        parts: [{ type: "text", text: "Message for session 2" }],
      });

      const messages1 = await t.query(api.messages.list, {
        sessionId: sessionId1,
      });
      expect(messages1).toHaveLength(1);
      expect(messages1[0].content).toBe("Message for session 1");

      const messages2 = await t.query(api.messages.list, {
        sessionId: sessionId2,
      });
      expect(messages2).toHaveLength(1);
      expect(messages2[0].content).toBe("Message for session 2");
    });
  });

  // ─── create ───

  describe("create", () => {
    test("creates a message and returns its id", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);

      const msgId = await t.mutation(internal.messages.create, {
        sessionId,
        role: "user",
        content: "Hello world",
        parts: [{ type: "text", text: "Hello world" }],
      });

      expect(msgId).toBeDefined();
      expect(typeof msgId).toBe("string");
    });

    test("stores all fields correctly", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);
      const parts = [
        { type: "text", text: "Hello" },
        { type: "tool-invocation", toolName: "readFile", args: { path: "/foo" } },
      ];

      const msgId = await t.mutation(internal.messages.create, {
        sessionId,
        role: "assistant",
        content: "Hello",
        parts,
      });

      const messages = await t.query(api.messages.list, { sessionId });
      const msg = messages.find((m: any) => m._id === msgId);
      expect(msg).toBeDefined();
      expect(msg!.role).toBe("assistant");
      expect(msg!.content).toBe("Hello");
      expect(msg!.parts).toEqual(parts);
      expect(msg!.sessionId).toBe(sessionId);
    });

    test("sets createdAt timestamp", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);

      const before = Date.now();
      const msgId = await t.mutation(internal.messages.create, {
        sessionId,
        role: "user",
        content: "Test",
        parts: [],
      });
      const after = Date.now();

      const messages = await t.query(api.messages.list, { sessionId });
      const msg = messages.find((m: any) => m._id === msgId);
      expect(msg!.createdAt).toBeGreaterThanOrEqual(before);
      expect(msg!.createdAt).toBeLessThanOrEqual(after);
    });

    test("handles empty parts array", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);

      const msgId = await t.mutation(internal.messages.create, {
        sessionId,
        role: "user",
        content: "No parts",
        parts: [],
      });

      const messages = await t.query(api.messages.list, { sessionId });
      const msg = messages.find((m: any) => m._id === msgId);
      expect(msg!.parts).toEqual([]);
    });

    test("handles empty content string", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);

      const msgId = await t.mutation(internal.messages.create, {
        sessionId,
        role: "assistant",
        content: "",
        parts: [{ type: "text", text: "" }],
      });

      const messages = await t.query(api.messages.list, { sessionId });
      const msg = messages.find((m: any) => m._id === msgId);
      expect(msg!.content).toBe("");
    });
  });

  // ─── updateParts ───

  describe("updateParts", () => {
    test("patches message parts", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);

      const msgId = await t.mutation(internal.messages.create, {
        sessionId,
        role: "assistant",
        content: "Initial",
        parts: [{ type: "text", text: "Initial" }],
      });

      const newParts = [
        { type: "text", text: "Updated" },
        { type: "tool-invocation", toolName: "writeFile", args: {} },
      ];
      await t.mutation(internal.messages.updateParts, {
        id: msgId,
        parts: newParts,
      });

      const messages = await t.query(api.messages.list, { sessionId });
      const msg = messages.find((m: any) => m._id === msgId);
      expect(msg!.parts).toEqual(newParts);
    });

    test("optionally updates content along with parts", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);

      const msgId = await t.mutation(internal.messages.create, {
        sessionId,
        role: "assistant",
        content: "Original content",
        parts: [{ type: "text", text: "Original content" }],
      });

      await t.mutation(internal.messages.updateParts, {
        id: msgId,
        parts: [{ type: "text", text: "New content" }],
        content: "New content",
      });

      const messages = await t.query(api.messages.list, { sessionId });
      const msg = messages.find((m: any) => m._id === msgId);
      expect(msg!.content).toBe("New content");
      expect(msg!.parts).toEqual([{ type: "text", text: "New content" }]);
    });

    test("does not update content when content is omitted", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);

      const msgId = await t.mutation(internal.messages.create, {
        sessionId,
        role: "assistant",
        content: "Keep this",
        parts: [{ type: "text", text: "Keep this" }],
      });

      await t.mutation(internal.messages.updateParts, {
        id: msgId,
        parts: [{ type: "text", text: "New parts only" }],
      });

      const messages = await t.query(api.messages.list, { sessionId });
      const msg = messages.find((m: any) => m._id === msgId);
      expect(msg!.content).toBe("Keep this");
      expect(msg!.parts).toEqual([{ type: "text", text: "New parts only" }]);
    });

    test("can replace parts with an empty array", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);

      const msgId = await t.mutation(internal.messages.create, {
        sessionId,
        role: "user",
        content: "Some text",
        parts: [{ type: "text", text: "Some text" }],
      });

      await t.mutation(internal.messages.updateParts, {
        id: msgId,
        parts: [],
      });

      const messages = await t.query(api.messages.list, { sessionId });
      const msg = messages.find((m: any) => m._id === msgId);
      expect(msg!.parts).toEqual([]);
    });
  });
});
