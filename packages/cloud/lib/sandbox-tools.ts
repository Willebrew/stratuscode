/**
 * Sandbox Tools for StratusCode Cloud
 *
 * SAGE-compatible tool implementations that execute inside Vercel Sandboxes.
 * Mirrors the full tool set from @stratuscode/tools but adapted for sandbox execution.
 */

import type { Tool, ToolRegistry } from '@willebrew/sage-core';
import type { SandboxInfo } from './sandbox';
import { Octokit } from '@octokit/rest';
import { listTodos } from './storage-shim';

// Pending answer promises keyed by sandboxId
// Use globalThis to persist across Next.js dev-mode module recompilations
const _g = globalThis as any;
if (!_g.__stratusPendingAnswers) {
  _g.__stratusPendingAnswers = new Map<string, { resolve: (answer: string) => void }>();
}
const pendingAnswers: Map<string, { resolve: (answer: string) => void }> = _g.__stratusPendingAnswers;

/**
 * Resolve a pending answer for a sandbox's question tool
 */
export function resolveAnswer(sandboxId: string, answer: string): boolean {
  const pending = pendingAnswers.get(sandboxId);
  if (pending) {
    pending.resolve(answer);
    pendingAnswers.delete(sandboxId);
    return true;
  }
  return false;
}

/**
 * Register all sandbox-adapted tools with a SAGE ToolRegistry.
 * This mirrors registerBuiltInTools() from @stratuscode/tools.
 */
export function registerSandboxTools(
  registry: ToolRegistry,
  sandboxInfo: SandboxInfo,
  sessionId: string,
): void {
  // Core tools (matching CLI)
  registry.register(createSandboxBashTool(sandboxInfo));
  registry.register(createSandboxReadTool(sandboxInfo));
  registry.register(createSandboxWriteFileTool(sandboxInfo));
  registry.register(createSandboxEditTool(sandboxInfo));
  registry.register(createSandboxMultiEditTool(sandboxInfo));
  registry.register(createSandboxGrepTool(sandboxInfo));
  registry.register(createSandboxGlobTool(sandboxInfo));
  registry.register(createSandboxLsTool(sandboxInfo));

  // Web tools
  registry.register(createSandboxWebSearchTool());
  registry.register(createSandboxWebFetchTool());

  // Git workflow tools (cloud-specific)
  registry.register(createSandboxGitCommitTool(sandboxInfo));
  registry.register(createSandboxGitPushTool(sandboxInfo));
  registry.register(createSandboxPRCreateTool(sandboxInfo));

  // Session tools
  registry.register(createSandboxTodoReadTool(sessionId));
  registry.register(createSandboxTodoWriteTool(sandboxInfo, sessionId));
  registry.register(createSandboxQuestionTool(sandboxInfo));
  registry.register(createSandboxPlanEnterTool());
  registry.register(createSandboxPlanExitTool(sandboxInfo, sessionId));
}

// ============================================
// Helper: run a command in the sandbox
// ============================================

async function sandboxExec(
  sandboxInfo: SandboxInfo,
  command: string,
  cwd?: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const workDir = cwd || sandboxInfo.workDir;
  const fullCommand = `cd '${workDir}' && ${command}`;
  const result = await sandboxInfo.sandbox.runCommand('bash', ['-c', fullCommand]);
  return {
    exitCode: result.exitCode,
    stdout: await result.stdout(),
    stderr: await result.stderr(),
  };
}

// ============================================
// read — Read file with line numbers (matches CLI read tool)
// ============================================

function createSandboxReadTool(sandboxInfo: SandboxInfo): Tool {
  return {
    name: 'read',
    description: `Reads a file at the specified path.
- The file_path parameter must be an absolute path.
- You can optionally specify offset (1-indexed line number) and limit to read portions of large files.
- Text files are returned with line numbers in cat -n format.`,
    parameters: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'The absolute path to the file to read.' },
        offset: { type: 'integer', description: 'The 1-indexed line number to start reading from.' },
        limit: { type: 'integer', description: 'The number of lines to read.' },
      },
      required: ['file_path'],
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

      const { exitCode, stdout, stderr } = await sandboxExec(sandboxInfo, cmd);
      if (exitCode !== 0) {
        throw new Error(stderr || `File not found: ${file_path}`);
      }

      const totalCmd = `wc -l < '${file_path}'`;
      const { stdout: totalOut } = await sandboxExec(sandboxInfo, totalCmd);
      const totalLines = parseInt(totalOut.trim(), 10) || 0;

      if (offset || limit) {
        return `File: ${file_path} (lines ${offset || 1}-${(offset || 1) + (limit || totalLines) - 1} of ${totalLines})\n\n${stdout}`;
      }
      return `File: ${file_path} (${totalLines} lines)\n\n${stdout}`;
    },
  };
}

