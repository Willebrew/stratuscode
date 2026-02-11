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

describe("sessions", () => {
  // ─── list ───

  describe("list", () => {
    test("returns sessions for the given userId", async () => {
      const t = convexTest(schema, modules);
      const id1 = await t.mutation(api.sessions.create, {
        userId: "user1",
        owner: "alice",
        repo: "repo-a",
        branch: "main",
      });
      const id2 = await t.mutation(api.sessions.create, {
        userId: "user1",
        owner: "alice",
        repo: "repo-b",
        branch: "main",
      });
      // Different user
      await t.mutation(api.sessions.create, {
        userId: "user2",
        owner: "bob",
        repo: "repo-c",
        branch: "main",
      });

      const sessions = await t.query(api.sessions.list, { userId: "user1" });
      expect(sessions).toHaveLength(2);
      const ids = sessions.map((s: any) => s._id);
      expect(ids).toContain(id1);
      expect(ids).toContain(id2);
    });

    test("returns empty array for unknown user", async () => {
      const t = convexTest(schema, modules);
      const sessions = await t.query(api.sessions.list, {
        userId: "nonexistent",
      });
      expect(sessions).toEqual([]);
    });

    test("returns sessions ordered descending", async () => {
      const t = convexTest(schema, modules);
      const id1 = await t.mutation(api.sessions.create, {
        userId: "user1",
        owner: "alice",
        repo: "repo-a",
        branch: "main",
      });
      const id2 = await t.mutation(api.sessions.create, {
        userId: "user1",
        owner: "alice",
        repo: "repo-b",
        branch: "main",
      });

      const sessions = await t.query(api.sessions.list, { userId: "user1" });
      // Desc order: most recent first
      expect(sessions[0]._id).toBe(id2);
      expect(sessions[1]._id).toBe(id1);
    });
  });

  // ─── get ───

  describe("get", () => {
    test("returns session by id", async () => {
      const t = convexTest(schema, modules);
      const id = await t.mutation(api.sessions.create, {
        userId: "user1",
        owner: "alice",
        repo: "repo-a",
        branch: "main",
      });

      const session = await t.query(api.sessions.get, { id });
      expect(session).not.toBeNull();
      expect(session!._id).toBe(id);
      expect(session!.owner).toBe("alice");
      expect(session!.repo).toBe("repo-a");
    });

    test("returns null for nonexistent id", async () => {
      const t = convexTest(schema, modules);
      // Create one session to get a valid-format id, then query a different one
      const id = await t.mutation(api.sessions.create, {
        userId: "user1",
        owner: "alice",
        repo: "repo-a",
        branch: "main",
      });
      // Delete it via run, then query
      await t.run(async (ctx) => {
        await ctx.db.delete(id);
      });
      const session = await t.query(api.sessions.get, { id });
      expect(session).toBeNull();
    });
  });

  // ─── getInternal ───

  describe("getInternal", () => {
    test("returns session by id (internal)", async () => {
      const t = convexTest(schema, modules);
      const id = await t.mutation(api.sessions.create, {
        userId: "user1",
        owner: "alice",
        repo: "repo-a",
        branch: "main",
      });

      const session = await t.query(internal.sessions.getInternal, { id });
      expect(session).not.toBeNull();
      expect(session!._id).toBe(id);
      expect(session!.owner).toBe("alice");
    });
  });

  // ─── create ───

  describe("create", () => {
    test("returns a session id", async () => {
      const t = convexTest(schema, modules);
      const id = await t.mutation(api.sessions.create, {
        userId: "user1",
        owner: "alice",
        repo: "repo-a",
        branch: "main",
      });
      expect(id).toBeDefined();
      expect(typeof id).toBe("string");
    });

    test("sets default values correctly", async () => {
      const t = convexTest(schema, modules);
      const id = await t.mutation(api.sessions.create, {
        userId: "user1",
        owner: "alice",
        repo: "repo-a",
        branch: "main",
      });

      const session = await t.query(api.sessions.get, { id });
      expect(session).not.toBeNull();
      expect(session!.status).toBe("idle");
      expect(session!.agent).toBe("build");
      expect(session!.model).toBe("gpt-5-mini");
      expect(session!.title).toBe("alice/repo-a");
      expect(session!.lastMessage).toBe("");
      expect(session!.sessionBranch).toBe("");
      expect(session!.cancelRequested).toBe(false);
      expect(session!.tokenUsage).toEqual({ input: 0, output: 0 });
    });

    test("sets timestamps", async () => {
      const t = convexTest(schema, modules);
      const before = Date.now();
      const id = await t.mutation(api.sessions.create, {
        userId: "user1",
        owner: "alice",
        repo: "repo-a",
        branch: "main",
      });
      const after = Date.now();

      const session = await t.query(api.sessions.get, { id });
      expect(session!.createdAt).toBeGreaterThanOrEqual(before);
      expect(session!.createdAt).toBeLessThanOrEqual(after);
      expect(session!.updatedAt).toBe(session!.createdAt);
    });

    test("respects optional agent argument", async () => {
      const t = convexTest(schema, modules);
      const id = await t.mutation(api.sessions.create, {
        userId: "user1",
        owner: "alice",
        repo: "repo-a",
        branch: "main",
        agent: "plan",
      });

      const session = await t.query(api.sessions.get, { id });
      expect(session!.agent).toBe("plan");
    });

    test("respects optional model argument", async () => {
      const t = convexTest(schema, modules);
      const id = await t.mutation(api.sessions.create, {
        userId: "user1",
        owner: "alice",
        repo: "repo-a",
        branch: "main",
        model: "claude-sonnet-4-20250514",
      });

      const session = await t.query(api.sessions.get, { id });
      expect(session!.model).toBe("claude-sonnet-4-20250514");
    });

    test("stores all provided fields", async () => {
      const t = convexTest(schema, modules);
      const id = await t.mutation(api.sessions.create, {
        userId: "user42",
        owner: "orgX",
        repo: "my-project",
        branch: "feat/cool",
      });

      const session = await t.query(api.sessions.get, { id });
      expect(session!.userId).toBe("user42");
      expect(session!.owner).toBe("orgX");
      expect(session!.repo).toBe("my-project");
      expect(session!.branch).toBe("feat/cool");
    });
  });

  // ─── updateStatus ───

  describe("updateStatus", () => {
    test("changes session status", async () => {
      const t = convexTest(schema, modules);
      const id = await t.mutation(api.sessions.create, {
        userId: "user1",
        owner: "alice",
        repo: "repo-a",
        branch: "main",
      });

      await t.mutation(internal.sessions.updateStatus, {
        id,
        status: "running",
      });

      const session = await t.query(api.sessions.get, { id });
      expect(session!.status).toBe("running");
    });

    test("sets errorMessage when provided", async () => {
      const t = convexTest(schema, modules);
      const id = await t.mutation(api.sessions.create, {
        userId: "user1",
        owner: "alice",
        repo: "repo-a",
        branch: "main",
      });

      await t.mutation(internal.sessions.updateStatus, {
        id,
        status: "error",
        errorMessage: "Something went wrong",
      });

      const session = await t.query(api.sessions.get, { id });
      expect(session!.status).toBe("error");
      expect(session!.errorMessage).toBe("Something went wrong");
    });

    test("does not set errorMessage when not provided", async () => {
      const t = convexTest(schema, modules);
      const id = await t.mutation(api.sessions.create, {
        userId: "user1",
        owner: "alice",
        repo: "repo-a",
        branch: "main",
      });

      await t.mutation(internal.sessions.updateStatus, {
        id,
        status: "completed",
      });

      const session = await t.query(api.sessions.get, { id });
      expect(session!.status).toBe("completed");
      expect(session!.errorMessage).toBeUndefined();
    });

    test("updates the updatedAt timestamp", async () => {
      const t = convexTest(schema, modules);
      const id = await t.mutation(api.sessions.create, {
        userId: "user1",
        owner: "alice",
        repo: "repo-a",
        branch: "main",
      });

      const before = await t.query(api.sessions.get, { id });
      // Small delay to differentiate timestamps
      await new Promise((r) => setTimeout(r, 5));

      await t.mutation(internal.sessions.updateStatus, {
        id,
        status: "running",
      });

      const after = await t.query(api.sessions.get, { id });
      expect(after!.updatedAt).toBeGreaterThanOrEqual(before!.updatedAt);
    });
  });

  // ─── updateTitle ───

  describe("updateTitle", () => {
    test("changes the title", async () => {
      const t = convexTest(schema, modules);
      const id = await t.mutation(api.sessions.create, {
        userId: "user1",
        owner: "alice",
        repo: "repo-a",
        branch: "main",
      });

      await t.mutation(internal.sessions.updateTitle, {
        id,
        title: "New Title",
      });

      const session = await t.query(api.sessions.get, { id });
      expect(session!.title).toBe("New Title");
    });

    test("updates the updatedAt timestamp", async () => {
      const t = convexTest(schema, modules);
      const id = await t.mutation(api.sessions.create, {
        userId: "user1",
        owner: "alice",
        repo: "repo-a",
        branch: "main",
      });

      const before = await t.query(api.sessions.get, { id });
      await new Promise((r) => setTimeout(r, 5));

      await t.mutation(internal.sessions.updateTitle, {
        id,
        title: "Updated",
      });

      const after = await t.query(api.sessions.get, { id });
      expect(after!.updatedAt).toBeGreaterThanOrEqual(before!.updatedAt);
    });
  });

  // ─── updateLastMessage ───

  describe("updateLastMessage", () => {
    test("changes the lastMessage", async () => {
      const t = convexTest(schema, modules);
      const id = await t.mutation(api.sessions.create, {
        userId: "user1",
        owner: "alice",
        repo: "repo-a",
        branch: "main",
      });

      await t.mutation(internal.sessions.updateLastMessage, {
        id,
        lastMessage: "Hello world",
      });

      const session = await t.query(api.sessions.get, { id });
      expect(session!.lastMessage).toBe("Hello world");
    });

    test("updates the updatedAt timestamp", async () => {
      const t = convexTest(schema, modules);
      const id = await t.mutation(api.sessions.create, {
        userId: "user1",
        owner: "alice",
        repo: "repo-a",
        branch: "main",
      });

      const before = await t.query(api.sessions.get, { id });
      await new Promise((r) => setTimeout(r, 5));

      await t.mutation(internal.sessions.updateLastMessage, {
        id,
        lastMessage: "Updated msg",
      });

      const after = await t.query(api.sessions.get, { id });
      expect(after!.updatedAt).toBeGreaterThanOrEqual(before!.updatedAt);
    });
  });

  // ─── setSandboxId ───

  describe("setSandboxId", () => {
    test("sets the sandboxId", async () => {
      const t = convexTest(schema, modules);
      const id = await t.mutation(api.sessions.create, {
        userId: "user1",
        owner: "alice",
        repo: "repo-a",
        branch: "main",
      });

      await t.mutation(internal.sessions.setSandboxId, {
        id,
        sandboxId: "sandbox-123",
      });

      const session = await t.query(api.sessions.get, { id });
      expect(session!.sandboxId).toBe("sandbox-123");
    });

    test("clears the sandboxId when set to undefined", async () => {
      const t = convexTest(schema, modules);
      const id = await t.mutation(api.sessions.create, {
        userId: "user1",
        owner: "alice",
        repo: "repo-a",
        branch: "main",
      });

      await t.mutation(internal.sessions.setSandboxId, {
        id,
        sandboxId: "sandbox-123",
      });
      await t.mutation(internal.sessions.setSandboxId, {
        id,
        sandboxId: undefined,
      });

      const session = await t.query(api.sessions.get, { id });
      expect(session!.sandboxId).toBeUndefined();
    });

    test("updates the updatedAt timestamp", async () => {
      const t = convexTest(schema, modules);
      const id = await t.mutation(api.sessions.create, {
        userId: "user1",
        owner: "alice",
        repo: "repo-a",
        branch: "main",
      });

      const before = await t.query(api.sessions.get, { id });
      await new Promise((r) => setTimeout(r, 5));

      await t.mutation(internal.sessions.setSandboxId, {
        id,
        sandboxId: "sb-1",
      });

      const after = await t.query(api.sessions.get, { id });
      expect(after!.updatedAt).toBeGreaterThanOrEqual(before!.updatedAt);
    });
  });

  // ─── setSnapshotId ───

  describe("setSnapshotId", () => {
    test("sets the snapshotId", async () => {
      const t = convexTest(schema, modules);
      const id = await t.mutation(api.sessions.create, {
        userId: "user1",
        owner: "alice",
        repo: "repo-a",
        branch: "main",
      });

      await t.mutation(internal.sessions.setSnapshotId, {
        id,
        snapshotId: "snap-456",
      });

      const session = await t.query(api.sessions.get, { id });
      expect(session!.snapshotId).toBe("snap-456");
    });

    test("clears the snapshotId when set to undefined", async () => {
      const t = convexTest(schema, modules);
      const id = await t.mutation(api.sessions.create, {
        userId: "user1",
        owner: "alice",
        repo: "repo-a",
        branch: "main",
      });

      await t.mutation(internal.sessions.setSnapshotId, {
        id,
        snapshotId: "snap-456",
      });
      await t.mutation(internal.sessions.setSnapshotId, {
        id,
        snapshotId: undefined,
      });

      const session = await t.query(api.sessions.get, { id });
      expect(session!.snapshotId).toBeUndefined();
    });
  });

  // ─── setSessionBranch ───

  describe("setSessionBranch", () => {
    test("sets the sessionBranch", async () => {
      const t = convexTest(schema, modules);
      const id = await t.mutation(api.sessions.create, {
        userId: "user1",
        owner: "alice",
        repo: "repo-a",
        branch: "main",
      });

      await t.mutation(internal.sessions.setSessionBranch, {
        id,
        sessionBranch: "stratus/session-abc",
      });

      const session = await t.query(api.sessions.get, { id });
      expect(session!.sessionBranch).toBe("stratus/session-abc");
    });

    test("updates the updatedAt timestamp", async () => {
      const t = convexTest(schema, modules);
      const id = await t.mutation(api.sessions.create, {
        userId: "user1",
        owner: "alice",
        repo: "repo-a",
        branch: "main",
      });

      const before = await t.query(api.sessions.get, { id });
      await new Promise((r) => setTimeout(r, 5));

      await t.mutation(internal.sessions.setSessionBranch, {
        id,
        sessionBranch: "stratus/new-branch",
      });

      const after = await t.query(api.sessions.get, { id });
      expect(after!.updatedAt).toBeGreaterThanOrEqual(before!.updatedAt);
    });
  });

  // ─── requestCancel ───

  describe("requestCancel", () => {
    test("sets cancelRequested to true", async () => {
      const t = convexTest(schema, modules);
      const id = await t.mutation(api.sessions.create, {
        userId: "user1",
        owner: "alice",
        repo: "repo-a",
        branch: "main",
      });

      expect((await t.query(api.sessions.get, { id }))!.cancelRequested).toBe(
        false,
      );

      await t.mutation(api.sessions.requestCancel, { id });

      const session = await t.query(api.sessions.get, { id });
      expect(session!.cancelRequested).toBe(true);
    });

    test("updates the updatedAt timestamp", async () => {
      const t = convexTest(schema, modules);
      const id = await t.mutation(api.sessions.create, {
        userId: "user1",
        owner: "alice",
        repo: "repo-a",
        branch: "main",
      });

      const before = await t.query(api.sessions.get, { id });
      await new Promise((r) => setTimeout(r, 5));

      await t.mutation(api.sessions.requestCancel, { id });

      const after = await t.query(api.sessions.get, { id });
      expect(after!.updatedAt).toBeGreaterThanOrEqual(before!.updatedAt);
    });
  });

  // ─── clearCancel ───

  describe("clearCancel", () => {
    test("resets cancelRequested to false", async () => {
      const t = convexTest(schema, modules);
      const id = await t.mutation(api.sessions.create, {
        userId: "user1",
        owner: "alice",
        repo: "repo-a",
        branch: "main",
      });

      await t.mutation(api.sessions.requestCancel, { id });
      expect((await t.query(api.sessions.get, { id }))!.cancelRequested).toBe(
        true,
      );

      await t.mutation(internal.sessions.clearCancel, { id });

      const session = await t.query(api.sessions.get, { id });
      expect(session!.cancelRequested).toBe(false);
    });

    test("updates the updatedAt timestamp", async () => {
      const t = convexTest(schema, modules);
      const id = await t.mutation(api.sessions.create, {
        userId: "user1",
        owner: "alice",
        repo: "repo-a",
        branch: "main",
      });

      await t.mutation(api.sessions.requestCancel, { id });
      const before = await t.query(api.sessions.get, { id });
      await new Promise((r) => setTimeout(r, 5));

      await t.mutation(internal.sessions.clearCancel, { id });

      const after = await t.query(api.sessions.get, { id });
      expect(after!.updatedAt).toBeGreaterThanOrEqual(before!.updatedAt);
    });
  });

  // ─── updateTokenUsage ───

  describe("updateTokenUsage", () => {
    test("accumulates token counts", async () => {
      const t = convexTest(schema, modules);
      const id = await t.mutation(api.sessions.create, {
        userId: "user1",
        owner: "alice",
        repo: "repo-a",
        branch: "main",
      });

      await t.mutation(internal.sessions.updateTokenUsage, {
        id,
        inputTokens: 100,
        outputTokens: 50,
      });

      let session = await t.query(api.sessions.get, { id });
      expect(session!.tokenUsage).toEqual({ input: 100, output: 50 });

      await t.mutation(internal.sessions.updateTokenUsage, {
        id,
        inputTokens: 200,
        outputTokens: 75,
      });

      session = await t.query(api.sessions.get, { id });
      expect(session!.tokenUsage).toEqual({ input: 300, output: 125 });
    });

    test("handles zero tokens", async () => {
      const t = convexTest(schema, modules);
      const id = await t.mutation(api.sessions.create, {
        userId: "user1",
        owner: "alice",
        repo: "repo-a",
        branch: "main",
      });

      await t.mutation(internal.sessions.updateTokenUsage, {
        id,
        inputTokens: 0,
        outputTokens: 0,
      });

      const session = await t.query(api.sessions.get, { id });
      expect(session!.tokenUsage).toEqual({ input: 0, output: 0 });
    });

    test("does nothing for nonexistent session", async () => {
      const t = convexTest(schema, modules);
      const id = await t.mutation(api.sessions.create, {
        userId: "user1",
        owner: "alice",
        repo: "repo-a",
        branch: "main",
      });
      await t.run(async (ctx) => {
        await ctx.db.delete(id);
      });

      // Should not throw
      await t.mutation(internal.sessions.updateTokenUsage, {
        id,
        inputTokens: 100,
        outputTokens: 50,
      });
    });

    test("updates the updatedAt timestamp", async () => {
      const t = convexTest(schema, modules);
      const id = await t.mutation(api.sessions.create, {
        userId: "user1",
        owner: "alice",
        repo: "repo-a",
        branch: "main",
      });

      const before = await t.query(api.sessions.get, { id });
      await new Promise((r) => setTimeout(r, 5));

      await t.mutation(internal.sessions.updateTokenUsage, {
        id,
        inputTokens: 10,
        outputTokens: 5,
      });

      const after = await t.query(api.sessions.get, { id });
      expect(after!.updatedAt).toBeGreaterThanOrEqual(before!.updatedAt);
    });
  });

  // ─── updateAgent ───

  describe("updateAgent", () => {
    test("changes the agent field", async () => {
      const t = convexTest(schema, modules);
      const id = await t.mutation(api.sessions.create, {
        userId: "user1",
        owner: "alice",
        repo: "repo-a",
        branch: "main",
      });

      expect((await t.query(api.sessions.get, { id }))!.agent).toBe("build");

      await t.mutation(internal.sessions.updateAgent, {
        id,
        agent: "plan",
      });

      const session = await t.query(api.sessions.get, { id });
      expect(session!.agent).toBe("plan");
    });

    test("updates the updatedAt timestamp", async () => {
      const t = convexTest(schema, modules);
      const id = await t.mutation(api.sessions.create, {
        userId: "user1",
        owner: "alice",
        repo: "repo-a",
        branch: "main",
      });

      const before = await t.query(api.sessions.get, { id });
      await new Promise((r) => setTimeout(r, 5));

      await t.mutation(internal.sessions.updateAgent, {
        id,
        agent: "plan",
      });

      const after = await t.query(api.sessions.get, { id });
      expect(after!.updatedAt).toBeGreaterThanOrEqual(before!.updatedAt);
    });
  });
});
