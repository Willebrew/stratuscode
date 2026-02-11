"use node";

/**
 * Core Agent Action
 *
 * Runs the SAGE agent loop (processDirectly) inside a Convex action.
 * Manages sandbox lifecycle, token batching, snapshots, and cancellation.
 * Replaces the old /api/chat Vercel Function endpoint.
 */

import { action, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Sandbox } from "@vercel/sandbox";
import { processDirectly, createToolRegistry } from "@willebrew/sage-core";
import { buildSystemPrompt, BUILT_IN_AGENTS, modelSupportsReasoning } from "@stratuscode/shared";
import { registerSandboxToolsConvex, type ConvexSandboxInfo } from "./lib/tools";

// ─── Context window lookup (mirrors cloud-session.ts) ───

const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  "gpt-5-mini": 128_000,
  "o3-mini": 128_000,
  "gpt-5.3-codex": 272_000,
  "gpt-5.2-codex": 272_000,
  "gpt-5.1-codex": 128_000,
  "gpt-5.1-codex-max": 128_000,
  "gpt-5.1-codex-mini": 128_000,
  "gpt-5-codex": 400_000,
  "codex-mini": 200_000,
  "kimi-k2.5-free": 128_000,
  "minimax-m2.1-free": 128_000,
  "trinity-large-preview-free": 128_000,
  "glm-4.7-free": 128_000,
  "big-pickle": 128_000,
  "anthropic/claude-sonnet-4": 200_000,
  "anthropic/claude-3.5-sonnet": 200_000,
  "google/gemini-2.5-pro-preview": 1_000_000,
  "google/gemini-2.5-flash-preview": 1_000_000,
  "deepseek/deepseek-r1": 128_000,
  "deepseek/deepseek-chat-v3": 128_000,
  "openai/gpt-4o": 128_000,
  "openai/o3-mini": 128_000,
  "meta-llama/llama-4-maverick": 128_000,
  "moonshotai/kimi-k2": 128_000,
};

// ─── Plan mode helpers (from session-manager.ts) ───

function PLAN_MODE_REMINDER(planFilePath: string): string {
  return `<system-reminder>
You are in PLAN mode. Follow this workflow:

## Plan Workflow

### Phase 1: Initial Understanding
Goal: Understand the user's request by reading code and asking clarifying questions.
1. Explore the codebase to understand the relevant code and existing patterns.
2. After exploring, use the **question** tool to clarify ambiguities.

### Phase 2: Design
Goal: Design an implementation approach based on your exploration and the user's answers.

### Phase 3: Create Plan
Goal: Write a structured plan using the todowrite tool AND the plan file.
1. Create a clear, ordered todo list capturing each implementation step using todowrite.
2. Write a detailed plan to the plan file at: ${planFilePath}
   This is the ONLY file you are allowed to edit in plan mode.

### Phase 4: Call plan_exit
Call plan_exit to indicate you are done planning.

**Critical rule:** Your turn should ONLY end with either asking the user a question (via the question tool) or calling plan_exit.

## Question Tool Usage
**You MUST use the question tool whenever you need the user to make a choice.** Do NOT write questions as plain text.
</system-reminder>`;
}

function BUILD_SWITCH_REMINDER(planFilePath: string): string {
  return `<system-reminder>
Your operational mode has changed from plan to build.
You are permitted to make file changes, run shell commands, and utilize your full arsenal of tools.
A plan file exists at: ${planFilePath}
Read the plan file first, then work through each task, updating status as you go.
</system-reminder>`;
}

// ─── Sandbox credentials ───

function getSandboxCredentials() {
  const token = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_TEAM_ID;
  if (!token || !projectId || !teamId) {
    throw new Error("Missing VERCEL_TOKEN, VERCEL_PROJECT_ID, or VERCEL_TEAM_ID");
  }
  return { token, projectId, teamId };
}

// ─── Sandbox helpers ───

