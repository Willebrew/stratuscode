/**
 * Read Tool
 *
 * Reads file contents with line numbers.
 */

import { defineTool } from './sage-adapter';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface ReadArgs extends Record<string, unknown> {
  file_path: string;
  offset?: number;
  limit?: number;
}

export const readTool = defineTool<ReadArgs>({
  name: 'read',
  description: `Reads a file at the specified path.
- The file_path parameter must be an absolute path.
- You can optionally specify offset (1-indexed line number) and limit to read portions of large files.
- Text files are returned with line numbers in cat -n format.
- Any lines longer than 2000 characters will be truncated.`,
  parameters: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: 'The absolute path to the file to read.',
      },
      offset: {
        type: 'integer',
        description: 'The 1-indexed line number to start reading from.',
      },
      limit: {
        type: 'integer',
        description: 'The number of lines to read.',
      },
    },
    required: ['file_path'],
  },
  timeout: 30000,
  maxResultSize: 100000,

  async execute(args, context) {
    const { file_path, offset, limit } = args;

    // Validate path is absolute
    if (!path.isAbsolute(file_path)) {
      throw new Error(`Path must be absolute: ${file_path}`);
    }

    // Check file exists
    try {
      await fs.access(file_path);
    } catch {
      throw new Error(`File not found: ${file_path}`);
    }

    // Read file stats
    const stats = await fs.stat(file_path);
    if (stats.isDirectory()) {
      throw new Error(`Path is a directory, not a file: ${file_path}`);
    }

    // Read file content
    const content = await fs.readFile(file_path, 'utf-8');
    const lines = content.split('\n');
    const totalLines = lines.length;

    // Apply offset and limit
    const startLine = offset ? Math.max(1, offset) : 1;
    const endLine = limit ? Math.min(startLine + limit - 1, totalLines) : totalLines;

    // Format with line numbers (cat -n style)
    const MAX_LINE_LENGTH = 2000;
    const outputLines: string[] = [];
    
    // Calculate padding for line numbers
    const maxLineNum = endLine;
    const padding = String(maxLineNum).length;

    for (let i = startLine - 1; i < endLine && i < lines.length; i++) {
      const lineNum = i + 1;
      let line = lines[i] || '';
      
      // Truncate long lines
      if (line.length > MAX_LINE_LENGTH) {
        line = line.slice(0, MAX_LINE_LENGTH) + '... [truncated]';
      }

      outputLines.push(`${String(lineNum).padStart(padding)}→${line}`);
    }

    // Build result
    const result = {
      file: file_path,
      startLine,
      endLine: Math.min(endLine, totalLines),
      totalLines,
      content: outputLines.join('\n'),
    };

    // If partial read, add note
    if (offset || limit) {
      return `File: ${file_path} (lines ${startLine}-${result.endLine} of ${totalLines})\n\n${result.content}`;
    }

    return `File: ${file_path} (${totalLines} lines)\n\n${result.content}`;
  },
});
