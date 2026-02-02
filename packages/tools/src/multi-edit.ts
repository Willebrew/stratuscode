/**
 * Multi-Edit Tool
 *
 * Performs multiple exact string replacements in a single file atomically.
 */

import { defineTool } from './sage-adapter';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface EditOperation {
  old_string: string;
  new_string: string;
  replace_all?: boolean;
}

export interface MultiEditArgs extends Record<string, unknown> {
  file_path: string;
  edits: EditOperation[];
}

export const multiEditTool = defineTool<MultiEditArgs>({
  name: 'multi_edit',
  description: `Performs multiple exact string replacements in a single file atomically.

IMPORTANT:
- All edits are applied in sequence, in the order provided.
- Each edit operates on the result of the previous edit.
- All edits must succeed or none are applied (atomic operation).
- Use this when you need to make several changes to different parts of the same file.

Usage:
- Provide an array of edits, each with old_string and new_string.
- Edits are applied in order, so plan carefully to avoid conflicts.
- Earlier edits may change the text that later edits are trying to find.`,
  parameters: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: 'The absolute path to the file to modify.',
      },
      edits: {
        type: 'array',
        description: 'Array of edit operations to perform sequentially.',
        items: {
          type: 'object',
          properties: {
            old_string: {
              type: 'string',
              description: 'The exact text to replace.',
            },
            new_string: {
              type: 'string',
              description: 'The text to replace it with.',
            },
            replace_all: {
              type: 'boolean',
              description: 'Replace all occurrences (default: false).',
            },
          },
          required: ['old_string', 'new_string'],
        },
      },
    },
    required: ['file_path', 'edits'],
  },
  timeout: 60000,

  async execute(args, context) {
    const { file_path, edits } = args;

    // Validate path is absolute
    if (!path.isAbsolute(file_path)) {
      throw new Error(`Path must be absolute: ${file_path}`);
    }

    // Validate we have edits
    if (!edits || edits.length === 0) {
      throw new Error('No edits provided.');
    }

    // Check file exists
    try {
      await fs.access(file_path);
    } catch {
      throw new Error(`File not found: ${file_path}`);
    }

    // Read current content
    const originalContent = await fs.readFile(file_path, 'utf-8');
    let content = originalContent;

    // Track results for each edit
    const results: Array<{
      index: number;
      old_string: string;
      replacements: number;
    }> = [];

    // Apply each edit in sequence
    for (let i = 0; i < edits.length; i++) {
      const edit = edits[i]!;
      const { old_string, new_string, replace_all = false } = edit;

      // Validate strings are different
      if (old_string === new_string) {
        throw new Error(
          `Edit ${i + 1}: old_string and new_string are identical. No change would be made.`
        );
      }

      // Find occurrences
      const occurrences = countOccurrences(content, old_string);

      if (occurrences === 0) {
        throw new Error(
          `Edit ${i + 1}: old_string not found. This may be due to a previous edit changing the text.\n\nSearched for:\n${old_string.slice(0, 200)}${old_string.length > 200 ? '...' : ''}`
        );
      }

      if (occurrences > 1 && !replace_all) {
        throw new Error(
          `Edit ${i + 1}: old_string found ${occurrences} times. Either make it more specific to be unique, or set replace_all: true.`
        );
      }

      // Perform replacement
      if (replace_all) {
        content = content.split(old_string).join(new_string);
      } else {
        content = content.replace(old_string, new_string);
      }

      results.push({
        index: i + 1,
        old_string: old_string.slice(0, 50) + (old_string.length > 50 ? '...' : ''),
        replacements: replace_all ? occurrences : 1,
      });
    }

    // All edits succeeded - write the file
    await fs.writeFile(file_path, content, 'utf-8');

    // Calculate changes
    const oldLines = originalContent.split('\n').length;
    const newLines = content.split('\n').length;
    const lineDiff = newLines - oldLines;
    const totalReplacements = results.reduce((sum, r) => sum + r.replacements, 0);

    return JSON.stringify({
      success: true,
      file: file_path,
      editsApplied: edits.length,
      totalReplacements,
      lineChange: lineDiff,
      results,
      message: `Applied ${edits.length} edits to ${file_path}: ${totalReplacements} total replacement(s), ${lineDiff >= 0 ? '+' : ''}${lineDiff} lines`,
    });
  },
});

function countOccurrences(str: string, search: string): number {
  let count = 0;
  let pos = 0;
  while ((pos = str.indexOf(search, pos)) !== -1) {
    count++;
    pos += search.length;
  }
  return count;
}