// ============================================
// edit — Surgical find-and-replace (matches CLI edit tool)
// ============================================

function createSandboxEditTool(sandboxInfo: SandboxInfo): Tool {
  return {
    name: 'edit',
    description: `Performs exact string replacements in files.

IMPORTANT:
- You must read the file first before editing.
- The old_string must match EXACTLY (including whitespace and indentation).
- The edit will FAIL if old_string is not found or is not unique (unless replace_all is true).
- The edit will FAIL if old_string and new_string are identical.`,
    parameters: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'The absolute path to the file to modify.' },
        old_string: { type: 'string', description: 'The exact text to replace.' },
        new_string: { type: 'string', description: 'The text to replace it with.' },
        replace_all: { type: 'boolean', description: 'Replace all occurrences (default: false).' },
      },
      required: ['file_path', 'old_string', 'new_string'],
    },
    timeout: 30000,

    async execute(args: any) {
      const { file_path, old_string, new_string, replace_all = false } = args;

      if (old_string === new_string) {
        throw new Error('old_string and new_string are identical. No change would be made.');
      }

      // Read current content
      const { exitCode, stdout: content, stderr } = await sandboxExec(sandboxInfo, `cat '${file_path}'`);
      if (exitCode !== 0) {
        throw new Error(`File not found: ${file_path}`);
      }

      // Count occurrences
      let count = 0;
      let pos = 0;
      while ((pos = content.indexOf(old_string, pos)) !== -1) {
        count++;
        pos += old_string.length;
      }

      if (count === 0) {
        throw new Error(`old_string not found in file. Make sure it matches exactly including whitespace.\n\nSearched for:\n${old_string.slice(0, 200)}`);
      }
      if (count > 1 && !replace_all) {
        throw new Error(`old_string found ${count} times. Either make it more specific, or set replace_all: true.`);
      }

      // Perform replacement
      let newContent: string;
      if (replace_all) {
        newContent = content.split(old_string).join(new_string);
      } else {
        newContent = content.replace(old_string, new_string);
      }

      // Write back using heredoc
      const writeCmd = `cat > '${file_path}' << 'STRATUSCODE_EOF'\n${newContent}\nSTRATUSCODE_EOF`;
      const writeResult = await sandboxExec(sandboxInfo, writeCmd);
      if (writeResult.exitCode !== 0) {
        throw new Error(`Failed to write file: ${writeResult.stderr}`);
      }

      // Get diff
      let diff = '';
      try {
        const { stdout: diffOut } = await sandboxExec(sandboxInfo, `cd '${sandboxInfo.workDir}' && git diff -- '${file_path}'`);
        diff = diffOut;
      } catch { /* ignore */ }

      const oldLines = content.split('\n').length;
      const newLines = newContent.split('\n').length;
      const lineDiff = newLines - oldLines;

      return JSON.stringify({
        success: true,
        file: file_path,
        replacements: replace_all ? count : 1,
        lineChange: lineDiff,
        diff,
        message: `Edited ${file_path}: ${replace_all ? count : 1} replacement(s), ${lineDiff >= 0 ? '+' : ''}${lineDiff} lines`,
      });
    },
  };
}

// ============================================
// multi_edit — Multiple edits in one call (matches CLI multi_edit tool)
// ============================================

