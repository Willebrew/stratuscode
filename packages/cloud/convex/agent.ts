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
import { buildSystemPrompt, BUILT_IN_AGENTS, modelSupportsReasoning, patchGlobalFetch, getSubagentDefinitions } from "@stratuscode/shared";
import { registerSandboxToolsConvex, type ConvexSandboxInfo } from "./lib/tools";

// Ensure Codex fetch patch is applied in the Convex action runtime
patchGlobalFetch();

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
  // Direct Anthropic API models
  "claude-sonnet-4-20250514": 200_000,
  "claude-3-5-sonnet-20241022": 200_000,
  "claude-3-5-haiku-20241022": 200_000,
  "claude-3-opus-20240229": 200_000,
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

/** Fetch the authenticated GitHub user's login and ID for git config */
async function getGitHubUser(token: string): Promise<{ login: string; id: number; name: string | null }> {
  try {
    const resp = await fetch("https://api.github.com/user", {
      headers: { Authorization: `token ${token}`, "User-Agent": "StratusCode" },
    });
    if (resp.ok) {
      const data = (await resp.json()) as { login: string; id: number; name: string | null };
      return data;
    }
  } catch {}
  return { login: "stratuscode", id: 0, name: "StratusCode" };
}

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

  // Use the actual GitHub user's identity so Vercel recognizes the author
  // as a contributor (required for Vercel auto-deployments)
  const ghUser = await getGitHubUser(githubToken);
  const gitName = ghUser.name || ghUser.login;
  const gitEmail = `${ghUser.id}+${ghUser.login}@users.noreply.github.com`;

  await sandbox.runCommand("bash", ["-c", `cd '${workDir}' && git checkout -b '${sessionBranch}'`]);
  await sandbox.runCommand("bash", ["-c", `cd '${workDir}' && git config user.email '${gitEmail}'`]);
  await sandbox.runCommand("bash", ["-c", `cd '${workDir}' && git config user.name '${gitName}'`]);

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

// ─── Codex OAuth token refresh ───

const CODEX_ISSUER = "https://auth.openai.com";
const CODEX_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";

/** In-memory cache of refreshed Codex access token for this action invocation */
let cachedCodexToken: { access: string; refresh: string; accountId?: string; expires: number } | null = null;

interface CodexRefreshResult {
  accessToken: string;
  refreshToken: string;
  accountId?: string;
  expiresAt: number;
}

