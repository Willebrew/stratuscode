/**
 * Session Manager for StratusCode Cloud
 *
 * Manages cloud session lifecycle, active session tracking, and plan file helpers.
 * Adapted from TUI backend for Vercel Sandbox environment.
 */

import { CloudSession, CloudSessionOptions } from './cloud-session';
import { createSandbox, registerSandboxAlias, destroySandbox, type SandboxInfo } from './sandbox';
export type { SandboxInfo } from './sandbox';

export interface ActiveSession {
  cloudSession: CloudSession;
  sandboxInfo: SandboxInfo;
  userId: string;
  owner: string;
  repo: string;
  branch: string;
  createdAt: number;
}

export interface CreateCloudSessionOptions {
  userId: string;
  owner: string;
  repo: string;
  branch: string;
  githubToken: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
  providerType?: string;
  providerHeaders?: Record<string, string>;
  agent?: string;
}

// Use globalThis to persist state across Next.js dev-mode module recompilations.
// Without this, each API route gets a fresh module instance with an empty Map.
const globalStore = globalThis as any;
if (!globalStore.__stratusActiveSessions) {
  globalStore.__stratusActiveSessions = new Map<string, ActiveSession>();
}
if (!globalStore.__stratusUserSessionCounts) {
  globalStore.__stratusUserSessionCounts = new Map<string, number>();
}
const activeSessions: Map<string, ActiveSession> = globalStore.__stratusActiveSessions;
const userSessionCounts: Map<string, number> = globalStore.__stratusUserSessionCounts;

export function getPlanFilePath(workDir: string, sessionId: string): string {
  // Use path.posix for consistent forward slashes in sandbox
  return `${workDir}/.stratuscode/plans/${sessionId}.md`;
}

export function ensurePlanFile(
  sandboxExec: (cmd: string) => Promise<string>,
  workDir: string,
  sessionId: string
): string {
  const filePath = getPlanFilePath(workDir, sessionId);
  const dir = `${workDir}/.stratuscode/plans`;

  const initContent = `# Plan

_Session: ${sessionId}_

<!-- Write your plan here -->
`;

  // Commands to create directory and file in sandbox
  const mkdirCmd = `mkdir -p "${dir}"`;
  const checkCmd = `test -f "${filePath}" || echo '${initContent.replace(/'/g, "'\\''")}' > "${filePath}"`;

  // Fire and forget - the sandbox will handle this
  sandboxExec(mkdirCmd).catch(() => {});
  sandboxExec(checkCmd).catch(() => {});

  return filePath;
}

export function PLAN_MODE_REMINDER(planFilePath: string): string {
  return `<system-reminder>
You are in PLAN mode. Follow this workflow:

## Plan Workflow

### Phase 1: Initial Understanding
Goal: Understand the user's request by reading code and asking clarifying questions.

1. Explore the codebase to understand the relevant code and existing patterns.
2. Use the delegate_to_explore tool to search the codebase efficiently.
3. After exploring, use the **question** tool to clarify ambiguities in the user's request.

### Phase 2: Design
Goal: Design an implementation approach based on your exploration and the user's answers.

1. Synthesize what you learned from exploration and user answers.
2. Consider trade-offs between approaches.
3. Use the **question** tool to clarify any remaining decisions with the user.

### Phase 3: Create Plan
Goal: Write a structured plan using the todowrite tool AND the plan file.

1. Create a clear, ordered todo list capturing each implementation step using todowrite.
2. Write a detailed plan to the plan file at: ${planFilePath}
   This is the ONLY file you are allowed to edit in plan mode.
3. The plan file should contain: summary, approach, file list, and implementation order.
4. Keep the plan concise but detailed enough to execute.

### Phase 4: Call plan_exit
At the very end of your turn, once you have asked the user questions and are satisfied with your plan, call plan_exit to indicate you are done planning.

### Phase 5: Iteration
If the user asks follow-up questions or requests changes, update both the todo list and plan file accordingly, then call plan_exit again.

**Critical rule:** Your turn should ONLY end with either asking the user a question (via the question tool) or calling plan_exit. Do not stop for any other reason.

## Question Tool Usage

**You MUST use the question tool whenever you need the user to make a choice.** Do NOT write questions as plain text in your response — the question tool renders an interactive UI.

Use the question tool for:
- Clarifying ambiguous requirements
- Choosing between implementation approaches
- Confirming assumptions about the codebase
- Any decision that requires user input
</system-reminder>`;
}

export function BUILD_SWITCH_REMINDER(planFilePath: string): string {
  return `<system-reminder>
Your operational mode has changed from plan to build.
You are no longer in read-only mode.
You are permitted to make file changes, run shell commands, and utilize your full arsenal of tools.

A plan file exists at: ${planFilePath}
You should execute on the plan defined within it and in the todo list.
Read the plan file first, then work through each task, updating status as you go.
</system-reminder>`;
}

export async function createCloudSession(
  options: CreateCloudSessionOptions
): Promise<ActiveSession> {
  const sessionId = `cloud-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Create real Vercel Sandbox with cloned repo
  const sandboxInfo = await createSandbox({
    owner: options.owner,
    repo: options.repo,
    branch: options.branch,
    githubToken: options.githubToken,
    sessionId,
  });

  // Register cloud session ID as alias so sandbox lookups work
  registerSandboxAlias(sessionId, sandboxInfo);

  const sessionOptions: CloudSessionOptions = {
    sessionId,
    workDir: sandboxInfo.workDir,
    model: options.model,
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
    providerType: options.providerType,
    providerHeaders: options.providerHeaders,
    agent: options.agent || 'build',
    sandboxInfo,
  };

  const cloudSession = new CloudSession(sessionOptions);

  const activeSession: ActiveSession = {
    cloudSession,
    sandboxInfo,
    userId: options.userId,
    owner: options.owner,
    repo: options.repo,
    branch: options.branch,
    createdAt: Date.now(),
  };

  activeSessions.set(sessionId, activeSession);

  // Update user session count
  const currentCount = userSessionCounts.get(options.userId) || 0;
  userSessionCounts.set(options.userId, currentCount + 1);

  return activeSession;
}

export function getActiveSession(sessionId: string): ActiveSession | undefined {
  return activeSessions.get(sessionId);
}

export function getUserSessionCount(userId: string): number {
  return userSessionCounts.get(userId) || 0;
}

export function removeSession(sessionId: string): void {
  const session = activeSessions.get(sessionId);
  if (session) {
    const userId = session.userId;
    activeSessions.delete(sessionId);

    const currentCount = userSessionCounts.get(userId) || 0;
    if (currentCount > 0) {
      userSessionCounts.set(userId, currentCount - 1);
    }
  }
}

export function getUserSessions(_userId: string): ActiveSession[] {
  return Array.from(activeSessions.values());
}

export async function destroyCloudSession(sessionId: string): Promise<void> {
  await destroySandbox(sessionId);
  removeSession(sessionId);
}