function createSandboxMultiEditTool(sandboxInfo: SandboxInfo): Tool {
  return {
    name: 'multi_edit',
    description: `Performs multiple find-and-replace edits in a single file.
All edits are applied sequentially. If any edit fails, none are applied.`,
    parameters: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'The absolute path to the file to modify.' },
        edits: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              old_string: { type: 'string', description: 'The text to replace.' },
              new_string: { type: 'string', description: 'The replacement text.' },
              replace_all: { type: 'boolean', description: 'Replace all occurrences.' },
            },
            required: ['old_string', 'new_string'],
          },
          description: 'Array of edit operations to perform sequentially.',
        },
      },
      required: ['file_path', 'edits'],
    },
    timeout: 30000,

    async execute(args: any) {
      const { file_path, edits } = args;

      // Read current content
      const { exitCode, stdout: content, stderr } = await sandboxExec(sandboxInfo, `cat '${file_path}'`);
      if (exitCode !== 0) {
        throw new Error(`File not found: ${file_path}`);
      }

      // Apply edits sequentially
      let current = content;
      for (let i = 0; i < edits.length; i++) {
        const { old_string, new_string, replace_all = false } = edits[i];
        if (old_string === new_string) {
          throw new Error(`Edit ${i + 1}: old_string and new_string are identical.`);
        }
        if (!current.includes(old_string)) {
          throw new Error(`Edit ${i + 1}: old_string not found in file.`);
        }
        if (replace_all) {
          current = current.split(old_string).join(new_string);
        } else {
          current = current.replace(old_string, new_string);
        }
      }

      // Write back
      const writeCmd = `cat > '${file_path}' << 'STRATUSCODE_EOF'\n${current}\nSTRATUSCODE_EOF`;
      const writeResult = await sandboxExec(sandboxInfo, writeCmd);
      if (writeResult.exitCode !== 0) {
        throw new Error(`Failed to write file: ${writeResult.stderr}`);
      }

      // Get diff
      let diff = '';
      try {
        const { stdout: diffOut } = await sandboxExec(sandboxInfo, `cd '${sandboxInfo.workDir}' && git diff -- '${file_path}'`);
        diff = diffOut;
      } catch { /* ignore */ }

      return JSON.stringify({
        success: true,
        file: file_path,
        editsApplied: edits.length,
        diff,
        message: `Applied ${edits.length} edits to ${file_path}`,
      });
    },
  };
}

// ============================================
// grep — Search for patterns (matches CLI grep tool)
// ============================================

function createSandboxGrepTool(sandboxInfo: SandboxInfo): Tool {
  return {
    name: 'grep',
    description: `Search for patterns in files.
- By default, query is treated as a regular expression.
- Set fixed_strings: true for literal string search.
- Filter files with includes patterns (glob format).
- Case-insensitive by default.`,
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search term or pattern.' },
        search_path: { type: 'string', description: 'The path to search (file or directory).' },
        includes: { type: 'array', items: { type: 'string' }, description: 'Glob patterns to filter files.' },
        case_sensitive: { type: 'boolean', description: 'Case-sensitive search (default: false).' },
        fixed_strings: { type: 'boolean', description: 'Treat query as literal string (default: false).' },
        match_per_line: { type: 'boolean', description: 'Show context around matches (default: false).' },
      },
      required: ['query', 'search_path'],
    },
    timeout: 60000,
    maxResultSize: 100000,

    async execute(args: any) {
      const { query, search_path, includes, case_sensitive = false, fixed_strings = false, match_per_line = false } = args;

      let grepFlags = '-rn';
      if (!case_sensitive) grepFlags += 'i';
      if (fixed_strings) grepFlags += 'F';
      if (!match_per_line) grepFlags = grepFlags.replace('n', '') + 'l';
      else grepFlags += ' -C 2';

      let includeFlags = '';
      if (includes && includes.length > 0) {
        for (const inc of includes) {
          if (inc.startsWith('!')) includeFlags += ` --exclude='${inc.slice(1)}'`;
          else includeFlags += ` --include='${inc}'`;
        }
      }

      const excludes = "--exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=build";
      const cmd = `grep ${grepFlags} ${excludes}${includeFlags} '${query.replace(/'/g, "'\\''")}' '${search_path}' 2>/dev/null || true`;

      const { stdout } = await sandboxExec(sandboxInfo, cmd);

      if (!stdout.trim()) {
        return JSON.stringify({ query, matchingFiles: 0, message: 'No matches found' });
      }

      if (match_per_line) {
        return stdout;
      }

      const files = stdout.trim().split('\n').filter(Boolean);
      return JSON.stringify({
        query,
        matchingFiles: files.length,
        files: files.slice(0, 100),
        truncated: files.length > 100,
      });
    },
  };
}