async function refreshCodexAccessToken(refreshToken: string): Promise<CodexRefreshResult | null> {
  try {
    const resp = await fetch(`${CODEX_ISSUER}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: CODEX_CLIENT_ID,
      }).toString(),
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };
    const expiresAt = Date.now() + (data.expires_in ?? 3600) * 1000;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      expiresAt,
    };
  } catch {
    return null;
  }
}

// ─── Provider resolution ───

/**
 * Resolve provider credentials (apiKey, baseUrl, type, headers) from
 * the model ID and available environment variables.  This replaces the
 * previous hard-coded OpenAI-only logic so Codex, OpenRouter, Anthropic,
 * and OpenCode Zen models all route to the correct API.
 */
async function resolveProviderForModel(
  model: string,
  ctx: any,
  userId: string,
): Promise<{
  apiKey: string;
  baseUrl: string;
  providerType: string;
  headers?: Record<string, string>;
}> {
  const m = model.toLowerCase();

  // Codex models → ChatGPT Codex Responses API
  if (m.includes("codex")) {
    let accessToken = "";
    let accountId = process.env.CODEX_ACCOUNT_ID;

    // 1. Check in-memory cache first (same action invocation)
    if (cachedCodexToken && cachedCodexToken.expires > Date.now() + 60_000) {
      accessToken = cachedCodexToken.access;
      accountId = cachedCodexToken.accountId || accountId;
    }

    // 2. Read from Convex DB (user's OAuth tokens from device auth)
    if (!accessToken) {
      const dbAuth = await ctx.runQuery(internal.codex_auth.get, { userId });
      if (dbAuth) {
        if (dbAuth.expiresAt > Date.now() + 60_000) {
          // Token still fresh
          accessToken = dbAuth.accessToken;
          accountId = dbAuth.accountId || accountId;
          cachedCodexToken = { access: dbAuth.accessToken, refresh: dbAuth.refreshToken, accountId: dbAuth.accountId, expires: dbAuth.expiresAt };
        } else {
          // Token expired — refresh it
          const refreshed = await refreshCodexAccessToken(dbAuth.refreshToken);
          if (refreshed) {
            accessToken = refreshed.accessToken;
            accountId = refreshed.accountId || dbAuth.accountId || accountId;
            cachedCodexToken = { access: refreshed.accessToken, refresh: refreshed.refreshToken, accountId, expires: refreshed.expiresAt };
            // Persist refreshed tokens back to DB
            try {
              await ctx.runMutation(internal.codex_auth.updateTokens, {
                userId,
                accessToken: refreshed.accessToken,
                refreshToken: refreshed.refreshToken,
                accountId,
                expiresAt: refreshed.expiresAt,
              });
            } catch { /* best effort */ }
          }
        }
      }
    }

    // 3. Fall back to env vars
    if (!accessToken) {
      const envRefresh = process.env.CODEX_REFRESH_TOKEN;
      if (envRefresh) {
        const refreshed = await refreshCodexAccessToken(envRefresh);
        if (refreshed) {
          accessToken = refreshed.accessToken;
          cachedCodexToken = { access: refreshed.accessToken, refresh: refreshed.refreshToken, expires: refreshed.expiresAt };
        }
      }
      if (!accessToken) {
        accessToken = process.env.CODEX_ACCESS_TOKEN || "";
      }
    }

    return {
      apiKey: accessToken,
      baseUrl: "https://chatgpt.com/backend-api/codex",
      providerType: "responses-api",
      headers: accountId
        ? { "ChatGPT-Account-Id": accountId }
        : undefined,
    };
  }

  // Direct Anthropic API (claude-* models without vendor prefix)
  if (m.startsWith("claude-") && process.env.ANTHROPIC_API_KEY) {
    return {
      apiKey: process.env.ANTHROPIC_API_KEY,
      baseUrl: "https://api.anthropic.com/v1",
      providerType: "chat-completions",
    };
  }

  // OpenRouter models (vendor/model format, e.g. "anthropic/claude-sonnet-4")
  if (model.includes("/")) {
    return {
      apiKey: process.env.OPENROUTER_API_KEY || "",
      baseUrl: "https://openrouter.ai/api/v1",
      providerType: "chat-completions",
      headers: {
        "HTTP-Referer": "https://stratuscode.dev/",
        "X-Title": "StratusCode",
      },
    };
  }

  // OpenCode Zen free models
  if (m.includes("-free") || m === "big-pickle") {
    return {
      apiKey: process.env.OPENCODE_ZEN_API_KEY || "",
      baseUrl: "https://opencode.ai/zen/v1",
      providerType: "chat-completions",
      headers: { "x-opencode-client": "cli" },
    };
  }

  // Default: standard OpenAI API
  return {
    apiKey: process.env.OPENAI_API_KEY || "",
    baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    providerType: "chat-completions",
  };
}

// ─── Title generation ───

const TITLE_PROMPT =
  "Generate a concise 3-6 word title for this coding conversation. Return ONLY the title, no quotes, no punctuation at the end.";

async function generateTitle(
  userMessage: string,
  model: string,
  apiKey: string,
  baseUrl: string,
  providerType: string,
  headers?: Record<string, string>,
): Promise<string | null> {
  if (!apiKey || apiKey === "server-managed") return null;

  try {
    let title: string | undefined;

    if (providerType === "responses-api") {
      const resp = await fetch(`${baseUrl}/responses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          ...headers,
        },
        body: JSON.stringify({
          model,
          instructions: TITLE_PROMPT,
          input: userMessage.slice(0, 500),
          max_output_tokens: 40,
        }),
      });
      if (!resp.ok) return null;
      const data = (await resp.json()) as { output?: Array<{ content?: Array<{ text?: string }> }> };
      title = data.output?.[0]?.content?.[0]?.text?.trim();
    } else {
      const resp = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          ...headers,
        },
        body: JSON.stringify({
          model,
          max_tokens: 40,
          temperature: 0.3,
          messages: [
            { role: "system", content: TITLE_PROMPT },
            { role: "user", content: userMessage.slice(0, 500) },
          ],
        }),
      });
      if (!resp.ok) return null;
      const data = (await resp.json()) as {
        choices: Array<{ message: { content: string } }>;
      };
      title = data.choices?.[0]?.message?.content?.trim();
    }

    return title && title.length > 0 && title.length <= 80 ? title : null;
  } catch {
    return null;
  }
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
    agentMode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const session = await ctx.runQuery(internal.sessions.getInternal, { id: args.sessionId });
    if (!session) throw new Error("Session not found");

    // Status already set to 'running' and user message already persisted
    // by the public `send` action before scheduling this internal action.

    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) throw new Error("GITHUB_TOKEN not configured");

    const model = args.model || session.model || "gpt-5-mini";

    // Resolve provider from Convex DB or env vars (server-side only)
    const resolved = await resolveProviderForModel(model, ctx, session.userId);
    const apiKey = args.apiKey || resolved.apiKey;
    const baseUrl = args.baseUrl || resolved.baseUrl;
    const providerType = args.providerType || resolved.providerType;
    const providerHeaders = args.providerHeaders
      ? JSON.parse(args.providerHeaders)
      : resolved.headers;
    const workDir = "/vercel/sandbox";
    const sessionBranch = session.sessionBranch || `stratuscode/${session._id}`;

    let sandbox: Sandbox | null = null;
    let tokenBuffer = "";
    let reasoningBuffer = "";
    let flushTimeout: ReturnType<typeof setTimeout> | null = null;

    // Subagent token batching — accumulates child LLM text for live status display
    const subagentTextBuffers: Record<string, string> = {};
    let subagentFlushTimeout: ReturnType<typeof setTimeout> | null = null;

    const flushSubagentStatus = async () => {
      for (const [agentName, text] of Object.entries(subagentTextBuffers)) {
        if (text) {
          await ctx.runMutation(internal.streaming.updateSubagentStatus, {
            sessionId: args.sessionId,
            agentName,
            statusText: text,
          });
        }
      }
    };

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

    // Create an AbortController so we can abort the LLM HTTP request
    // when the user presses stop. The cancel flag is polled every 2s.
    const abortController = new AbortController();
    let cancelCheckInterval: ReturnType<typeof setInterval> | null = null;

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

      // Ensure the git remote has a fresh token (token from initial clone may
      // have expired when resuming from a snapshot)
      const freshRepoUrl = `https://x-access-token:${githubToken}@github.com/${session.owner}/${session.repo}.git`;
      await sandbox.runCommand("bash", ["-c", `cd '${workDir}' && git remote set-url origin '${freshRepoUrl}'`]);

      // ── 2. Load agent state for resume ──

      const agentState = await ctx.runQuery(internal.agent_state.get, {
        sessionId: args.sessionId,
      });

      const previousMessages = agentState?.sageMessages
        ? JSON.parse(agentState.sageMessages)
        : [];
      const hasPreviousMessages = previousMessages.length > 0;

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
        subagents: getSubagentDefinitions(),
      }) + `\n\n<repository>
GitHub Repository: ${session.owner}/${session.repo}
Branch: ${session.branch}
Session Branch: ${sessionBranch}
Remote URL: https://github.com/${session.owner}/${session.repo}.git
Working Directory: ${workDir}
The repository has already been cloned into the working directory. When pushing, use the session branch "${sessionBranch}".
</repository>` + (args.alphaMode ? `\n\n<alpha_mode>
ALPHA MODE IS ENABLED. You have full autonomous control.
- You may commit, push, and create PRs WITHOUT asking for confirmation.
- Do NOT use the question tool to ask for permission — just execute directly.
- Work independently and efficiently to complete the user's request end-to-end.
</alpha_mode>` : `\n\n<permissions>
You are in standard mode. For destructive/irreversible actions (git commit, git push, PR creation), you MUST use the question tool to get user confirmation BEFORE executing.
</permissions>`);

      const sageConfig = buildSageConfig(
        model,
        apiKey,
        baseUrl,
        providerType,
        providerHeaders,
        String(args.sessionId)
      );

      // ── 6. Run processDirectly with batched callbacks ──
      // (streaming state + user message already persisted before this action)

      // Start polling for cancel requests to abort the LLM HTTP connection
      cancelCheckInterval = setInterval(async () => {
        try {
          const sess = await ctx.runQuery(internal.sessions.getInternal, { id: args.sessionId });
          if (sess?.cancelRequested) {
            abortController.abort();
            if (cancelCheckInterval) clearInterval(cancelCheckInterval);
          }
        } catch { /* best effort */ }
      }, 2000);

      let lastAgentError: Error | null = null;
      let hasMarkedChanges = false;

      const FILE_CHANGING_TOOLS = new Set([
        "write", "edit", "create", "multi_edit",
      ]);

      const result: any = await processDirectly({
        systemPrompt,
        messages,
        tools: registry,
        config: {
          ...sageConfig,
          subagents: getSubagentDefinitions(),
        },
        sessionId: String(args.sessionId),
        existingSummary: agentState?.existingSummary
          ? JSON.parse(agentState.existingSummary)
          : undefined,
        toolMetadata: { projectDir: workDir },
        abort: abortController.signal,
        callbacks: {
          onToken: (token: string) => {
            tokenBuffer += token;
            if (!flushTimeout) {
              flushTimeout = setTimeout(async () => {
                flushTimeout = null;
                await flushTokens();
              }, 50);
            }
          },
          onReasoning: (text: string) => {
            reasoningBuffer += text;
            if (!flushTimeout) {
              flushTimeout = setTimeout(async () => {
                flushTimeout = null;
                await flushTokens();
              }, 50);
            }
          },
          onToolCall: async (tc: any) => {
            // Check for cancellation before starting a new tool call
            const sess = await ctx.runQuery(internal.sessions.getInternal, { id: args.sessionId });
            if (sess?.cancelRequested) {
              throw new Error("CANCELLED_BY_USER");
            }

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
              toolName,
              result: result.slice(0, 5000),
              toolArgs,
            });

            // Track file-modifying tools to set hasChanges
            if (!hasMarkedChanges && FILE_CHANGING_TOOLS.has(toolName)) {
              hasMarkedChanges = true;
              await ctx.runMutation(internal.sessions.markHasChanges, {
                id: args.sessionId,
              });
            }

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
            lastAgentError = err;
          },
          onSubagentStart: async (agentName: string, task: string) => {
            await flushTokens();
            await ctx.runMutation(internal.streaming.addSubagentStart, {
              sessionId: args.sessionId,
              agentName,
              task,
            });
          },
          onSubagentEnd: async (agentName: string, result: string) => {
            // Use the last set_status value as the completion label.
            // If none was set, extract the first short sentence from the result.
            const lastStatus = subagentTextBuffers[agentName] || "";
            const lines = lastStatus.split('\n').filter((l: string) => l.trim());
            const lastSetStatus = lines[lines.length - 1]?.trim() || "";

            // Derive a short completion summary from the result if no set_status was used
            let completionLabel = lastSetStatus;
            if (!completionLabel && result) {
              const firstLine = result.trim().split('\n')[0]?.trim() || "";
              completionLabel = firstLine.length > 60 ? firstLine.slice(0, 57) + '...' : firstLine;
            }

            if (completionLabel) {
              await ctx.runMutation(internal.streaming.updateSubagentStatus, {
                sessionId: args.sessionId,
                agentName,
                statusText: lastStatus ? lastStatus + "\n" + completionLabel : completionLabel,
              });
            }
            delete subagentTextBuffers[agentName];
            await flushTokens();
            await ctx.runMutation(internal.streaming.addSubagentEnd, {
              sessionId: args.sessionId,
              agentName,
              result,
            });
          },
          onSubagentToken: (agentName: string, token: string) => {
            subagentTextBuffers[agentName] = (subagentTextBuffers[agentName] || "") + token;
            if (!subagentFlushTimeout) {
              subagentFlushTimeout = setTimeout(async () => {
                subagentFlushTimeout = null;
                await flushSubagentStatus();
              }, 150);
            }
          },
        },
      });

      // Clean up cancel polling
      if (cancelCheckInterval) clearInterval(cancelCheckInterval);

      // Final flush of any remaining tokens and subagent status
      if (flushTimeout) clearTimeout(flushTimeout);
      if (subagentFlushTimeout) clearTimeout(subagentFlushTimeout);
      await flushTokens();
      await flushSubagentStatus();

      // If processDirectly reported an error and produced no content, surface it
      if (lastAgentError && !result?.content && !tokenBuffer) {
        throw lastAgentError;
      }

      // ── 7. Finalize ──

      await ctx.runMutation(internal.streaming.finish, { sessionId: args.sessionId });

      // Build parts array for the final message
      const streamState = await ctx.runQuery(internal.streaming.getInternal, {
        sessionId: args.sessionId,
      });

      const parts: any[] = [];
      if (streamState?.reasoning) {
        parts.push({ type: "reasoning", content: streamState.reasoning });
      }

      // Use ordered parts (preserves subagent markers with statusText)
      const orderedParts = streamState?.parts ? JSON.parse(streamState.parts) : null;
      if (orderedParts && orderedParts.length > 0) {
        for (const p of orderedParts) {
          if (p.type === "text" || p.type === "tool_call" || p.type === "subagent_start" || p.type === "subagent_end") {
            parts.push(p);
          }
        }
      } else {
        // Legacy fallback: flat toolCalls + text
        const toolCalls = streamState?.toolCalls ? JSON.parse(streamState.toolCalls) : [];
        const textContent = streamState?.content || result.content || "";
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
        if (textContent) {
          parts.push({ type: "text", content: textContent });
        }
      }

      // Save the complete assistant message
      await ctx.runMutation(internal.messages.create, {
        sessionId: args.sessionId,
        role: "assistant",
        content: result.content || streamState?.content || "",
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

      // Set status to idle BEFORE snapshotting so UI responds immediately
      await ctx.runMutation(internal.sessions.updateStatus, {
        id: args.sessionId,
        status: "idle",
      });

      // ── 8. Snapshot sandbox for fast resume (after status update) ──

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
    } catch (error) {
      // Clean up cancel polling on error path
      if (cancelCheckInterval) clearInterval(cancelCheckInterval);

      const errorMessage = error instanceof Error ? error.message : String(error);
      const isCancelled = errorMessage === "CANCELLED_BY_USER"
        || errorMessage === "Aborted"
        || (error instanceof Error && error.name === "AbortError");

      console.error(`[agent] ${isCancelled ? "Cancelled" : "Error"}:`, errorMessage);

      // Flush any remaining buffered tokens and subagent status first so partial content is saved
      if (flushTimeout) clearTimeout(flushTimeout);
      if (subagentFlushTimeout) clearTimeout(subagentFlushTimeout);
      try { await flushTokens(); } catch { /* best effort */ }
      try { await flushSubagentStatus(); } catch { /* best effort */ }

      // Save partial assistant message on cancel so work isn't lost
      if (isCancelled) {
        try {
          const streamState = await ctx.runQuery(internal.streaming.getInternal, {
            sessionId: args.sessionId,
          });
          if (streamState && (streamState.content || streamState.toolCalls !== "[]")) {
            const parts: any[] = [];
            if (streamState.reasoning) {
              parts.push({ type: "reasoning", content: streamState.reasoning });
            }
            // Use ordered parts if available, fall back to legacy toolCalls
            const orderedParts = streamState.parts ? JSON.parse(streamState.parts) : null;
            if (orderedParts && orderedParts.length > 0) {
              for (const p of orderedParts) {
                if (p.type === "text" || p.type === "tool_call" || p.type === "subagent_start" || p.type === "subagent_end") {
                  parts.push(p);
                }
              }
            } else {
              const tcs = streamState.toolCalls ? JSON.parse(streamState.toolCalls) : [];
              for (const tc of tcs) {
                parts.push({
                  type: "tool_call",
                  toolCall: { id: tc.id, name: tc.name, args: tc.args, result: tc.result, status: tc.status || "completed" },
                });
              }
              if (streamState.content) {
                parts.push({ type: "text", content: streamState.content });
              }
            }
            await ctx.runMutation(internal.messages.create, {
              sessionId: args.sessionId,
              role: "assistant",
              content: streamState.content || "(cancelled)",
              parts,
            });
          }
        } catch { /* best effort */ }
      }

      // Finish streaming and set status AFTER saving partial message
      await ctx.runMutation(internal.streaming.finish, { sessionId: args.sessionId });
      await ctx.runMutation(internal.sessions.updateStatus, {
        id: args.sessionId,
        status: isCancelled ? "idle" : "error",
        errorMessage: isCancelled ? undefined : errorMessage,
      });

      // Snapshot sandbox AFTER status update so UI responds immediately
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
    }
  },
});

