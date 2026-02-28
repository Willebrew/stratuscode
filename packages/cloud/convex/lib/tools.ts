/**
 * Convex-aware sandbox tools for the agent action.
 *
 * Sandbox-only tools (bash, read, write, edit, grep, glob, ls, web)
 * are unchanged — they interact with the Sandbox object directly.
 *
 * Storage-dependent tools (todoread, todowrite, question, plan_exit)
 * use the Convex action context to read/write the database.
 */

import type { Tool, ToolRegistry } from "@willebrew/sage-core";
import type { Sandbox } from "@vercel/sandbox";
import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { Octokit } from "@octokit/rest";

export interface ConvexSandboxInfo {
  sandboxId: string;
  sandbox: Sandbox;
  owner: string;
  repo: string;
  branch: string;
  sessionBranch: string;
  workDir: string;
  alphaMode?: boolean;
  /** Called when a 410 (Gone) error is detected — should recreate the sandbox and return it */
  recoverSandbox?: () => Promise<Sandbox>;
}

interface ConvexToolContext {
  ctx: ActionCtx;
  sessionId: Id<"sessions">;
}

// ─── Helper ───

function isSandboxGone(error: any): boolean {
  const msg = String(error?.message || "");
  return msg.includes("410") || msg.includes("Gone") || msg.includes("Sandbox is not running");
}

async function sandboxExec(
  sandbox: Sandbox,
  command: string,
  cwd?: string
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const fullCommand = cwd ? `cd '${cwd}' && ${command}` : command;
  const result = await sandbox.runCommand("bash", ["-c", fullCommand]);
  return {
    exitCode: result.exitCode,
    stdout: await result.stdout(),
    stderr: await result.stderr(),
  };
}

/**
 * sandboxExec with automatic 410 recovery.
 * On sandbox gone, calls info.recoverSandbox(), swaps info.sandbox, and retries once.
 */
async function safeSandboxExec(
  info: ConvexSandboxInfo,
  command: string,
  cwd?: string
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  try {
    return await safeSandboxExec(info, command, cwd);
  } catch (error: any) {
    if (isSandboxGone(error) && info.recoverSandbox) {
      console.log("[tools] Sandbox gone (410), recovering...");
      info.sandbox = await info.recoverSandbox();
      info.sandboxId = info.sandbox.sandboxId;
      return await safeSandboxExec(info, command, cwd);
    }
    throw error;
  }
}

/**
 * Run a raw sandbox command with automatic 410 recovery.
 * For tools that call info.sandbox.runCommand directly (e.g. write_to_file).
 */
async function safeSandboxRunCommand(
  info: ConvexSandboxInfo,
  cmd: string,
  args: string[]
): Promise<any> {
  try {
    return await info.sandbox.runCommand(cmd, args);
  } catch (error: any) {
    if (isSandboxGone(error) && info.recoverSandbox) {
      console.log("[tools] Sandbox gone (410), recovering...");
      info.sandbox = await info.recoverSandbox();
      info.sandboxId = info.sandbox.sandboxId;
      return await info.sandbox.runCommand(cmd, args);
    }
    throw error;
  }
}

// ─── Registration ───

export function registerSandboxToolsConvex(
  registry: ToolRegistry,
  info: ConvexSandboxInfo,
  convex: ConvexToolContext
): void {
  // Core file/exec tools (no Convex dependency)
  registry.register(createBashTool(info));
  registry.register(createReadTool(info));
  registry.register(createWriteFileTool(info));
  registry.register(createEditTool(info));
  registry.register(createMultiEditTool(info));
  registry.register(createGrepTool(info));
  registry.register(createGlobTool(info));
  registry.register(createLsTool(info));

  // Web tools (no sandbox or Convex dependency)
  registry.register(createWebSearchTool());
  registry.register(createWebFetchTool());

  // Git workflow tools
  registry.register(createGitCommitTool(info));
  registry.register(createGitPushTool(info));
  registry.register(createPRCreateTool(info));

  // Session tools (Convex-dependent)
  registry.register(createTodoReadTool(convex));
  registry.register(createTodoWriteTool(convex));
  registry.register(createQuestionTool(convex, info));
  registry.register(createPlanEnterTool());
  registry.register(createPlanExitTool(convex));
}