// ============================================
// glob — Find files by pattern (matches CLI glob tool)
// ============================================

function createSandboxGlobTool(sandboxInfo: SandboxInfo): Tool {
  return {
    name: 'glob',
    description: `Search for files and directories by glob pattern.
Uses find command. Results capped at 100 matches.`,
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob pattern (e.g., "**/*.ts").' },
        search_directory: { type: 'string', description: 'The directory to search within.' },
        type: { type: 'string', enum: ['file', 'directory', 'any'], description: 'Type filter.' },
        max_depth: { type: 'integer', description: 'Maximum directory depth.' },
      },
      required: ['pattern', 'search_directory'],
    },
    timeout: 30000,
    maxResultSize: 50000,

    async execute(args: any) {
      const { pattern, search_directory, type = 'any', max_depth } = args;

      let findArgs = `'${search_directory}'`;
      if (max_depth) findArgs += ` -maxdepth ${max_depth}`;

      // Exclude common directories
      findArgs += ` -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/dist/*' -not -path '*/build/*'`;

      if (type === 'file') findArgs += ' -type f';
      else if (type === 'directory') findArgs += ' -type d';

      // Convert glob to find -name pattern
      const namePattern = pattern.includes('/') ? pattern.split('/').pop()! : pattern;
      findArgs += ` -name '${namePattern}'`;
      findArgs += ' | head -100';

      const { stdout } = await sandboxExec(sandboxInfo, `find ${findArgs} 2>/dev/null || true`);
      const results = stdout.trim().split('\n').filter(Boolean);

      return JSON.stringify({
        pattern,
        searchDirectory: search_directory,
        total: results.length,
        truncated: results.length >= 100,
        results: results.map(p => ({ path: p, type: 'file' })),
      });
    },
  };
}

// ============================================
// ls — List directory contents (matches CLI ls tool)
// ============================================

function createSandboxLsTool(sandboxInfo: SandboxInfo): Tool {
  return {
    name: 'ls',
    description: 'List directory contents with file sizes and types.',
    parameters: {
      type: 'object',
      properties: {
        directory: { type: 'string', description: 'Directory path to list.' },
      },
      required: ['directory'],
    },
    timeout: 15000,

    async execute(args: any) {
      const { directory } = args;
      const { exitCode, stdout, stderr } = await sandboxExec(sandboxInfo, `ls -la '${directory}'`);
      if (exitCode !== 0) {
        throw new Error(stderr || `Directory not found: ${directory}`);
      }
      return stdout;
    },
  };
}

// ============================================
// websearch — Web search (same as CLI, no sandbox needed)
// ============================================

function createSandboxWebSearchTool(): Tool {
  return {
    name: 'websearch',
    description: 'Search the web for information. Returns search results with titles, URLs, and snippets.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query.' },
        maxResults: { type: 'number', description: 'Maximum results (default: 5, max: 10).' },
      },
      required: ['query'],
    },
    timeout: 30000,

    async execute(args: any) {
      const { query, maxResults = 5 } = args;
      const limit = Math.min(maxResults, 10);

      try {
        const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
        const response = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StratusCode/0.1.0)' },
        });
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

// ============================================
// webfetch — Fetch URL contents (same as CLI, no sandbox needed)
// ============================================

function createSandboxWebFetchTool(): Tool {
  return {
    name: 'webfetch',
    description: 'Fetch the contents of a URL. Returns the text content of the page.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The URL to fetch.' },
        maxLength: { type: 'number', description: 'Maximum response length in characters (default: 50000).' },
      },
      required: ['url'],
    },
    timeout: 30000,

    async execute(args: any) {
      const { url, maxLength = 50000 } = args;
      try {
        const response = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StratusCode/0.1.0)' },
          redirect: 'follow',
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const text = await response.text();
        const truncated = text.length > maxLength;
        const content = truncated ? text.slice(0, maxLength) : text;

        return JSON.stringify({
          success: true,
          url,
          contentLength: text.length,
          truncated,
          content,
        });
      } catch (error: any) {
        return JSON.stringify({ error: true, message: `Fetch failed: ${error.message}` });
      }
    },
  };
}

