/**
 * Bash Tool
 *
 * Executes shell commands.
 */

import { defineTool } from './sage-adapter';
import { spawn } from 'child_process';
import * as path from 'path';

export interface BashArgs extends Record<string, unknown> {
  command: string;
  cwd?: string;
  timeout?: number;
}

export const bashTool = defineTool<BashArgs>({
  name: 'bash',
  description: `Executes a shell command.

IMPORTANT:
- Commands run in the project directory by default.
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
  timeout: 120000, // Allow long commands with custom timeout

  async execute(args, context) {
    const { command, cwd, timeout = 60000 } = args;

    const workingDir = cwd && path.isAbsolute(cwd) ? cwd : context.projectDir;

    return new Promise((resolve, reject) => {
      const stdout: string[] = [];
      const stderr: string[] = [];
      let killed = false;

      // Determine shell based on platform
      const shell = process.platform === 'win32' ? 'cmd' : '/bin/bash';
      const shellArgs = process.platform === 'win32' ? ['/c', command] : ['-c', command];

      const proc = spawn(shell, shellArgs, {
        cwd: workingDir,
        env: {
          ...process.env,
          PAGER: 'cat', // Disable paging
          GIT_PAGER: 'cat',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      // Handle timeout
      const timeoutId = setTimeout(() => {
        killed = true;
        proc.kill('SIGTERM');
        setTimeout(() => {
          if (!proc.killed) {
            proc.kill('SIGKILL');
          }
        }, 5000);
      }, timeout);

      proc.stdout?.on('data', (data) => {
        stdout.push(data.toString());
      });

      proc.stderr?.on('data', (data) => {
        stderr.push(data.toString());
      });

      proc.on('close', (code) => {
        clearTimeout(timeoutId);

        const stdoutStr = stdout.join('');
        const stderrStr = stderr.join('');

        if (killed) {
          resolve(JSON.stringify({
            success: false,
            exitCode: code,
            killed: true,
            message: `Command timed out after ${timeout}ms`,
            stdout: stdoutStr.slice(0, 10000),
            stderr: stderrStr.slice(0, 5000),
          }));
          return;
        }

        if (code === 0) {
          // Success - return stdout, or stderr if stdout is empty
          const output = stdoutStr || stderrStr;
          resolve(output || '(no output)');
        } else {
          // Error - include both stdout and stderr
          resolve(JSON.stringify({
            success: false,
            exitCode: code,
            stdout: stdoutStr.slice(0, 10000),
            stderr: stderrStr.slice(0, 5000),
            message: `Command exited with code ${code}`,
          }));
        }
      });

      proc.on('error', (error) => {
        clearTimeout(timeoutId);
        reject(new Error(`Failed to execute command: ${error.message}`));
      });
    });
  },
});