// ─── Bash ───

function createBashTool(info: ConvexSandboxInfo): Tool {
  return {
    name: "bash",
    description: `Executes a shell command in the sandbox.

IMPORTANT:
- Commands run in the project directory (${info.workDir}) by default.
- Use cwd to change the working directory.
- Avoid interactive commands that require user input.
- Long-running commands will timeout after 60 seconds by default.
- Be careful with destructive commands (rm, etc.).`,
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "The shell command to execute." },
        cwd: { type: "string", description: "Working directory (default: project directory)." },
        timeout: { type: "integer", description: "Timeout in milliseconds (default: 60000)." },
      },
      required: ["command"],
    },
    timeout: 120000,
    async execute(args: any) {
      const { command, cwd } = args;
      const workingDir = cwd || info.workDir;
      try {
        const { exitCode, stdout, stderr } = await safeSandboxExec(
          info,
          command,
          workingDir
        );
        return JSON.stringify({ exitCode, stdout, stderr });
      } catch (error: any) {
        return JSON.stringify({
          exitCode: 1,
          stdout: "",
          stderr: error.message || "Command execution failed",
        });
      }
    },
  };
}

// ─── Read ───

function createReadTool(info: ConvexSandboxInfo): Tool {
  return {
    name: "read",
    description: `Reads a file at the specified path.
- The file_path parameter must be an absolute path.
- You can optionally specify offset (1-indexed line number) and limit to read portions of large files.
- Text files are returned with line numbers in cat -n format.`,
    parameters: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "The absolute path to the file to read." },
        offset: { type: "integer", description: "The 1-indexed line number to start reading from." },
        limit: { type: "integer", description: "The number of lines to read." },
      },
      required: ["file_path"],
    },
    timeout: 30000,
    maxResultSize: 100000,
    async execute(args: any) {
      const { file_path, offset, limit } = args;
      let cmd: string;
      if (offset && limit) {
        cmd = `cat -n '${file_path}' | sed -n '${offset},${offset + limit - 1}p'`;
      } else if (offset) {
        cmd = `cat -n '${file_path}' | tail -n +${offset}`;
      } else if (limit) {
        cmd = `cat -n '${file_path}' | head -n ${limit}`;
      } else {
        cmd = `cat -n '${file_path}'`;
      }
      const { exitCode, stdout, stderr } = await safeSandboxExec(info, cmd, info.workDir);
      if (exitCode !== 0) throw new Error(stderr || `File not found: ${file_path}`);
      const { stdout: totalOut } = await safeSandboxExec(info, `wc -l < '${file_path}'`, info.workDir);
      const totalLines = parseInt(totalOut.trim(), 10) || 0;
      if (offset || limit) {
        return `File: ${file_path} (lines ${offset || 1}-${(offset || 1) + (limit || totalLines) - 1} of ${totalLines})\n\n${stdout}`;
      }
      return `File: ${file_path} (${totalLines} lines)\n\n${stdout}`;
    },
  };
}

// ─── Write ───

function createWriteFileTool(info: ConvexSandboxInfo): Tool {
  return {
    name: "write_to_file",
    description: "Write content to a file in the repository.",
    parameters: {
      type: "object",
      properties: {
        TargetFile: { type: "string", description: "Path to the file to write (relative to project root or absolute)" },
        CodeContent: { type: "string", description: "Content to write to the file" },
      },
      required: ["TargetFile", "CodeContent"],
    },
    async execute(args: any) {
      const { TargetFile, CodeContent } = args;
      const absolutePath = TargetFile.startsWith("/") ? TargetFile : `${info.workDir}/${TargetFile}`;
      try {
        const dir = absolutePath.substring(0, absolutePath.lastIndexOf("/"));
        await safeSandboxRunCommand(info, "mkdir", ["-p", dir]);
        const result = await safeSandboxRunCommand(info, "bash", ["-c", `cat > '${absolutePath}' << 'EOF'\n${CodeContent}\nEOF`]);
        if (result.exitCode !== 0) {
          return JSON.stringify({ error: (await result.stderr()) || "Failed to write file" });
        }
        let diff = "";
        try {
          const diffResult = await safeSandboxRunCommand(info, "bash", ["-c", `cd '${info.workDir}' && git diff -- '${absolutePath}'`]);
          diff = await diffResult.stdout();
          if (!diff) {
            const diffNewResult = await safeSandboxRunCommand(info, "bash", ["-c", `cd '${info.workDir}' && git diff --no-index /dev/null '${absolutePath}'`]);
            diff = await diffNewResult.stdout();
          }
        } catch {}
        if (diff?.trim()) return diff;
        return JSON.stringify({ success: true, path: absolutePath });
      } catch (error: any) {
        return JSON.stringify({ error: error.message || "Failed to write file" });
      }
    },
  };
}