async function createFreshSandbox(
  owner: string,
  repo: string,
  branch: string,
  githubToken: string,
  sessionBranch: string
): Promise<Sandbox> {
  const sandbox = await Sandbox.create({
    ...getSandboxCredentials(),
    runtime: "node22",
    timeout: 800_000,
  });

  const workDir = "/vercel/sandbox";
  const repoUrl = `https://x-access-token:${githubToken}@github.com/${owner}/${repo}.git`;

  const cloneResult = await sandbox.runCommand("git", [
    "clone", "--depth", "1", "--branch", branch, repoUrl, workDir,
  ]);
  if (cloneResult.exitCode !== 0) {
    const stderr = await cloneResult.stderr();
    await sandbox.stop();
    throw new Error(`Failed to clone repository: ${stderr}`);
  }

  await sandbox.runCommand("bash", ["-c", `cd '${workDir}' && git checkout -b '${sessionBranch}'`]);
  await sandbox.runCommand("bash", ["-c", `cd '${workDir}' && git config user.email 'stratuscode@users.noreply.github.com'`]);
  await sandbox.runCommand("bash", ["-c", `cd '${workDir}' && git config user.name 'StratusCode'`]);

  return sandbox;
}

// ─── SAGE config builder (from cloud-session.ts) ───

function buildSageConfig(
  model: string,
  apiKey: string,
  baseUrl: string,
  providerType?: string,
  providerHeaders?: Record<string, string>,
  sessionId?: string
) {
  const supportsReasoning = modelSupportsReasoning(model);
  const reasoningEffort: "low" | "medium" | "high" | "minimal" | undefined =
    supportsReasoning ? "high" : undefined;

  let headers = providerHeaders;
  if (baseUrl.includes("chatgpt.com/backend-api/codex")) {
    headers = {
      ...headers,
      originator: "opencode",
      "User-Agent": "stratuscode/0.1.0 (cloud)",
      session_id: sessionId || "",
    };
  }
  if (baseUrl.includes("opencode.ai/zen")) {
    headers = {
      ...headers,
      "x-opencode-session": sessionId || "",
      "x-opencode-request": `req-${Date.now()}`,
      "x-opencode-project": "stratuscode",
    };
  }
  if (baseUrl.includes("openrouter.ai")) {
    headers = {
      ...headers,
      "HTTP-Referer": "https://stratuscode.dev/",
      "X-Title": "StratusCode",
    };
  }

  const contextWindow = MODEL_CONTEXT_WINDOWS[model] ?? 128_000;

  return {
    model,
    parallelToolCalls: true,
    enableReasoningEffort: !!reasoningEffort,
    reasoningEffort,
    provider: {
      apiKey,
      baseUrl,
      type: providerType as "responses-api" | "chat-completions" | undefined,
      headers,
    },
    agent: {
      name: "stratuscode",
      maxDepth: 300,
      toolTimeout: 60000,
      maxToolResultSize: 100000,
    },
    context: {
      enabled: true,
      contextWindow,
      maxResponseTokens: 16_384,
      summary: {
        enabled: true,
        model,
        targetTokens: 500,
      },
    },
  };
}

// ─── Main action ───

