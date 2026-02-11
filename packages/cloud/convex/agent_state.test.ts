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

describe("agent_state", () => {
  // ─── get ───

  describe("get", () => {
    test("returns null when no agent state exists", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);

      const state = await t.query(internal.agent_state.get, { sessionId });
      expect(state).toBeNull();
    });

    test("returns agent state after save", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);

      const messages = JSON.stringify([
        { role: "system", content: "You are a coding assistant." },
      ]);
      await t.mutation(internal.agent_state.save, {
        sessionId,
        sageMessages: messages,
        agentMode: "build",
      });

      const state = await t.query(internal.agent_state.get, { sessionId });
      expect(state).not.toBeNull();
      expect(state!.sessionId).toBe(sessionId);
      expect(state!.sageMessages).toBe(messages);
      expect(state!.agentMode).toBe("build");
    });

    test("returns state with all optional fields populated", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);

      const messages = JSON.stringify([{ role: "user", content: "Hello" }]);
      const summary = JSON.stringify({ summary: "Session summary data" });

      await t.mutation(internal.agent_state.save, {
        sessionId,
        sageMessages: messages,
        existingSummary: summary,
        planFilePath: "/tmp/plan.md",
        agentMode: "plan",
      });

      const state = await t.query(internal.agent_state.get, { sessionId });
      expect(state!.sageMessages).toBe(messages);
      expect(state!.existingSummary).toBe(summary);
      expect(state!.planFilePath).toBe("/tmp/plan.md");
      expect(state!.agentMode).toBe("plan");
    });

    test("returns state with optional fields undefined", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);

      await t.mutation(internal.agent_state.save, {
        sessionId,
        sageMessages: "[]",
        agentMode: "build",
      });

      const state = await t.query(internal.agent_state.get, { sessionId });
      expect(state!.existingSummary).toBeUndefined();
      expect(state!.planFilePath).toBeUndefined();
    });
  });

  // ─── save ───

  describe("save", () => {
    test("creates new agent state", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);

      await t.mutation(internal.agent_state.save, {
        sessionId,
        sageMessages: '["msg1"]',
        agentMode: "build",
      });

      const state = await t.query(internal.agent_state.get, { sessionId });
      expect(state).not.toBeNull();
      expect(state!.sageMessages).toBe('["msg1"]');
      expect(state!.agentMode).toBe("build");
    });

    test("upserts existing agent state (updates in place)", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);

      // Initial save
      await t.mutation(internal.agent_state.save, {
        sessionId,
        sageMessages: '["initial"]',
        agentMode: "build",
      });

      const first = await t.query(internal.agent_state.get, { sessionId });
      const firstId = first!._id;

      // Upsert
      await t.mutation(internal.agent_state.save, {
        sessionId,
        sageMessages: '["updated"]',
        agentMode: "plan",
        existingSummary: '{"key":"value"}',
        planFilePath: "/plans/session.md",
      });

      const second = await t.query(internal.agent_state.get, { sessionId });
      // Same document, patched in place
      expect(second!._id).toBe(firstId);
      expect(second!.sageMessages).toBe('["updated"]');
      expect(second!.agentMode).toBe("plan");
      expect(second!.existingSummary).toBe('{"key":"value"}');
      expect(second!.planFilePath).toBe("/plans/session.md");
    });

    test("upsert does not create a second document", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);

      await t.mutation(internal.agent_state.save, {
        sessionId,
        sageMessages: "[]",
        agentMode: "build",
      });
      await t.mutation(internal.agent_state.save, {
        sessionId,
        sageMessages: '["x"]',
        agentMode: "plan",
      });
      await t.mutation(internal.agent_state.save, {
        sessionId,
        sageMessages: '["y"]',
        agentMode: "build",
      });

      // Use run to count documents for this session
      const count = await t.run(async (ctx) => {
        const states = await ctx.db
          .query("agent_state")
          .withIndex("by_sessionId", (q: any) => q.eq("sessionId", sessionId))
          .collect();
        return states.length;
      });
      expect(count).toBe(1);
    });

    test("saves with all optional fields", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);

      await t.mutation(internal.agent_state.save, {
        sessionId,
        sageMessages: '["hello"]',
        existingSummary: '{"summary": "test"}',
        planFilePath: "/path/to/plan.md",
        agentMode: "plan",
      });

      const state = await t.query(internal.agent_state.get, { sessionId });
      expect(state!.existingSummary).toBe('{"summary": "test"}');
      expect(state!.planFilePath).toBe("/path/to/plan.md");
    });

    test("saves without optional fields", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);

      await t.mutation(internal.agent_state.save, {
        sessionId,
        sageMessages: "[]",
        agentMode: "build",
      });

      const state = await t.query(internal.agent_state.get, { sessionId });
      expect(state!.existingSummary).toBeUndefined();
      expect(state!.planFilePath).toBeUndefined();
    });

    test("can update optional fields to undefined", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);

      // Save with optional fields
      await t.mutation(internal.agent_state.save, {
        sessionId,
        sageMessages: "[]",
        existingSummary: "some summary",
        planFilePath: "/plan.md",
        agentMode: "build",
      });

      // Upsert without optional fields should patch them to undefined
      await t.mutation(internal.agent_state.save, {
        sessionId,
        sageMessages: "[]",
        existingSummary: undefined,
        planFilePath: undefined,
        agentMode: "build",
      });

      const state = await t.query(internal.agent_state.get, { sessionId });
      expect(state!.existingSummary).toBeUndefined();
      expect(state!.planFilePath).toBeUndefined();
    });

    test("different sessions have independent state", async () => {
      const t = convexTest(schema, modules);
      const sessionId1 = await createSession(t);
      const sessionId2 = await t.mutation(api.sessions.create, {
        userId: "user2",
        owner: "bob",
        repo: "repo-b",
        branch: "main",
      });

      await t.mutation(internal.agent_state.save, {
        sessionId: sessionId1,
        sageMessages: '["session1"]',
        agentMode: "build",
      });

      await t.mutation(internal.agent_state.save, {
        sessionId: sessionId2,
        sageMessages: '["session2"]',
        agentMode: "plan",
      });

      const state1 = await t.query(internal.agent_state.get, {
        sessionId: sessionId1,
      });
      const state2 = await t.query(internal.agent_state.get, {
        sessionId: sessionId2,
      });

      expect(state1!.sageMessages).toBe('["session1"]');
      expect(state1!.agentMode).toBe("build");
      expect(state2!.sageMessages).toBe('["session2"]');
      expect(state2!.agentMode).toBe("plan");
    });
  });

  // ─── clear ───

  describe("clear", () => {
    test("removes agent state for a session", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);

      await t.mutation(internal.agent_state.save, {
        sessionId,
        sageMessages: '["data"]',
        agentMode: "build",
      });

      // Verify it exists
      let state = await t.query(internal.agent_state.get, { sessionId });
      expect(state).not.toBeNull();

      // Clear
      await t.mutation(internal.agent_state.clear, { sessionId });

      state = await t.query(internal.agent_state.get, { sessionId });
      expect(state).toBeNull();
    });

    test("does nothing when no state exists", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);

      // Should not throw
      await t.mutation(internal.agent_state.clear, { sessionId });

      const state = await t.query(internal.agent_state.get, { sessionId });
      expect(state).toBeNull();
    });

    test("does not affect state of other sessions", async () => {
      const t = convexTest(schema, modules);
      const sessionId1 = await createSession(t);
      const sessionId2 = await t.mutation(api.sessions.create, {
        userId: "user2",
        owner: "bob",
        repo: "repo-b",
        branch: "main",
      });

      await t.mutation(internal.agent_state.save, {
        sessionId: sessionId1,
        sageMessages: '["session1"]',
        agentMode: "build",
      });
      await t.mutation(internal.agent_state.save, {
        sessionId: sessionId2,
        sageMessages: '["session2"]',
        agentMode: "plan",
      });

      // Clear session 1
      await t.mutation(internal.agent_state.clear, { sessionId: sessionId1 });

      // Session 1 cleared
      const state1 = await t.query(internal.agent_state.get, {
        sessionId: sessionId1,
      });
      expect(state1).toBeNull();

      // Session 2 unaffected
      const state2 = await t.query(internal.agent_state.get, {
        sessionId: sessionId2,
      });
      expect(state2).not.toBeNull();
      expect(state2!.sageMessages).toBe('["session2"]');
    });

    test("allows saving new state after clearing", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);

      await t.mutation(internal.agent_state.save, {
        sessionId,
        sageMessages: '["first"]',
        agentMode: "build",
      });

      await t.mutation(internal.agent_state.clear, { sessionId });

      // Save new state
      await t.mutation(internal.agent_state.save, {
        sessionId,
        sageMessages: '["second"]',
        agentMode: "plan",
      });

      const state = await t.query(internal.agent_state.get, { sessionId });
      expect(state).not.toBeNull();
      expect(state!.sageMessages).toBe('["second"]');
      expect(state!.agentMode).toBe("plan");
    });
  });
});