/**
 * Create a bash tool that executes commands in the Vercel Sandbox
 */
export function createSandboxBashTool(sandboxInfo: SandboxInfo): Tool {
  return {
    name: 'bash',
    description: `Executes a shell command in the sandbox.

IMPORTANT:
- Commands run in the project directory (${sandboxInfo.workDir}) by default.
- Use cwd to change the working directory.
- Avoid interactive commands that require user input.
- Long-running commands will timeout after 60 seconds by default.
- Be careful with destructive commands (rm, etc.).

Tips:
- Use 'cat' for reading files, 'ls' for listing directories.
- Pipe output through 'head' or 'tail' to limit output.
- Use '&&' to chain commands.`,
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The shell command to execute.',
        },
        cwd: {
          type: 'string',
          description: 'Working directory for the command (default: project directory).',
        },
        timeout: {
          type: 'integer',
          description: 'Timeout in milliseconds (default: 60000).',
        },
      },
      required: ['command'],
    },
    timeout: 120000,

    async execute(args: any) {
      const { command, cwd, timeout = 60000 } = args;
      const workingDir = cwd || sandboxInfo.workDir;

      try {
        const fullCommand = workingDir !== sandboxInfo.workDir
          ? `cd '${workingDir}' && ${command}`
          : `cd '${sandboxInfo.workDir}' && ${command}`;
        const result = await sandboxInfo.sandbox.runCommand('bash', ['-c', fullCommand]);

        const stdout = await result.stdout();
        const stderr = await result.stderr();

        return JSON.stringify({
          exitCode: result.exitCode,
          stdout,
          stderr,
        });
      } catch (error: any) {
        return JSON.stringify({
          exitCode: error.exitCode || 1,
          stdout: error.stdout || '',
          stderr: error.stderr || error.message || 'Command execution failed',
        });
      }
    },
  };
}

/**
 * Create file write tool for sandbox
 */
export function createSandboxWriteFileTool(sandboxInfo: SandboxInfo): Tool {
  return {
    name: 'write_to_file',
    description: 'Write content to a file in the repository.',
    parameters: {
      type: 'object',
      properties: {
        TargetFile: {
          type: 'string',
          description: 'Path to the file to write (relative to project root or absolute)',
        },
        CodeContent: {
          type: 'string',
          description: 'Content to write to the file',
        },
      },
      required: ['TargetFile', 'CodeContent'],
    },

    async execute(args: any) {
      const { TargetFile, CodeContent } = args;
      const absolutePath = TargetFile.startsWith('/') ? TargetFile : `${sandboxInfo.workDir}/${TargetFile}`;

      try {
        // Create directory if needed
        const dir = absolutePath.substring(0, absolutePath.lastIndexOf('/'));
        await sandboxInfo.sandbox.runCommand('mkdir', ['-p', dir]);

        // Write file using echo and redirection
        const result = await sandboxInfo.sandbox.runCommand('bash', [
          '-c',
          `cat > '${absolutePath}' << 'EOF'\n${CodeContent}\nEOF`,
        ]);

        const stderr = await result.stderr();

        if (result.exitCode !== 0) {
          return JSON.stringify({ error: stderr || 'Failed to write file' });
        }

        // Capture the diff for this file to show as a patch
        let diff = '';
        try {
          const diffResult = await sandboxInfo.sandbox.runCommand('bash', ['-c',
            `cd '${sandboxInfo.workDir}' && git diff -- '${absolutePath}'`,
          ]);
          diff = await diffResult.stdout();
          // If no diff (new untracked file), show the whole file as added
          if (!diff) {
            const diffNewResult = await sandboxInfo.sandbox.runCommand('bash', ['-c',
              `cd '${sandboxInfo.workDir}' && git diff --no-index /dev/null '${absolutePath}'`,
            ]);
            diff = await diffNewResult.stdout();
          }
        } catch {
          // Ignore diff errors
        }

        if (diff && diff.trim()) {
          return diff;
        }
        return JSON.stringify({ success: true, path: absolutePath });
      } catch (error: any) {
        return JSON.stringify({ error: error.message || 'Failed to write file' });
      }
    },
  };
}

/**
 * Create git commit tool — stages all changes and commits
 */
