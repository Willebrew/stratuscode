/**
 * Write Tool
 *
 * Creates new files with specified content.
 */

import { defineTool } from './sage-adapter';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface WriteArgs extends Record<string, unknown> {
  file_path: string;
  content: string;
}

export const writeTool = defineTool<WriteArgs>({
  name: 'write',
  description: `Creates a new file with the specified content.
- The file and any parent directories will be created if they don't exist.
- This tool should only be used to create NEW files.
- Do NOT use this to modify existing files - use the edit tool instead.
- The file_path must be an absolute path.`,
  parameters: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: 'The absolute path to the file to create.',
      },
      content: {
        type: 'string',
        description: 'The content to write to the file.',
      },
    },
    required: ['file_path', 'content'],
  },
  timeout: 30000,

  async execute(args, context) {
    const { file_path, content } = args;

    // Validate path is absolute
    if (!path.isAbsolute(file_path)) {
      throw new Error(`Path must be absolute: ${file_path}`);
    }

    // Check if file already exists
    try {
      await fs.access(file_path);
      throw new Error(
        `File already exists: ${file_path}. Use the edit tool to modify existing files.`
      );
    } catch (e) {
      // File doesn't exist - this is expected
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw e;
      }
    }

    // Create parent directories if needed
    const dir = path.dirname(file_path);
    await fs.mkdir(dir, { recursive: true });

    // Write file
    await fs.writeFile(file_path, content, 'utf-8');

    // Get stats for confirmation
    const stats = await fs.stat(file_path);
    const lineCount = content.split('\n').length;

    return JSON.stringify({
      success: true,
      file: file_path,
      bytes: stats.size,
      lines: lineCount,
      message: `Created file ${file_path} (${lineCount} lines, ${stats.size} bytes)`,
    });
  },
});
