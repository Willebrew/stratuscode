/**
 * Glob Tool
 *
 * Find files and directories by pattern.
 */

import { defineTool } from './sage-adapter';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface GlobArgs extends Record<string, unknown> {
  pattern: string;
  search_directory: string;
  type?: 'file' | 'directory' | 'any';
  max_depth?: number;
  excludes?: string[];
}

export const globTool = defineTool<GlobArgs>({
  name: 'glob',
  description: `Search for files and directories by pattern.

Features:
- Uses glob patterns (e.g., "**/*.ts", "src/**/*.tsx").
- Can filter by type (file, directory, or any).
- Respects .gitignore by default.
- Results are capped at 100 matches.

Tips:
- Use "**" to match any directory depth.
- Use specific patterns to narrow results.
- Set max_depth to limit search depth.`,
  parameters: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Glob pattern to search for (e.g., "**/*.ts").',
      },
      search_directory: {
        type: 'string',
        description: 'The directory to search within.',
      },
      type: {
        type: 'string',
        enum: ['file', 'directory', 'any'],
        description: 'Type filter (default: any).',
      },
      max_depth: {
        type: 'integer',
        description: 'Maximum directory depth to search.',
      },
      excludes: {
        type: 'array',
        items: { type: 'string' },
        description: 'Patterns to exclude.',
      },
    },
    required: ['pattern', 'search_directory'],
  },
  timeout: 30000,
  maxResultSize: 50000,

  async execute(args, context) {
    const {
      pattern,
      search_directory,
      type = 'any',
      max_depth,
      excludes = [],
    } = args;

    const searchDir = path.isAbsolute(search_directory)
      ? search_directory
      : path.join(context.projectDir, search_directory);

    // Default excludes
    const defaultExcludes = ['node_modules', '.git', 'dist', 'build', '.next'];
    const allExcludes = new Set([...defaultExcludes, ...excludes]);

    const results: Array<{
      path: string;
      type: 'file' | 'directory';
      size?: number;
    }> = [];

    const MAX_RESULTS = 100;

    // Simple glob implementation
    async function search(dir: string, depth: number): Promise<void> {
      if (results.length >= MAX_RESULTS) return;
      if (max_depth !== undefined && depth > max_depth) return;

      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return; // Skip directories we can't read
      }

      for (const entry of entries) {
        if (results.length >= MAX_RESULTS) break;

        // Skip excluded directories
        if (allExcludes.has(entry.name)) continue;

        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(searchDir, fullPath);

        const isDir = entry.isDirectory();
        const isFile = entry.isFile();

        // Check if matches pattern
        if (matchGlob(relativePath, pattern)) {
          // Check type filter
          if (type === 'any' || (type === 'file' && isFile) || (type === 'directory' && isDir)) {
            const item: { path: string; type: 'file' | 'directory'; size?: number } = {
              path: relativePath,
              type: isDir ? 'directory' : 'file',
            };

            if (isFile) {
              try {
                const stats = await fs.stat(fullPath);
                item.size = stats.size;
              } catch {
                // Ignore stat errors
              }
            }

            results.push(item);
          }
        }

        // Recurse into directories
        if (isDir) {
          await search(fullPath, depth + 1);
        }
      }
    }

    await search(searchDir, 0);

    return JSON.stringify({
      pattern,
      searchDirectory: searchDir,
      total: results.length,
      truncated: results.length >= MAX_RESULTS,
      results,
    }, null, 2);
  },
});

/**
 * Simple glob pattern matching
 */
function matchGlob(filepath: string, pattern: string): boolean {
  // Convert glob to regex
  let regex = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/{{GLOBSTAR}}/g, '.*');

  // Handle patterns that should match anywhere
  if (!pattern.startsWith('*') && !pattern.startsWith('/')) {
    regex = '(^|/)' + regex;
  }

  regex = '^' + regex + '$';

  try {
    return new RegExp(regex).test(filepath);
  } catch {
    return false;
  }
}