// ─── Edit ───

function createEditTool(info: ConvexSandboxInfo): Tool {
  return {
    name: "edit",
    description: `Performs exact string replacements in files.

IMPORTANT:
- You must read the file first before editing.
- The old_string must match EXACTLY (including whitespace and indentation).
- The edit will FAIL if old_string is not found or is not unique (unless replace_all is true).
- The edit will FAIL if old_string and new_string are identical.`,
    parameters: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "The absolute path to the file to modify." },
        old_string: { type: "string", description: "The exact text to replace." },
        new_string: { type: "string", description: "The text to replace it with." },
        replace_all: { type: "boolean", description: "Replace all occurrences (default: false)." },
      },
      required: ["file_path", "old_string", "new_string"],
    },
    timeout: 30000,
    async execute(args: any) {
      const { file_path, old_string, new_string, replace_all = false } = args;
      if (old_string === new_string) throw new Error("old_string and new_string are identical.");
      const { exitCode, stdout: content } = await safeSandboxExec(info, `cat '${file_path}'`, info.workDir);
      if (exitCode !== 0) throw new Error(`File not found: ${file_path}`);
      let count = 0;
      let pos = 0;
      while ((pos = content.indexOf(old_string, pos)) !== -1) { count++; pos += old_string.length; }
      if (count === 0) throw new Error(`old_string not found in file.\n\nSearched for:\n${old_string.slice(0, 200)}`);
      if (count > 1 && !replace_all) throw new Error(`old_string found ${count} times. Make it more specific, or set replace_all: true.`);
      const newContent = replace_all ? content.split(old_string).join(new_string) : content.replace(old_string, new_string);
      const writeCmd = `cat > '${file_path}' << 'STRATUSCODE_EOF'\n${newContent}\nSTRATUSCODE_EOF`;
      const writeResult = await safeSandboxExec(info, writeCmd, info.workDir);
      if (writeResult.exitCode !== 0) throw new Error(`Failed to write file: ${writeResult.stderr}`);
      let diff = "";
      try { diff = (await safeSandboxExec(info, `cd '${info.workDir}' && git diff -- '${file_path}'`, info.workDir)).stdout; } catch {}
      const lineDiff = newContent.split("\n").length - content.split("\n").length;
      return JSON.stringify({
        success: true, file: file_path, replacements: replace_all ? count : 1, lineChange: lineDiff, diff,
        message: `Edited ${file_path}: ${replace_all ? count : 1} replacement(s), ${lineDiff >= 0 ? "+" : ""}${lineDiff} lines`,
      });
    },
  };
}

// ─── MultiEdit ───

