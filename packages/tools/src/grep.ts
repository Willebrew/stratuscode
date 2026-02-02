/**
 * Grep Tool
 *
 * Search for patterns in files using ripgrep-style search.
 */

import { defineTool } from './sage-adapter';
import { spawn } from 'child_process';
import * as path from 'path';

export interface GrepArgs extends Record<string, unknown> {
  query: string;
  search_path: string;
  includes?: string[];
  case_sensitive?: boolean;
  fixed_strings?: boolean;
  match_per_line?: boolean;
}

export const grepTool = defineTool<GrepArgs>({
  name: 'grep',
  description: `Search for patterns in files.

Features:
- By default, query is treated as a regular expression.
- Set fixed_strings: true to search for literal strings.
- Filter files with includes patterns (glob format, e.g., "*.ts").
- Case-insensitive by default.

Tips:
- Use specific patterns to narrow results.
- Use includes to filter by file type.
- For broad searches, don't use match_per_line to avoid too much output.`,
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search term or pattern to look for.',
      },
      search_path: {
        type: 'string',
        description: 'The path to search (file or directory).',
      },
      includes: {
        type: 'array',
        items: { type: 'string' },
        description: 'Glob patterns to filter files (e.g., "*.ts", "!**/node_modules/*").',
      },
      case_sensitive: {
        type: 'boolean',
        description: 'Perform case-sensitive search (default: false).',
      },
      fixed_strings: {
        type: 'boolean',
        description: 'Treat query as literal string, not regex (default: false).',
      },
      match_per_line: {
        type: 'boolean',
        description: 'Show context around matches (default: false - just show matching files).',
      },
    },
    required: ['query', 'search_path'],
  },
  timeout: 60000,
  maxResultSize: 100000,

  async execute(args, context) {
    const {
      query,
      search_path,
      includes,
      case_sensitive = false,
      fixed_strings = false,
      match_per_line = false,
    } = args;

    const searchDir = path.isAbsolute(search_path) ? search_path : path.join(context.projectDir, search_path);

    // Build grep command args
    const grepArgs: string[] = [];

    // Case sensitivity
    if (!case_sensitive) {
      grepArgs.push('-i');
    }

    // Fixed strings
    if (fixed_strings) {
      grepArgs.push('-F');
    }

    // Include line numbers
    grepArgs.push('-n');

    // Recursive
    grepArgs.push('-r');

    // Include patterns
    if (includes && includes.length > 0) {
      for (const include of includes) {
        if (include.startsWith('!')) {
          grepArgs.push('--exclude=' + include.slice(1));
        } else {
          grepArgs.push('--include=' + include);
        }
      }
    }

    // Exclude common directories
    grepArgs.push('--exclude-dir=node_modules');
    grepArgs.push('--exclude-dir=.git');
    grepArgs.push('--exclude-dir=dist');
    grepArgs.push('--exclude-dir=build');

    // Context if showing per-line matches
    if (match_per_line) {
      grepArgs.push('-C', '2'); // 2 lines of context
    } else {
      grepArgs.push('-l'); // Just list files
    }

    // Query and path
    grepArgs.push(query, searchDir);

    return new Promise((resolve, reject) => {
      const stdout: string[] = [];
      const stderr: string[] = [];

      const proc = spawn('grep', grepArgs, {
        cwd: context.projectDir,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      proc.stdout?.on('data', (data) => {
        stdout.push(data.toString());
      });

      proc.stderr?.on('data', (data) => {
        stderr.push(data.toString());
      });

      proc.on('close', (code) => {
        const output = stdout.join('');
        const errors = stderr.join('');

        if (code === 0) {
          // Found matches
          if (match_per_line) {
            resolve(output || '(no matches)');
          } else {
            // List of files - format nicely
            const files = output.trim().split('\n').filter(Boolean);
            resolve(JSON.stringify({
              query,
              matchingFiles: files.length,
              files: files.slice(0, 100), // Limit to 100 files
              truncated: files.length > 100,
            }, null, 2));
          }
        } else if (code === 1) {
          // No matches found
          resolve(JSON.stringify({
            query,
            matchingFiles: 0,
            message: 'No matches found',
          }));
        } else {
          // Error
          if (errors.includes('No such file or directory')) {
            reject(new Error(`Path not found: ${searchDir}`));
          } else {
            reject(new Error(`grep failed: ${errors || 'Unknown error'}`));
          }
        }
      });

      proc.on('error', (error) => {
        // grep not available - fall back to simple search
        reject(new Error(`grep command not available: ${error.message}`));
      });
    });
  },
});