export function createSandboxGitCommitTool(sandboxInfo: SandboxInfo): Tool {
  return {
    name: 'git_commit',
    description: 'Stage all changes and create a git commit. When not in alpha mode, you MUST first ask the user to confirm using the question tool before calling this.',
    parameters: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'The commit message' },
        confirmed: { type: 'boolean', description: 'Set to true only after the user has explicitly confirmed this action via the question tool' },
      },
      required: ['message'],
    },

    async execute(args: any) {
      const { message, confirmed } = args;

      if (!sandboxInfo.alphaMode && !confirmed) {
        return JSON.stringify({
          error: 'User confirmation required. Use the question tool to ask the user to confirm this commit before proceeding.',
          needsConfirmation: true,
        });
      }

      try {
        await sandboxInfo.sandbox.runCommand('bash', ['-c', `cd '${sandboxInfo.workDir}' && git add -A`]);
        const result = await sandboxInfo.sandbox.runCommand('bash', ['-c', `cd '${sandboxInfo.workDir}' && git commit -m '${message.replace(/'/g, "'\\''")}'`]);
        const stdout = await result.stdout();
        const stderr = await result.stderr();

        if (result.exitCode !== 0) {
          return JSON.stringify({ error: stderr || stdout || 'Failed to commit' });
        }
        return JSON.stringify({ success: true, output: stdout });
      } catch (error: any) {
        return JSON.stringify({ error: error.message || 'Failed to commit' });
      }
    },
  };
}

/**
 * Create git push tool — pushes the current branch
 */
export function createSandboxGitPushTool(sandboxInfo: SandboxInfo): Tool {
  return {
    name: 'git_push',
    description: 'Push commits to the remote. When not in alpha mode, you MUST first ask the user to confirm using the question tool before calling this.',
    parameters: {
      type: 'object',
      properties: {
        confirmed: { type: 'boolean', description: 'Set to true only after the user has explicitly confirmed this action via the question tool' },
      },
      required: [],
    },

    async execute(args: any) {
      const { confirmed } = args;

      if (!sandboxInfo.alphaMode && !confirmed) {
        return JSON.stringify({
          error: 'User confirmation required. Use the question tool to ask the user to confirm this push before proceeding.',
          needsConfirmation: true,
        });
      }

      try {
        const result = await sandboxInfo.sandbox.runCommand('bash', ['-c', `cd '${sandboxInfo.workDir}' && git push -u origin '${sandboxInfo.sessionBranch}'`]);
        const stdout = await result.stdout();
        const stderr = await result.stderr();

        if (result.exitCode !== 0) {
          return JSON.stringify({ error: stderr || stdout || 'Failed to push' });
        }
        return JSON.stringify({ success: true, output: stdout || stderr, branch: sandboxInfo.sessionBranch });
      } catch (error: any) {
        return JSON.stringify({ error: error.message || 'Failed to push' });
      }
    },
  };
}

/**
 * Create PR tool — creates a GitHub pull request using Octokit
 */
export function createSandboxPRCreateTool(sandboxInfo: SandboxInfo): Tool {
  return {
    name: 'pr_create',
    description: 'Create a GitHub pull request for the current branch. When not in alpha mode, you MUST first ask the user to confirm using the question tool before calling this.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'PR title' },
        body: { type: 'string', description: 'PR description' },
        confirmed: { type: 'boolean', description: 'Set to true only after the user has explicitly confirmed this action via the question tool' },
      },
      required: ['title'],
    },

    async execute(args: any) {
      const { title, body = '', confirmed } = args;

      if (!sandboxInfo.alphaMode && !confirmed) {
        return JSON.stringify({
          error: 'User confirmation required. Use the question tool to ask the user to confirm PR creation before proceeding.',
          needsConfirmation: true,
        });
      }

      const githubToken = process.env.GITHUB_TOKEN;
      if (!githubToken) {
        return JSON.stringify({ error: 'GitHub token not configured' });
      }

      try {
        const octokit = new Octokit({ auth: githubToken });
        const { data: pr } = await octokit.pulls.create({
          owner: sandboxInfo.owner,
          repo: sandboxInfo.repo,
          title,
          body,
          head: sandboxInfo.sessionBranch,
          base: sandboxInfo.branch,
        });

        return JSON.stringify({
          success: true,
          url: pr.html_url,
          number: pr.number,
          title: pr.title,
          baseBranch: sandboxInfo.branch,
        });
      } catch (error: any) {
        return JSON.stringify({ error: error.message || 'Failed to create PR' });
      }
    },
  };
}