function createMultiEditTool(info: ConvexSandboxInfo): Tool {
  return {
    name: "multi_edit",
    description: `Performs multiple find-and-replace edits in a single file. All edits are applied sequentially. If any edit fails, none are applied.`,
    parameters: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "The absolute path to the file to modify." },
        edits: {
          type: "array",
          items: {
            type: "object",
            properties: {
              old_string: { type: "string" },
              new_string: { type: "string" },
              replace_all: { type: "boolean" },
            },
            required: ["old_string", "new_string"],
          },
        },
      },
      required: ["file_path", "edits"],
    },
    timeout: 30000,
    async execute(args: any) {
      const { file_path, edits } = args;
      const { exitCode, stdout: content } = await safeSandboxExec(info, `cat '${file_path}'`, info.workDir);
      if (exitCode !== 0) throw new Error(`File not found: ${file_path}`);
      let current = content;
      for (let i = 0; i < edits.length; i++) {
        const { old_string, new_string, replace_all = false } = edits[i];
        if (old_string === new_string) throw new Error(`Edit ${i + 1}: old_string and new_string are identical.`);
        if (!current.includes(old_string)) throw new Error(`Edit ${i + 1}: old_string not found in file.`);
        current = replace_all ? current.split(old_string).join(new_string) : current.replace(old_string, new_string);
      }
      const writeCmd = `cat > '${file_path}' << 'STRATUSCODE_EOF'\n${current}\nSTRATUSCODE_EOF`;
      const writeResult = await safeSandboxExec(info, writeCmd, info.workDir);
      if (writeResult.exitCode !== 0) throw new Error(`Failed to write file: ${writeResult.stderr}`);
      let diff = "";
      try { diff = (await safeSandboxExec(info, `cd '${info.workDir}' && git diff -- '${file_path}'`, info.workDir)).stdout; } catch {}
      return JSON.stringify({ success: true, file: file_path, editsApplied: edits.length, diff, message: `Applied ${edits.length} edits to ${file_path}` });
    },
  };
}

// ─── Grep ───

function createGrepTool(info: ConvexSandboxInfo): Tool {
  return {
    name: "grep",
    description: `Search for patterns in files. By default regex, set fixed_strings for literal search. Case-insensitive by default.`,
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search term or pattern." },
        search_path: { type: "string", description: "The path to search." },
        includes: { type: "array", items: { type: "string" }, description: "Glob patterns to filter files." },
        case_sensitive: { type: "boolean" },
        fixed_strings: { type: "boolean" },
        match_per_line: { type: "boolean" },
      },
      required: ["query", "search_path"],
    },
    timeout: 60000,
    maxResultSize: 100000,
    async execute(args: any) {
      const { query, search_path, includes, case_sensitive = false, fixed_strings = false, match_per_line = false } = args;
      let grepFlags = "-rn";
      if (!case_sensitive) grepFlags += "i";
      if (fixed_strings) grepFlags += "F";
      if (!match_per_line) { grepFlags = grepFlags.replace("n", "") + "l"; } else { grepFlags += " -C 2"; }
      let includeFlags = "";
      if (includes?.length) {
        for (const inc of includes) {
          includeFlags += inc.startsWith("!") ? ` --exclude='${inc.slice(1)}'` : ` --include='${inc}'`;
        }
      }
      const excludes = "--exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=build";
      const cmd = `grep ${grepFlags} ${excludes}${includeFlags} '${query.replace(/'/g, "'\\''")}' '${search_path}' 2>/dev/null || true`;
      const { stdout } = await safeSandboxExec(info, cmd, info.workDir);
      if (!stdout.trim()) return JSON.stringify({ query, matchingFiles: 0, message: "No matches found" });
      if (match_per_line) return stdout;
      const files = stdout.trim().split("\n").filter(Boolean);
      return JSON.stringify({ query, matchingFiles: files.length, files: files.slice(0, 100), truncated: files.length > 100 });
    },
  };
}

// ─── Glob ───

