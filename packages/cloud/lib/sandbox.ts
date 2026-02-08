/**
 * Sandbox Management
 *
 * Uses @vercel/sandbox to create isolated microVMs for each session.
 * Each sandbox contains a cloned GitHub repo where the agent can operate.
 */

import { Sandbox } from '@vercel/sandbox';

export interface SandboxInfo {
  sandboxId: string;
  sandbox: Sandbox;
  owner: string;
  repo: string;
  branch: string;
  sessionBranch: string;
  workDir: string;
  alphaMode?: boolean;
}

export interface CreateSandboxOptions {
  owner: string;
  repo: string;
  branch: string;
  githubToken: string;
  sessionId: string;
}

// Use globalThis to persist across Next.js dev-mode module recompilations
const _g = globalThis as any;
if (!_g.__stratusActiveSandboxes) {
  _g.__stratusActiveSandboxes = new Map<string, SandboxInfo>();
}
const activeSandboxes: Map<string, SandboxInfo> = _g.__stratusActiveSandboxes;

/**
 * Register an additional session ID alias for an existing sandbox.
 * Used when the cloud session ID differs from the sandbox session ID.
 */
export function registerSandboxAlias(aliasId: string, sandboxInfo: SandboxInfo): void {
  activeSandboxes.set(aliasId, sandboxInfo);
}

/**
 * Create a new sandbox with a cloned GitHub repo
 */
export async function createSandbox(options: CreateSandboxOptions): Promise<SandboxInfo> {
  const { owner, repo, branch, githubToken, sessionId } = options;
  
  if (!githubToken) {
    throw new Error('GitHub token is required for sandbox creation');
  }
  
  const sessionBranch = `stratuscode/${sessionId}`;
  const workDir = `/vercel/sandbox`;

  console.log(`Creating sandbox for ${owner}/${repo}@${branch}`);
  console.log(`GitHub token present: ${!!githubToken}`);

  // Vercel Sandbox requires these environment variables
  const vercelToken = process.env.VERCEL_TOKEN;
  const vercelProjectId = process.env.VERCEL_PROJECT_ID;
  const vercelTeamId = process.env.VERCEL_TEAM_ID;

  if (!vercelToken || !vercelProjectId || !vercelTeamId) {
    throw new Error(
      'Vercel Sandbox credentials not configured. Please set VERCEL_TOKEN, VERCEL_PROJECT_ID, and VERCEL_TEAM_ID in your .env file. ' +
      'See https://vercel.com/docs/sandbox for setup instructions.'
    );
  }

  console.log('[sandbox] Creating Vercel Sandbox...');
  const sandbox = await Sandbox.create({
    token: vercelToken,
    projectId: vercelProjectId,
    teamId: vercelTeamId,
    runtime: 'node22',
    timeout: 800_000, // ~13 minutes (matches Vercel Pro + Fluid Compute max)
  });
  console.log(`[sandbox] Created: id=${sandbox.sandboxId}, status=${sandbox.status}, timeout=${sandbox.timeout}ms`);

  // Clone the repository manually using git commands with authentication
  const repoUrl = `https://x-access-token:${githubToken}@github.com/${owner}/${repo}.git`;
  console.log(`Cloning ${owner}/${repo} into ${workDir}...`);
  
  const cloneResult = await sandbox.runCommand('git', ['clone', '--depth', '1', '--branch', branch, repoUrl, workDir]);
  const cloneStdout = await cloneResult.stdout();
  const cloneStderr = await cloneResult.stderr();
  console.log(`Clone result: exitCode=${cloneResult.exitCode}, stdout=${cloneStdout}, stderr=${cloneStderr}`);
  
  if (cloneResult.exitCode !== 0) {
    throw new Error(`Failed to clone repository: ${cloneStderr}`);
  }

  // Verify the clone worked
  const lsResult = await sandbox.runCommand('ls', ['-la', workDir]);
  const lsStdout = await lsResult.stdout();
  console.log(`Contents of ${workDir}: ${lsStdout}`);

  // Create the session branch for our changes (run git commands in the workDir)
  console.log('[sandbox] Creating session branch...');
  const checkoutResult = await sandbox.runCommand('bash', ['-c', `cd '${workDir}' && git checkout -b '${sessionBranch}'`]);
  console.log(`[sandbox] checkout: exitCode=${checkoutResult.exitCode}`);

  // Configure git for commits
  await sandbox.runCommand('bash', ['-c', `cd '${workDir}' && git config user.email 'stratuscode@users.noreply.github.com'`]);
  await sandbox.runCommand('bash', ['-c', `cd '${workDir}' && git config user.name 'StratusCode'`]);

  // Health check: verify sandbox is still alive
  console.log('[sandbox] Running health check...');
  const healthCheck = await sandbox.runCommand('echo', ['sandbox-alive']);
  console.log(`[sandbox] Health check: exitCode=${healthCheck.exitCode}, stdout=${await healthCheck.stdout()}`);

  const info: SandboxInfo = {
    sandboxId: (sandbox as any).sandboxId || sessionId,
    sandbox,
    owner,
    repo,
    branch,
    sessionBranch,
    workDir,
    alphaMode: false,
  };

  activeSandboxes.set(sessionId, info);
  console.log(`[sandbox] Ready: sandboxId=${info.sandboxId}, workDir=${info.workDir}`);
  return info;
}

/**
 * Get an existing sandbox by session ID
 */