// ─── Public action wrapper (called from frontend) ───
//
// Session state (status=running, streaming=true) is already set by the
// frontend via sessions.prepareSend mutation BEFORE this action is called.
// prepareSend also sets a truncated title as an instant placeholder.
//
// This action schedules sendMessage and then generates an AI title.
// When the AI title arrives, updateTitle sets titleGenerated=true which
// triggers the typing animation in the sidebar.

export const send = action({
  args: {
    sessionId: v.id("sessions"),
    message: v.string(),
    model: v.optional(v.string()),
    alphaMode: v.optional(v.boolean()),
    reasoningEffort: v.optional(v.string()),
    attachmentIds: v.optional(v.array(v.string())),
    agentMode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Schedule agent immediately — runs in background
    await ctx.scheduler.runAfter(0, internal.agent.sendMessage, {
      sessionId: args.sessionId,
      message: args.message,
      model: args.model,
      alphaMode: args.alphaMode,
      reasoningEffort: args.reasoningEffort,
      agentMode: args.agentMode,
    });

    // Generate AI title for first message (replaces truncated placeholder)
    try {
      const agentState = await ctx.runQuery(internal.agent_state.get, {
        sessionId: args.sessionId,
      });
      const hasPrevious = agentState?.sageMessages
        ? JSON.parse(agentState.sageMessages).length > 0
        : false;
      if (hasPrevious) return;

      const session = await ctx.runQuery(internal.sessions.getInternal, { id: args.sessionId });
      if (!session) return;

      const model = args.model || session.model || "gpt-5-mini";
      const resolved = await resolveProviderForModel(model, ctx, session.userId);

      const aiTitle = await generateTitle(
        args.message,
        model,
        resolved.apiKey,
        resolved.baseUrl,
        resolved.providerType,
        resolved.headers,
      );

      if (aiTitle) {
        await ctx.runMutation(internal.sessions.updateTitle, {
          id: args.sessionId,
          title: aiTitle,
          titleGenerated: true,
        });
      }
    } catch {
      // Best effort — title failure shouldn't affect the agent
    }
  },
});