function createGlobTool(info: ConvexSandboxInfo): Tool {
  return {
    name: "glob",
    description: `Search for files and directories by glob pattern. Results capped at 100 matches.`,
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: 'Glob pattern (e.g., "**/*.ts").' },
        search_directory: { type: "string", description: "The directory to search within." },
        type: { type: "string", enum: ["file", "directory", "any"] },
        max_depth: { type: "integer" },
      },
      required: ["pattern", "search_directory"],
    },
    timeout: 30000,
    maxResultSize: 50000,
    async execute(args: any) {
      const { pattern, search_directory, type: fileType = "any", max_depth } = args;
      let findArgs = `'${search_directory}'`;
      if (max_depth) findArgs += ` -maxdepth ${max_depth}`;
      findArgs += ` -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/dist/*' -not -path '*/build/*'`;
      if (fileType === "file") findArgs += " -type f";
      else if (fileType === "directory") findArgs += " -type d";
      const namePattern = pattern.includes("/") ? pattern.split("/").pop()! : pattern;
      findArgs += ` -name '${namePattern}' | head -100`;
      const { stdout } = await safeSandboxExec(info, `find ${findArgs} 2>/dev/null || true`, info.workDir);
      const results = stdout.trim().split("\n").filter(Boolean);
      return JSON.stringify({ pattern, searchDirectory: search_directory, total: results.length, truncated: results.length >= 100, results: results.map((p) => ({ path: p, type: "file" })) });
    },
  };
}

// ─── Ls ───

function createLsTool(info: ConvexSandboxInfo): Tool {
  return {
    name: "ls",
    description: "List directory contents with file sizes and types.",
    parameters: {
      type: "object",
      properties: { directory: { type: "string", description: "Directory path to list." } },
      required: ["directory"],
    },
    timeout: 15000,
    async execute(args: any) {
      const { exitCode, stdout, stderr } = await safeSandboxExec(info, `ls -la '${args.directory}'`, info.workDir);
      if (exitCode !== 0) throw new Error(stderr || `Directory not found: ${args.directory}`);
      return stdout;
    },
  };
}

// ─── WebSearch ───

function createWebSearchTool(): Tool {
  return {
    name: "websearch",
    description: "Search the web for information. Returns search results with titles, URLs, and snippets.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query." },
        maxResults: { type: "number", description: "Maximum results (default: 5, max: 10)." },
      },
      required: ["query"],
    },
    timeout: 30000,
    async execute(args: any) {
      const { query, maxResults = 5 } = args;
      const limit = Math.min(maxResults, 10);
      try {
        const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
        const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; StratusCode/0.1.0)" } });
        if (!response.ok) throw new Error(`Search failed: ${response.status}`);
        const html = await response.text();
        const linkRegex = /<a[^>]+class="result-link"[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
        const snippetRegex = /<td[^>]+class="result-snippet"[^>]*>([^<]+)<\/td>/gi;
        const links: { url: string; title: string }[] = [];
        const snippets: string[] = [];
        let match;
        while ((match = linkRegex.exec(html)) !== null) links.push({ url: match[1]!, title: match[2]!.trim() });
        while ((match = snippetRegex.exec(html)) !== null) snippets.push(match[1]!.trim());
        const results = [];
        for (let i = 0; i < Math.min(links.length, snippets.length, limit); i++) {
          results.push({ title: links[i]!.title, url: links[i]!.url, snippet: snippets[i]! });
        }
        return JSON.stringify({ success: true, query, results, message: `Found ${results.length} result(s)` });
      } catch (error: any) {
        return JSON.stringify({ error: true, message: `Search failed: ${error.message}` });
      }
    },
  };
}

// ─── WebFetch ───

function createWebFetchTool(): Tool {
  return {
    name: "webfetch",
    description: "Fetch the contents of a URL. Returns the text content of the page.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "The URL to fetch." },
        maxLength: { type: "number", description: "Maximum response length in characters (default: 50000)." },
      },
      required: ["url"],
    },
    timeout: 30000,
    async execute(args: any) {
      const { url, maxLength = 50000 } = args;
      try {
        const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; StratusCode/0.1.0)" }, redirect: "follow" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const text = await response.text();
        const truncated = text.length > maxLength;
        return JSON.stringify({ success: true, url, contentLength: text.length, truncated, content: truncated ? text.slice(0, maxLength) : text });
      } catch (error: any) {
        return JSON.stringify({ error: true, message: `Fetch failed: ${error.message}` });
      }
    },
  };
}

// ─── Git Commit ───