/**
 * Create todoread tool — reads the current todo list from in-memory storage
 */
export function createSandboxTodoReadTool(sessionId: string): Tool {
  return {
    name: 'todoread',
    description: `Read the current todo list for this session.

Returns the list of todos with their id, content, status (pending, in_progress, completed), and priority.

Use this BEFORE starting work to understand what tasks are planned and what to do next.
Use this AFTER completing a task to verify the update was saved and decide the next step.
If no todos exist yet, use todowrite to create a plan.`,
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },

    async execute() {
      const { listTodos, getTodosCount } = await import('./storage-shim');
      const todos = listTodos(sessionId);
      const counts = getTodosCount(sessionId);

      if (todos.length === 0) {
        return JSON.stringify({
          todos: [],
          counts,
          message: 'No todos defined yet. Use todowrite to create a plan.',
        });
      }

      return JSON.stringify({
        todos: todos.map(t => ({
          id: t.id,
          content: t.content,
          status: t.status,
          priority: t.priority,
        })),
        counts,
      });
    },
  };
}

/**
 * Create todowrite tool — replaces the entire todo list in in-memory storage
 */
export function createSandboxTodoWriteTool(sandboxInfo: SandboxInfo, sessionId: string): Tool {
  return {
    name: 'todowrite',
    description: `Create or update the todo list for this session. This tool REPLACES the entire list — include ALL tasks every time.

WHEN TO USE:
- At the START of any multi-step task — break it down into an ordered list before writing code.
- AFTER completing a step — mark it completed and set the next step to in_progress.
- When the plan CHANGES — add, remove, or reorder tasks.

TASK STATES:
- pending: Not yet started (default).
- in_progress: Currently being worked on. Only ONE task should be in_progress at a time.
- completed: Finished. Keep completed tasks visible.

TASK FIELDS:
- content (required): Clear, specific description. Include file paths when known.
- status: pending | in_progress | completed (default: pending)
- priority: low | medium | high (default: medium)`,
    parameters: {
      type: 'object',
      properties: {
        todos: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              content: { type: 'string', description: 'Task description' },
              status: { type: 'string', enum: ['pending', 'in_progress', 'completed'], description: 'Task status' },
              priority: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Task priority' },
            },
            required: ['content'],
          },
          description: 'Complete list of todos to set',
        },
      },
      required: ['todos'],
    },

    async execute(args: any) {
      const { replaceTodos, getTodosCount } = await import('./storage-shim');
      const { todos: todoItems } = args;

      const inProgressCount = (todoItems as any[]).filter((t: any) => t.status === 'in_progress').length;
      if (inProgressCount > 1) {
        return JSON.stringify({ error: 'Only one task can be in_progress at a time', inProgressCount });
      }

      const result = replaceTodos(sessionId, todoItems.map((t: any) => ({
        content: t.content,
        status: t.status,
        priority: t.priority,
      })));

      const counts = getTodosCount(sessionId);

      return JSON.stringify({
        success: true,
        todos: result,
        counts,
        message: `Updated ${result.length} todos`,
      });
    },
  };
}

/**
 * Create plan_enter tool — formally enters plan mode.
 * Mirrors the CLI's plan_enter tool for cross-platform parity.
 */
export function createSandboxPlanEnterTool(): Tool {
  return {
    name: 'plan_enter',
    description: `Enter plan mode to create a structured plan before implementation.

In plan mode, you should:
1. Research and explore the codebase to understand requirements
2. Ask clarifying questions using the question tool
3. Create todos using the todowrite tool
4. When ready, use plan_exit to propose switching to build mode

Use this when:
- Starting a complex multi-step task
- The user asks for a plan before implementation
- You need to clarify requirements before coding`,
    parameters: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: 'Why entering plan mode',
        },
      },
      required: [],
    },

    async execute(args: any) {
      const { reason } = args;
      return JSON.stringify({
        mode: 'plan',
        entered: true,
        reason,
        message: 'Entered plan mode. Research, ask questions, and create todos. Use plan_exit when ready to build.',
        instructions: [
          'Use bash/read_file to explore the codebase',
          'Use question to clarify requirements',
          'Use todowrite to create/update the plan',
          'Use plan_exit when ready to propose building',
        ],
      });
    },
  };
}