export const sendMessage = internalAction({
  args: {
    sessionId: v.id("sessions"),
    message: v.string(),
    model: v.optional(v.string()),
    apiKey: v.optional(v.string()),
    baseUrl: v.optional(v.string()),
    providerType: v.optional(v.string()),
    providerHeaders: v.optional(v.string()), // JSON string
    alphaMode: v.optional(v.boolean()),
    reasoningEffort: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const session = await ctx.runQuery(internal.sessions.getInternal, { id: args.sessionId });
    if (!session) throw new Error("Session not found");

    // Clear any previous cancel request
    await ctx.runMutation(internal.sessions.clearCancel, { id: args.sessionId });

    // Set status to running
    await ctx.runMutation(internal.sessions.updateStatus, {
      id: args.sessionId,
      status: "running",
    });

    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) throw new Error("GITHUB_TOKEN not configured");

    const model = args.model || session.model || "gpt-5-mini";
    const apiKey = args.apiKey || process.env.OPENAI_API_KEY || "";
    const baseUrl = args.baseUrl || "https://api.openai.com/v1";
    const providerType = args.providerType;
    const providerHeaders = args.providerHeaders ? JSON.parse(args.providerHeaders) : undefined;
    const workDir = "/vercel/sandbox";
    const sessionBranch = session.sessionBranch || `stratuscode/${session._id}`;

    let sandbox: Sandbox | null = null;

    try {
      // ── 1. Create or resume sandbox ──

      if (session.snapshotId) {
        // Resume from snapshot
        try {
          sandbox = await Sandbox.create({
            ...getSandboxCredentials(),
            source: { type: "snapshot", snapshotId: session.snapshotId },
            timeout: 800_000,
          });
        } catch (e) {
          console.warn("Snapshot expired or failed, creating fresh sandbox:", e);
          sandbox = null;
        }
      }

      if (!sandbox && session.sandboxId) {
        // Try to reconnect to existing sandbox
        try {
          sandbox = await Sandbox.get({ ...getSandboxCredentials(), sandboxId: session.sandboxId });
          if (sandbox.status !== "running") sandbox = null;
        } catch {
          sandbox = null;
        }
      }

      if (!sandbox) {
        // Fresh clone
        sandbox = await createFreshSandbox(
          session.owner,
          session.repo,
          session.branch,
          githubToken,
          sessionBranch
        );
        // Update session branch if it was empty
        if (!session.sessionBranch) {
          await ctx.runMutation(internal.sessions.setSessionBranch, {
            id: args.sessionId,
            sessionBranch,
          });
        }
      }

      // Store sandbox ID
      await ctx.runMutation(internal.sessions.setSandboxId, {
        id: args.sessionId,
        sandboxId: sandbox.sandboxId,
      });

      // ── 2. Load agent state for resume ──

      const agentState = await ctx.runQuery(internal.agent_state.get, {
        sessionId: args.sessionId,
      });

      const previousMessages = agentState?.sageMessages
        ? JSON.parse(agentState.sageMessages)
        : [];

      let currentAgent = agentState?.agentMode || session.agent || "build";
      let planFilePath = agentState?.planFilePath || null;
      let justSwitchedFromPlan = false;

      // ── 3. Build message content ──

      let messageContent = args.message;

      if (currentAgent === "plan") {
        if (!planFilePath) {
          planFilePath = `${workDir}/.stratuscode/plans/${session._id}.md`;
          await sandbox.runCommand("bash", ["-c", `mkdir -p '${workDir}/.stratuscode/plans'`]);
        }
        messageContent += "\n\n" + PLAN_MODE_REMINDER(planFilePath);
      }

      if (justSwitchedFromPlan && planFilePath) {
        messageContent += "\n\n" + BUILD_SWITCH_REMINDER(planFilePath);
      }

      const messages = [...previousMessages, { role: "user", content: messageContent }];

      // ── 4. Build tool registry ──

      const sandboxInfo: ConvexSandboxInfo = {
        sandboxId: sandbox.sandboxId,
        sandbox,
        owner: session.owner,
        repo: session.repo,
        branch: session.branch,
        sessionBranch,
        workDir,
        alphaMode: args.alphaMode,
      };

      const registry = createToolRegistry();
      registerSandboxToolsConvex(registry, sandboxInfo, {
        ctx,
        sessionId: args.sessionId,
      });

      // ── 5. Build system prompt and SAGE config ──

      const agentDef = BUILT_IN_AGENTS[currentAgent] || BUILT_IN_AGENTS.build!;
      const systemPrompt = buildSystemPrompt({
        agent: agentDef,
        tools: registry.toAPIFormat().map((t: any) => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        })),
        projectDir: workDir,
        modelId: model,
      });

      const sageConfig = buildSageConfig(
        model,
        apiKey,
        baseUrl,
        providerType,
        providerHeaders,
        String(args.sessionId)
      );

      // ── 6. Initialize streaming state ──

      await ctx.runMutation(internal.streaming.start, { sessionId: args.sessionId });

      // Store user message
      await ctx.runMutation(internal.messages.create, {
        sessionId: args.sessionId,
        role: "user",
        content: args.message,
        parts: [{ type: "text", content: args.message }],
      });

      // Update title from first message
      if (!previousMessages.length) {
        const title = args.message.slice(0, 80) + (args.message.length > 80 ? "..." : "");
        await ctx.runMutation(internal.sessions.updateTitle, { id: args.sessionId, title });
      }
      await ctx.runMutation(internal.sessions.updateLastMessage, {
        id: args.sessionId,
        lastMessage: args.message.slice(0, 200),
      });

      // ── 7. Run processDirectly with batched callbacks ──

      let tokenBuffer = "";
      let reasoningBuffer = "";
      let flushTimeout: ReturnType<typeof setTimeout> | null = null;

      const flushTokens = async () => {
        if (tokenBuffer) {
          const batch = tokenBuffer;
          tokenBuffer = "";
          await ctx.runMutation(internal.streaming.appendToken, {
            sessionId: args.sessionId,
            content: batch,
          });
        }
        if (reasoningBuffer) {
          const batch = reasoningBuffer;
          reasoningBuffer = "";
          await ctx.runMutation(internal.streaming.appendReasoning, {
            sessionId: args.sessionId,
            content: batch,
          });
        }
      };

      const result: any = await processDirectly({
        systemPrompt,
        messages,
        tools: registry,
        config: sageConfig,
        sessionId: String(args.sessionId),
        existingSummary: agentState?.existingSummary
          ? JSON.parse(agentState.existingSummary)
          : undefined,
        toolMetadata: { projectDir: workDir },
        callbacks: {
          onToken: (token: string) => {
            tokenBuffer += token;
            if (!flushTimeout) {
              flushTimeout = setTimeout(async () => {
                flushTimeout = null;
                await flushTokens();
              }, 100);
            }
          },
          onReasoning: (text: string) => {
            reasoningBuffer += text;
            if (!flushTimeout) {
              flushTimeout = setTimeout(async () => {
                flushTimeout = null;
                await flushTokens();
              }, 100);
            }
          },
          onToolCall: async (tc: any) => {
            // Flush pending tokens before tool call
            await flushTokens();

            await ctx.runMutation(internal.streaming.addToolCall, {
              sessionId: args.sessionId,
              toolCallId: tc.id,
              toolName: tc.function?.name || tc.name || "",
              toolArgs: tc.function?.arguments || "",
            });
          },
          onToolResult: async (tc: any, result: string) => {
            const toolName = tc.function?.name || "";
            const toolArgs = tc.function?.arguments || "";

            await ctx.runMutation(internal.streaming.updateToolResult, {
              sessionId: args.sessionId,
              toolCallId: tc.id,
              result: result.slice(0, 5000),
              toolArgs,
            });

            // Handle todowrite updates
            if (toolName === "todowrite") {
              // Todos already persisted by the tool itself via Convex mutation
            }

            // Handle plan mode switches
            if (toolName === "plan_enter") {
              try {
                const parsed = JSON.parse(result);
                if (parsed.entered && parsed.mode === "plan") {
                  currentAgent = "plan";
                  await ctx.runMutation(internal.sessions.updateAgent, {
                    id: args.sessionId,
                    agent: "plan",
                  });
                }
              } catch {}
            }

            if (toolName === "plan_exit") {
              try {
                const parsed = JSON.parse(result);
                if (parsed.approved && parsed.modeSwitch === "build") {
                  currentAgent = "build";
                  justSwitchedFromPlan = true;
                  await ctx.runMutation(internal.sessions.updateAgent, {
                    id: args.sessionId,
                    agent: "build",
                  });
                }
              } catch {}
            }

            // Check for cancellation between tool calls
            const currentSession = await ctx.runQuery(
              internal.sessions.getInternal,
              { id: args.sessionId }
            );
            if (currentSession?.cancelRequested) {
              throw new Error("CANCELLED_BY_USER");
            }
          },
          onError: async (err: Error) => {
            console.error("[agent] Error:", err.message);
          },
        },
      });

      // Final flush of any remaining tokens
      if (flushTimeout) clearTimeout(flushTimeout);
      await flushTokens();

      // ── 8. Finalize ──

      await ctx.runMutation(internal.streaming.finish, { sessionId: args.sessionId });

      // Build parts array for the final message
      const streamState = await ctx.runQuery(internal.streaming.getInternal, {
        sessionId: args.sessionId,
      });

      const parts: any[] = [];
      if (streamState?.reasoning) {
        parts.push({ type: "reasoning", content: streamState.reasoning });
      }
      const toolCalls = streamState?.toolCalls ? JSON.parse(streamState.toolCalls) : [];
      const textContent = streamState?.content || result.content || "";

      // Interleave tool calls with text content
      if (toolCalls.length > 0) {
        for (const tc of toolCalls) {
          parts.push({
            type: "tool_call",
            toolCall: {
              id: tc.id,
              name: tc.name,
              args: tc.args,
              result: tc.result,
              status: tc.status || "completed",
            },
          });
        }
      }
      if (textContent) {
        parts.push({ type: "text", content: textContent });
      }

      // Save the complete assistant message
      await ctx.runMutation(internal.messages.create, {
        sessionId: args.sessionId,
        role: "assistant",
        content: result.content || textContent,
        parts,
      });

      // Save agent state for next turn
      const updatedMessages = result.responseMessages
        ? [...messages, ...result.responseMessages]
        : [...messages, { role: "assistant", content: result.content }];

      await ctx.runMutation(internal.agent_state.save, {
        sessionId: args.sessionId,
        sageMessages: JSON.stringify(updatedMessages),
        existingSummary: result.newSummary
          ? JSON.stringify(result.newSummary)
          : undefined,
        planFilePath: planFilePath || undefined,
        agentMode: currentAgent,
      });

      // Update last message preview
      const preview = (result.content || "").slice(0, 200);
      await ctx.runMutation(internal.sessions.updateLastMessage, {
        id: args.sessionId,
        lastMessage: preview,
      });

      // ── 9. Snapshot sandbox for fast resume ──

      try {
        const snapshot = await sandbox.snapshot();
        await ctx.runMutation(internal.sessions.setSnapshotId, {
          id: args.sessionId,
          snapshotId: snapshot.snapshotId,
        });
        // snapshot() stops the sandbox, so clear the sandboxId
        await ctx.runMutation(internal.sessions.setSandboxId, {
          id: args.sessionId,
          sandboxId: undefined,
        });
      } catch (e) {
        console.warn("[agent] Failed to snapshot sandbox:", e);
        // Sandbox may still be running, that's okay — next turn will reconnect
      }

      // Set status to idle
      await ctx.runMutation(internal.sessions.updateStatus, {
        id: args.sessionId,
        status: "idle",
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isCancelled = errorMessage === "CANCELLED_BY_USER";

      console.error(`[agent] ${isCancelled ? "Cancelled" : "Error"}:`, errorMessage);

      // Try to snapshot sandbox even on error/cancel
      if (sandbox) {
        try {
          const snapshot = await sandbox.snapshot();
          await ctx.runMutation(internal.sessions.setSnapshotId, {
            id: args.sessionId,
            snapshotId: snapshot.snapshotId,
          });
          await ctx.runMutation(internal.sessions.setSandboxId, {
            id: args.sessionId,
            sandboxId: undefined,
          });
        } catch {
          // Best effort
        }
      }

      await ctx.runMutation(internal.streaming.finish, { sessionId: args.sessionId });

      await ctx.runMutation(internal.sessions.updateStatus, {
        id: args.sessionId,
        status: isCancelled ? "idle" : "error",
        errorMessage: isCancelled ? undefined : errorMessage,
      });
    }
  },
});

// ─── Public action wrapper (called from frontend) ───

export const send = action({
  args: {
    sessionId: v.id("sessions"),
    message: v.string(),
    model: v.optional(v.string()),
    alphaMode: v.optional(v.boolean()),
    reasoningEffort: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Look up provider config from environment
    const apiKey = process.env.OPENAI_API_KEY || "";
    const baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

    // Schedule the internal action (fire-and-forget, runs in background)
    await ctx.scheduler.runAfter(0, internal.agent.sendMessage, {
      sessionId: args.sessionId,
      message: args.message,
      model: args.model,
      apiKey,
      baseUrl,
      alphaMode: args.alphaMode,
      reasoningEffort: args.reasoningEffort,
    });
  },
});