function createGitCommitTool(info: ConvexSandboxInfo): Tool {
  return {
    name: "git_commit",
    description: info.alphaMode
      ? "Stage all changes and create a git commit. You may call this directly without confirmation."
      : "Stage all changes and create a git commit. You MUST first ask the user to confirm using the question tool before calling this.",
    parameters: {
      type: "object",
      properties: {
        message: { type: "string", description: "The commit message" },
        confirmed: { type: "boolean", description: info.alphaMode ? "Not needed in alpha mode" : "Set to true only after the user has explicitly confirmed this action via the question tool" },
      },
      required: ["message"],
    },
    async execute(args: any) {
      const { message, confirmed } = args;
      if (!info.alphaMode && !confirmed) {
        return JSON.stringify({ error: "User confirmation required. Use the question tool to ask the user to confirm this commit.", needsConfirmation: true });
      }
      try {
        await safeSandboxRunCommand(info, "bash", ["-c", `cd '${info.workDir}' && git add -A`]);
        const result = await safeSandboxRunCommand(info, "bash", ["-c", `cd '${info.workDir}' && git commit -m '${message.replace(/'/g, "'\\''")}'`]);
        const stdout = await result.stdout();
        const stderr = await result.stderr();
        if (result.exitCode !== 0) return JSON.stringify({ error: stderr || stdout || "Failed to commit" });
        return JSON.stringify({ success: true, output: stdout });
      } catch (error: any) {
        return JSON.stringify({ error: error.message || "Failed to commit" });
      }
    },
  };
}

// ─── Git Push ───

function createGitPushTool(info: ConvexSandboxInfo): Tool {
  return {
    name: "git_push",
    description: info.alphaMode
      ? "Push commits to the remote. You may call this directly without confirmation."
      : "Push commits to the remote. You MUST first ask the user to confirm using the question tool before calling this.",
    parameters: {
      type: "object",
      properties: {
        confirmed: { type: "boolean", description: info.alphaMode ? "Not needed in alpha mode" : "Set to true only after the user has explicitly confirmed this action via the question tool" },
      },
      required: [],
    },
    async execute(args: any) {
      if (!info.alphaMode && !args.confirmed) {
        return JSON.stringify({ error: "User confirmation required.", needsConfirmation: true });
      }
      try {
        const result = await safeSandboxRunCommand(info, "bash", ["-c", `cd '${info.workDir}' && git push -u origin '${info.sessionBranch}'`]);
        const stdout = await result.stdout();
        const stderr = await result.stderr();
        if (result.exitCode !== 0) return JSON.stringify({ error: stderr || stdout || "Failed to push" });
        return JSON.stringify({ success: true, output: stdout || stderr, branch: info.sessionBranch });
      } catch (error: any) {
        return JSON.stringify({ error: error.message || "Failed to push" });
      }
    },
  };
}

// ─── PR Create ───

function createPRCreateTool(info: ConvexSandboxInfo): Tool {
  return {
    name: "pr_create",
    description: info.alphaMode
      ? "Create a GitHub pull request for the current branch. You may call this directly without confirmation."
      : "Create a GitHub pull request for the current branch. You MUST first ask the user to confirm using the question tool before calling this.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "PR title" },
        body: { type: "string", description: "PR description" },
        confirmed: { type: "boolean" },
      },
      required: ["title"],
    },
    async execute(args: any) {
      const { title, body = "", confirmed } = args;
      if (!info.alphaMode && !confirmed) {
        return JSON.stringify({ error: "User confirmation required.", needsConfirmation: true });
      }
      const githubToken = process.env.GITHUB_TOKEN;
      if (!githubToken) return JSON.stringify({ error: "GitHub token not configured" });
      try {
        const octokit = new Octokit({ auth: githubToken });
        const { data: pr } = await octokit.pulls.create({
          owner: info.owner, repo: info.repo, title, body,
          head: info.sessionBranch, base: info.branch,
        });
        return JSON.stringify({ success: true, url: pr.html_url, number: pr.number, title: pr.title, baseBranch: info.branch });
      } catch (error: any) {
        return JSON.stringify({ error: error.message || "Failed to create PR" });
      }
    },
  };
}

// ─── TodoRead (Convex) ───