/**
 * Create plan_exit tool — proposes switching from plan mode to build mode.
 * Blocks until user approves via the question mechanism.
 */
export function createSandboxPlanExitTool(sandboxInfo: SandboxInfo, sessionId: string): Tool {
  return {
    name: 'plan_exit',
    description: `Propose exiting plan mode and switching to build mode to start implementation.

Use this ONLY when:
- You have created a complete plan using todowrite
- All clarifying questions have been answered
- You are ready to start coding

IMPORTANT: This tool has its own approval UI. Do NOT output any text before or after calling this tool. Do NOT say "Ready to build" or repeat the plan summary in your text output. Just call this tool silently — it handles the user-facing display.

The user will be asked to approve before the mode switch happens.
Do NOT call this until you have a concrete plan in the todo list.`,
    parameters: {
      type: 'object',
      properties: {
        summary: {
          type: 'string',
          description: 'A 1-2 sentence summary of what you plan to build',
        },
      },
      required: ['summary'],
    },

    async execute(args: any) {
      const { summary } = args;

      // Check that todos actually exist
      const todos = listTodos(sessionId);
      if (todos.length === 0) {
        return JSON.stringify({
          approved: false,
          error: 'No plan exists yet. Use todowrite to create a plan before calling plan_exit.',
        });
      }

      // Block and wait indefinitely for user approval via the question mechanism.
      // The sandbox keepalive will prevent timeout during the wait.
      const answerPromise = new Promise<string>((resolve) => {
        pendingAnswers.set(sandboxInfo.sandboxId, { resolve });
      });

      const answer = await answerPromise;
      const approved = answer.toLowerCase().includes('approve') || answer.toLowerCase().includes('start building');

      if (approved) {
        return JSON.stringify({
          approved: true,
          modeSwitch: 'build',
          summary,
          message: 'Plan approved. Switching to build mode — write tools are now available.',
          instructions: 'Your operational mode has changed from plan to build. You are no longer in read-only mode. You are permitted to make file changes, run shell commands, and utilize your full arsenal of tools. Read the plan file first, then read the todo list with todoread, and work through each task — updating todo status as you go.',
        });
      } else {
        return JSON.stringify({
          approved: false,
          modeSwitch: null,
          answer,
          message: 'Plan NOT approved. You MUST stay in plan mode. Do NOT write any code or make any changes. Update your todo list based on the user feedback using todowrite, then call plan_exit again when ready. Do NOT use the question tool for plan approval — only plan_exit does that.',
        });
      }
    },
  };
}

/**
 * Create question tool for sandbox — asks the user a question.
 * This tool BLOCKS until the user answers via the PUT /api/chat endpoint.
 */
export function createSandboxQuestionTool(sandboxInfo: SandboxInfo): Tool {
  return {
    name: 'question',
    description: `Ask the user a question when you need clarification or want them to choose between options. This tool will BLOCK and wait for the user to respond before returning their answer.

CRITICAL RULES:
- You MUST use this tool for ALL questions. NEVER ask questions as regular text messages.
- Always provide clear options when possible.
- Use this for confirmations before destructive actions (commit, push, PR) when not in alpha mode.
- Do NOT use this tool for plan approval. Use the plan_exit tool instead — it has its own dedicated approval UI.`,
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'The question to ask the user' },
        options: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of options for the user to choose from',
        },
      },
      required: ['question'],
    },

    async execute(args: any) {
      const { question, options } = args;

      // Create a promise that will be resolved when the user answers
      const answerPromise = new Promise<string>((resolve) => {
        pendingAnswers.set(sandboxInfo.sandboxId, { resolve });
      });

      // The SSE stream will pick up this tool call and render the question UI.
      // We emit a special format so the frontend knows to show buttons.
      // Meanwhile, this function blocks until resolveAnswer is called.

      // Wait indefinitely — the user may take as long as they need to respond.
      // The sandbox keepalive will prevent timeout during the wait.
      const answer = await answerPromise;
      return JSON.stringify({ answer, question, options });
    },
  };
}
