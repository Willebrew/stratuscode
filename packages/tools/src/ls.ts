/**
 * List Directory Tool
 *
 * Lists files and directories in a given path.
 */

import { defineTool } from './sage-adapter';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface LsArgs extends Record<string, unknown> {
  directory_path: string;
}

export const lsTool = defineTool<LsArgs>({
  name: 'ls',
  description: `Lists files and directories in a given path.

For each item, shows:
- Relative path
- Type (file or directory)
- Size in bytes (for files)
- Item count (for directories)

Tips:
- Use an absolute path for the directory.
- For exploring unfamiliar codebases, start at the root.
- Use glob or grep tools for more specific searches.`,
  parameters: {
    type: 'object',
    properties: {
      directory_path: {
        type: 'string',
        description: 'The absolute path to the directory to list.',
      },
    },
    required: ['directory_path'],
  },
  timeout: 30000,
  maxResultSize: 50000,

  async execute(args, context) {
    const { directory_path } = args;

    // Validate path is absolute
    if (!path.isAbsolute(directory_path)) {
      throw new Error(`Path must be absolute: ${directory_path}`);
    }

    // Check directory exists
    let stats;
    try {
      stats = await fs.stat(directory_path);
    } catch {
      throw new Error(`Path not found: ${directory_path}`);
    }

    if (!stats.isDirectory()) {
      throw new Error(`Path is not a directory: ${directory_path}`);
    }

    // Read directory contents
    const entries = await fs.readdir(directory_path, { withFileTypes: true });

    // Sort: directories first, then files, both alphabetically
    entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    const results: Array<{
      name: string;
      type: 'file' | 'directory';
      size?: number;
      items?: number;
    }> = [];

    for (const entry of entries) {
      const fullPath = path.join(directory_path, entry.name);
      const isDir = entry.isDirectory();

      const item: { name: string; type: 'file' | 'directory'; size?: number; items?: number } = {
        name: entry.name,
        type: isDir ? 'directory' : 'file',
      };

      try {
        if (isDir) {
          // Count items in directory
          const subEntries = await fs.readdir(fullPath);
          item.items = subEntries.length;
        } else {
          // Get file size
          const fileStats = await fs.stat(fullPath);
          item.size = fileStats.size;
        }
      } catch {
        // Ignore errors for individual items
      }

      results.push(item);
    }

    // Format output
    const output = results.map(item => {
      if (item.type === 'directory') {
        return `📁 ${item.name}/ (${item.items ?? '?'} items)`;
      } else {
        return `📄 ${item.name} (${formatBytes(item.size ?? 0)})`;
      }
    });

    return `Directory: ${directory_path}\n\n${output.join('\n')}`;
  },
});

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