function createTodoReadTool(convex: ConvexToolContext): Tool {
  return {
    name: "todoread",
    description: `Read the current todo list for this session. Returns todos with their content, status, and priority.`,
    parameters: { type: "object", properties: {}, required: [] },
    async execute() {
      const todos = await convex.ctx.runQuery(internal.todos.listInternal, { sessionId: convex.sessionId });
      if (!todos || todos.length === 0) {
        return JSON.stringify({ todos: [], counts: { total: 0, pending: 0, in_progress: 0, completed: 0 }, message: "No todos defined yet. Use todowrite to create a plan." });
      }
      const counts = {
        total: todos.length,
        pending: todos.filter((t: any) => t.status === "pending").length,
        in_progress: todos.filter((t: any) => t.status === "in_progress").length,
        completed: todos.filter((t: any) => t.status === "completed").length,
      };
      return JSON.stringify({
        todos: todos.map((t: any) => ({ id: t._id, content: t.content, status: t.status, priority: t.priority })),
        counts,
      });
    },
  };
}

// ─── TodoWrite (Convex) ───

function createTodoWriteTool(convex: ConvexToolContext): Tool {
  return {
    name: "todowrite",
    description: `Create or update the todo list for this session. This tool REPLACES the entire list — include ALL tasks every time.

WHEN TO USE:
- At the START of any multi-step task — break it down into an ordered list before writing code.
- AFTER completing a step — mark it completed and set the next step to in_progress.
- When the plan CHANGES — add, remove, or reorder tasks.

TASK STATES: pending, in_progress, completed. Only ONE task should be in_progress at a time.`,
    parameters: {
      type: "object",
      properties: {
        todos: {
          type: "array",
          items: {
            type: "object",
            properties: {
              content: { type: "string", description: "Task description" },
              status: { type: "string", enum: ["pending", "in_progress", "completed"] },
              priority: { type: "string", enum: ["low", "medium", "high"] },
            },
            required: ["content"],
          },
        },
      },
      required: ["todos"],
    },
    async execute(args: any) {
      const { todos: todoItems } = args;
      const inProgressCount = (todoItems as any[]).filter((t: any) => t.status === "in_progress").length;
      if (inProgressCount > 1) {
        return JSON.stringify({ error: "Only one task can be in_progress at a time", inProgressCount });
      }
      await convex.ctx.runMutation(internal.todos.replace, {
        sessionId: convex.sessionId,
        todos: todoItems.map((t: any) => ({ content: t.content, status: t.status, priority: t.priority })),
      });
      const updated = await convex.ctx.runQuery(internal.todos.listInternal, { sessionId: convex.sessionId });
      const counts = {
        total: updated.length,
        pending: updated.filter((t: any) => t.status === "pending").length,
        in_progress: updated.filter((t: any) => t.status === "in_progress").length,
        completed: updated.filter((t: any) => t.status === "completed").length,
      };
      return JSON.stringify({ success: true, todos: updated, counts, message: `Updated ${updated.length} todos` });
    },
  };
}

// ─── Question (Convex polling) ───

