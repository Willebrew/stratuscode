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

describe("todos", () => {
  // ─── list ───

  describe("list", () => {
    test("returns todos for a session", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);

      await t.mutation(internal.todos.replace, {
        sessionId,
        todos: [
          { content: "Todo 1" },
          { content: "Todo 2" },
        ],
      });

      const todos = await t.query(api.todos.list, { sessionId });
      expect(todos).toHaveLength(2);
      const contents = todos.map((td: any) => td.content);
      expect(contents).toContain("Todo 1");
      expect(contents).toContain("Todo 2");
    });

    test("returns empty array when no todos exist", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);

      const todos = await t.query(api.todos.list, { sessionId });
      expect(todos).toEqual([]);
    });

    test("does not return todos from other sessions", async () => {
      const t = convexTest(schema, modules);
      const sessionId1 = await createSession(t);
      const sessionId2 = await t.mutation(api.sessions.create, {
        userId: "user2",
        owner: "bob",
        repo: "repo-b",
        branch: "main",
      });

      await t.mutation(internal.todos.replace, {
        sessionId: sessionId1,
        todos: [{ content: "Session 1 todo" }],
      });
      await t.mutation(internal.todos.replace, {
        sessionId: sessionId2,
        todos: [{ content: "Session 2 todo" }],
      });

      const todos1 = await t.query(api.todos.list, { sessionId: sessionId1 });
      expect(todos1).toHaveLength(1);
      expect(todos1[0].content).toBe("Session 1 todo");

      const todos2 = await t.query(api.todos.list, { sessionId: sessionId2 });
      expect(todos2).toHaveLength(1);
      expect(todos2[0].content).toBe("Session 2 todo");
    });
  });

  // ─── listInternal ───

  describe("listInternal", () => {
    test("returns todos for a session (internal)", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);

      await t.mutation(internal.todos.replace, {
        sessionId,
        todos: [
          { content: "Internal Todo 1" },
          { content: "Internal Todo 2" },
          { content: "Internal Todo 3" },
        ],
      });

      const todos = await t.query(internal.todos.listInternal, { sessionId });
      expect(todos).toHaveLength(3);
    });

    test("returns empty array when no todos exist", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);

      const todos = await t.query(internal.todos.listInternal, { sessionId });
      expect(todos).toEqual([]);
    });
  });

  // ─── replace ───

  describe("replace", () => {
    test("inserts new todos for a session", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);

      await t.mutation(internal.todos.replace, {
        sessionId,
        todos: [
          { content: "First" },
          { content: "Second" },
        ],
      });

      const todos = await t.query(api.todos.list, { sessionId });
      expect(todos).toHaveLength(2);
    });

    test("deletes existing todos before inserting new ones", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);

      // First set
      await t.mutation(internal.todos.replace, {
        sessionId,
        todos: [
          { content: "Old 1" },
          { content: "Old 2" },
        ],
      });

      // Replace with new set
      await t.mutation(internal.todos.replace, {
        sessionId,
        todos: [
          { content: "New 1" },
          { content: "New 2" },
          { content: "New 3" },
        ],
      });

      const todos = await t.query(api.todos.list, { sessionId });
      expect(todos).toHaveLength(3);
      const contents = todos.map((td: any) => td.content);
      expect(contents).not.toContain("Old 1");
      expect(contents).not.toContain("Old 2");
      expect(contents).toContain("New 1");
      expect(contents).toContain("New 2");
      expect(contents).toContain("New 3");
    });

    test("defaults status to pending when not specified", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);

      await t.mutation(internal.todos.replace, {
        sessionId,
        todos: [{ content: "A todo" }],
      });

      const todos = await t.query(api.todos.list, { sessionId });
      expect(todos[0].status).toBe("pending");
    });

    test("respects provided status", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);

      await t.mutation(internal.todos.replace, {
        sessionId,
        todos: [
          { content: "Done task", status: "completed" },
          { content: "In progress", status: "in_progress" },
        ],
      });

      const todos = await t.query(api.todos.list, { sessionId });
      const done = todos.find((td: any) => td.content === "Done task");
      const inProgress = todos.find(
        (td: any) => td.content === "In progress",
      );
      expect(done!.status).toBe("completed");
      expect(inProgress!.status).toBe("in_progress");
    });

    test("stores optional priority", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);

      await t.mutation(internal.todos.replace, {
        sessionId,
        todos: [
          { content: "High priority", priority: "high" },
          { content: "No priority" },
        ],
      });

      const todos = await t.query(api.todos.list, { sessionId });
      const highPriority = todos.find(
        (td: any) => td.content === "High priority",
      );
      const noPriority = todos.find(
        (td: any) => td.content === "No priority",
      );
      expect(highPriority!.priority).toBe("high");
      expect(noPriority!.priority).toBeUndefined();
    });

    test("sets createdAt on new todos", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);

      const before = Date.now();
      await t.mutation(internal.todos.replace, {
        sessionId,
        todos: [{ content: "Timestamped" }],
      });
      const after = Date.now();

      const todos = await t.query(api.todos.list, { sessionId });
      expect(todos[0].createdAt).toBeGreaterThanOrEqual(before);
      expect(todos[0].createdAt).toBeLessThanOrEqual(after);
    });

    test("handles empty todos array (clears all)", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);

      await t.mutation(internal.todos.replace, {
        sessionId,
        todos: [{ content: "Will be deleted" }],
      });

      await t.mutation(internal.todos.replace, {
        sessionId,
        todos: [],
      });

      const todos = await t.query(api.todos.list, { sessionId });
      expect(todos).toEqual([]);
    });

    test("does not affect todos of other sessions", async () => {
      const t = convexTest(schema, modules);
      const sessionId1 = await createSession(t);
      const sessionId2 = await t.mutation(api.sessions.create, {
        userId: "user2",
        owner: "bob",
        repo: "repo-b",
        branch: "main",
      });

      await t.mutation(internal.todos.replace, {
        sessionId: sessionId1,
        todos: [{ content: "Session 1 todo" }],
      });
      await t.mutation(internal.todos.replace, {
        sessionId: sessionId2,
        todos: [{ content: "Session 2 todo" }],
      });

      // Replace session 1 todos
      await t.mutation(internal.todos.replace, {
        sessionId: sessionId1,
        todos: [{ content: "New session 1 todo" }],
      });

      // Session 2 todos should be unaffected
      const todos2 = await t.query(api.todos.list, { sessionId: sessionId2 });
      expect(todos2).toHaveLength(1);
      expect(todos2[0].content).toBe("Session 2 todo");
    });
  });

  // ─── updateStatus ───

  describe("updateStatus", () => {
    test("patches the status field", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);

      await t.mutation(internal.todos.replace, {
        sessionId,
        todos: [{ content: "My task" }],
      });

      const todos = await t.query(api.todos.list, { sessionId });
      const todoId = todos[0]._id;
      expect(todos[0].status).toBe("pending");

      await t.mutation(internal.todos.updateStatus, {
        id: todoId,
        status: "in_progress",
      });

      const updatedTodos = await t.query(api.todos.list, { sessionId });
      expect(updatedTodos[0].status).toBe("in_progress");
    });

    test("can set status to completed", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);

      await t.mutation(internal.todos.replace, {
        sessionId,
        todos: [{ content: "Finish me" }],
      });

      const todos = await t.query(api.todos.list, { sessionId });
      const todoId = todos[0]._id;

      await t.mutation(internal.todos.updateStatus, {
        id: todoId,
        status: "completed",
      });

      const updated = await t.query(api.todos.list, { sessionId });
      expect(updated[0].status).toBe("completed");
    });

    test("does not affect other todos", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);

      await t.mutation(internal.todos.replace, {
        sessionId,
        todos: [
          { content: "Task A" },
          { content: "Task B" },
        ],
      });

      const todos = await t.query(api.todos.list, { sessionId });
      const taskA = todos.find((td: any) => td.content === "Task A");
      const taskB = todos.find((td: any) => td.content === "Task B");

      await t.mutation(internal.todos.updateStatus, {
        id: taskA!._id,
        status: "completed",
      });

      const updated = await t.query(api.todos.list, { sessionId });
      const updatedA = updated.find((td: any) => td.content === "Task A");
      const updatedB = updated.find((td: any) => td.content === "Task B");
      expect(updatedA!.status).toBe("completed");
      expect(updatedB!.status).toBe("pending");
    });

    test("preserves other fields when updating status", async () => {
      const t = convexTest(schema, modules);
      const sessionId = await createSession(t);

      await t.mutation(internal.todos.replace, {
        sessionId,
        todos: [{ content: "Important", priority: "high" }],
      });

      const todos = await t.query(api.todos.list, { sessionId });

      await t.mutation(internal.todos.updateStatus, {
        id: todos[0]._id,
        status: "in_progress",
      });

      const updated = await t.query(api.todos.list, { sessionId });
      expect(updated[0].content).toBe("Important");
      expect(updated[0].priority).toBe("high");
      expect(updated[0].status).toBe("in_progress");
    });
  });
});