export async function getSandbox(sessionId: string): Promise<SandboxInfo | null> {
  const cached = activeSandboxes.get(sessionId);
  if (cached) {
    return cached;
  }
  return null;
}

/**
 * Reconnect to an existing sandbox by its ID
 */
export async function reconnectSandbox(sandboxId: string, sessionId: string): Promise<SandboxInfo | null> {
  try {
    const sandbox = await Sandbox.get({ sandboxId });
    if (!sandbox) return null;

    const info: SandboxInfo = {
      sandboxId,
      sandbox,
      owner: '',
      repo: '',
      branch: '',
      sessionBranch: `stratuscode/${sessionId}`,
      workDir: '/vercel/sandbox',
      alphaMode: false,
    };

    activeSandboxes.set(sessionId, info);
    return info;
  } catch {
    return null;
  }
}

/**
 * Destroy a sandbox and clean up resources
 */
export async function destroySandbox(sessionId: string): Promise<void> {
  const info = activeSandboxes.get(sessionId);
  if (info) {
    try {
      await info.sandbox.stop();
    } catch (error) {
      console.error(`Failed to stop sandbox for session ${sessionId}:`, error);
    }
    activeSandboxes.delete(sessionId);
  }
}

/**
 * Extend sandbox timeout using the SDK's extendTimeout method
 */
export async function extendSandboxTimeout(sessionId: string, durationMs: number = 300_000): Promise<void> {
  const info = activeSandboxes.get(sessionId);
  if (!info) return;
  try {
    await info.sandbox.extendTimeout(durationMs);
  } catch (error) {
    console.warn(`[sandbox] Failed to extend timeout for ${sessionId}:`, error);
  }
}

/**
 * Start a keepalive interval that extends the sandbox timeout every 2 minutes.
 * Returns a cleanup function to stop the keepalive.
 */
export function startSandboxKeepalive(sessionId: string): () => void {
  const KEEPALIVE_INTERVAL = 120_000; // 2 minutes
  const EXTEND_DURATION = 300_000; // extend by 5 minutes each time

  const interval = setInterval(async () => {
    try {
      await extendSandboxTimeout(sessionId, EXTEND_DURATION);
    } catch {
      // Sandbox might already be gone, stop the interval
      clearInterval(interval);
    }
  }, KEEPALIVE_INTERVAL);

  return () => clearInterval(interval);
}

/**
 * Run a command in the sandbox
 */
export async function runSandboxCommand(
  sessionId: string,
  command: string,
  args: string[] = [],
  options?: { cwd?: string }
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const info = activeSandboxes.get(sessionId);
  if (!info) {
    throw new Error(`No sandbox found for session ${sessionId}`);
  }

  const cwd = options?.cwd || info.workDir;
  const fullCmd = `cd '${cwd}' && ${command} ${args.map(a => `'${a}'`).join(' ')}`;
  const result = await info.sandbox.runCommand('bash', ['-c', fullCmd]);

  return {
    stdout: await result.stdout(),
    stderr: await result.stderr(),
    exitCode: result.exitCode,
  };
}

/**
 * Read a file from the sandbox
 */
export async function readSandboxFile(sessionId: string, filePath: string): Promise<string> {
  const info = activeSandboxes.get(sessionId);
  if (!info) {
    throw new Error(`No sandbox found for session ${sessionId}`);
  }

  const absolutePath = filePath.startsWith('/') ? filePath : `${info.workDir}/${filePath}`;
  const stream = await info.sandbox.readFile({ path: absolutePath });
  
  if (!stream) {
    throw new Error(`File not found: ${absolutePath}`);
  }
  
  // Convert ReadableStream to string using async iteration
  const chunks: Uint8Array[] = [];
  const reader = (stream as any).getReader?.() ?? stream;
  
  if (typeof reader.read === 'function') {
    // Web Streams API
    let result = await reader.read();
    while (!result.done) {
      if (result.value) chunks.push(result.value);
      result = await reader.read();
    }
  } else {
    // Node.js stream - collect chunks
    for await (const chunk of stream as any) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
  }
  
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/**
 * Write files to the sandbox
 */
export async function writeSandboxFiles(
  sessionId: string,
  files: Record<string, string>
): Promise<void> {
  const info = activeSandboxes.get(sessionId);
  if (!info) {
    throw new Error(`No sandbox found for session ${sessionId}`);
  }

  // Convert to the expected format
  const fileArray = Object.entries(files).map(([path, content]) => {
    const absolutePath = path.startsWith('/') ? path : `${info.workDir}/${path}`;
    return {
      path: absolutePath,
      content: Buffer.from(content, 'utf-8'),
    };
  });

  await info.sandbox.writeFiles(fileArray);
}

/**
 * Get the diff of changes in the sandbox
 */
export async function getSandboxDiff(sessionId: string): Promise<string> {
  const result = await runSandboxCommand(sessionId, 'git', ['diff', '--stat']);
  return result.stdout;
}

/**
 * Get detailed diff of changes
 */
export async function getSandboxDetailedDiff(sessionId: string): Promise<string> {
  const result = await runSandboxCommand(sessionId, 'git', ['diff']);
  return result.stdout;
}

/**
 * Check if there are uncommitted changes
 */
export async function hasUncommittedChanges(sessionId: string): Promise<boolean> {
  const result = await runSandboxCommand(sessionId, 'git', ['status', '--porcelain']);
  return result.stdout.trim().length > 0;
}

/**
 * List active sandboxes
 */
export function listActiveSandboxes(): string[] {
  return Array.from(activeSandboxes.keys());
}