function createQuestionTool(convex: ConvexToolContext, info?: ConvexSandboxInfo): Tool {
  const alphaMode = info?.alphaMode ?? false;
  return {
    name: "question",
    description: alphaMode
      ? `Ask the user a question when you need clarification or want them to choose between options. This tool will BLOCK and wait for the user to respond.

CRITICAL RULES:
- You MUST use this tool for ALL questions. NEVER ask questions as regular text.
- Always provide clear options when possible.
- Alpha mode is ON — you do NOT need to ask for confirmation before commits, pushes, or PRs. Only use this tool when you genuinely need user input or clarification.
- Do NOT use this for plan approval — use plan_exit instead.`
      : `Ask the user a question when you need clarification or want them to choose between options. This tool will BLOCK and wait for the user to respond.

CRITICAL RULES:
- You MUST use this tool for ALL questions. NEVER ask questions as regular text.
- Always provide clear options when possible.
- Use this for confirmations before destructive actions (git commit, git push, PR creation).
- Do NOT use this for plan approval — use plan_exit instead.`,
    parameters: {
      type: "object",
      properties: {
        question: { type: "string", description: "The question to ask the user" },
        options: { type: "array", items: { type: "string" }, description: "Options for the user to choose from" },
      },
      required: ["question"],
    },
    async execute(args: any) {
      const { question, options } = args;

      // Write question to streaming_state so frontend can see it
      await convex.ctx.runMutation(internal.streaming.setQuestion, {
        sessionId: convex.sessionId,
        question: JSON.stringify({ question, options }),
      });

      // Poll for the answer
      while (true) {
        const state = await convex.ctx.runQuery(internal.streaming.getInternal, { sessionId: convex.sessionId });
        if (state?.pendingAnswer) {
          await convex.ctx.runMutation(internal.streaming.clearQuestion, { sessionId: convex.sessionId });
          return JSON.stringify({ answer: state.pendingAnswer, question, options });
        }

        // Check for cancellation
        const session = await convex.ctx.runQuery(internal.sessions.getInternal, { id: convex.sessionId });
        if (session?.cancelRequested) {
          await convex.ctx.runMutation(internal.streaming.clearQuestion, { sessionId: convex.sessionId });
          throw new Error("CANCELLED_BY_USER");
        }

        // Sleep 1 second between polls
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    },
  };
}

// ─── Plan Enter ───

function createPlanEnterTool(): Tool {
  return {
    name: "plan_enter",
    description: `Enter plan mode to create a structured plan before implementation.`,
    parameters: {
      type: "object",
      properties: { reason: { type: "string", description: "Why entering plan mode" } },
      required: [],
    },
    async execute(args: any) {
      return JSON.stringify({
        mode: "plan", entered: true, reason: args.reason,
        message: "Entered plan mode. Research, ask questions, and create todos. Use plan_exit when ready to build.",
      });
    },
  };
}

// ─── Plan Exit (Convex polling) ───

function createPlanExitTool(convex: ConvexToolContext): Tool {
  return {
    name: "plan_exit",
    description: `Propose exiting plan mode and switching to build mode. The user will be asked to approve.
IMPORTANT: This tool has its own approval UI. Do NOT output any text before or after calling it.
Do NOT call this until you have a concrete plan in the todo list.`,
    parameters: {
      type: "object",
      properties: { summary: { type: "string", description: "A 1-2 sentence summary of what you plan to build" } },
      required: ["summary"],
    },
    async execute(args: any) {
      const { summary } = args;

      // Check that todos exist
      const todos = await convex.ctx.runQuery(internal.todos.listInternal, { sessionId: convex.sessionId });
      if (!todos || todos.length === 0) {
        return JSON.stringify({ approved: false, error: "No plan exists yet. Use todowrite to create a plan before calling plan_exit." });
      }

      // Write the plan_exit question to streaming state
      await convex.ctx.runMutation(internal.streaming.setQuestion, {
        sessionId: convex.sessionId,
        question: JSON.stringify({
          type: "plan_exit",
          summary,
          options: ["Approve & Start Building", "Request Changes"],
        }),
      });

      // Poll for answer
      while (true) {
        const state = await convex.ctx.runQuery(internal.streaming.getInternal, { sessionId: convex.sessionId });
        if (state?.pendingAnswer) {
          await convex.ctx.runMutation(internal.streaming.clearQuestion, { sessionId: convex.sessionId });
          const answer = state.pendingAnswer;
          const approved = answer.toLowerCase().includes("approve") || answer.toLowerCase().includes("start building");
          if (approved) {
            return JSON.stringify({
              approved: true, modeSwitch: "build", summary,
              message: "Plan approved. Switching to build mode.",
            });
          }
          return JSON.stringify({
            approved: false, modeSwitch: null, answer,
            message: "Plan NOT approved. Stay in plan mode. Update your plan based on feedback.",
          });
        }

        const session = await convex.ctx.runQuery(internal.sessions.getInternal, { id: convex.sessionId });
        if (session?.cancelRequested) {
          await convex.ctx.runMutation(internal.streaming.clearQuestion, { sessionId: convex.sessionId });
          throw new Error("CANCELLED_BY_USER");
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    },
  };
}
