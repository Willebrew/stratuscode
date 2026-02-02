/**
 * Edit Tool
 *
 * Performs exact string replacements in files.
 */

import { defineTool } from './sage-adapter';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface EditArgs extends Record<string, unknown> {
  file_path: string;
  old_string: string;
  new_string: string;
  replace_all?: boolean;
}

export const editTool = defineTool<EditArgs>({
  name: 'edit',
  description: `Performs exact string replacements in files.

IMPORTANT:
- You must read the file first before editing to understand context.
- The old_string must match EXACTLY (including whitespace and indentation).
- The edit will FAIL if old_string is not found or is not unique (unless replace_all is true).
- The edit will FAIL if old_string and new_string are identical.
- Use replace_all: true to replace all occurrences (useful for renaming variables).

Usage:
- To modify existing code, provide the exact old_string to find and new_string to replace it with.
- Preserve exact indentation from the original file.`,
  parameters: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: 'The absolute path to the file to modify.',
      },
      old_string: {
        type: 'string',
        description: 'The exact text to replace (must be unique unless replace_all is true).',
      },
      new_string: {
        type: 'string',
        description: 'The text to replace it with.',
      },
      replace_all: {
        type: 'boolean',
        description: 'Replace all occurrences of old_string (default: false).',
      },
    },
    required: ['file_path', 'old_string', 'new_string'],
  },
  timeout: 30000,

  async execute(args, context) {
    const { file_path, old_string, new_string, replace_all = false } = args;

    // Validate path is absolute
    if (!path.isAbsolute(file_path)) {
      throw new Error(`Path must be absolute: ${file_path}`);
    }

    // Check old_string and new_string are different
    if (old_string === new_string) {
      throw new Error('old_string and new_string are identical. No change would be made.');
    }

    // Check file exists
    try {
      await fs.access(file_path);
    } catch {
      throw new Error(`File not found: ${file_path}`);
    }

    // Read current content
    const content = await fs.readFile(file_path, 'utf-8');

    // Find occurrences
    const occurrences = countOccurrences(content, old_string);

    if (occurrences === 0) {
      throw new Error(
        `old_string not found in file. Make sure it matches exactly including whitespace.\n\nSearched for:\n${old_string.slice(0, 200)}${old_string.length > 200 ? '...' : ''}`
      );
    }

    if (occurrences > 1 && !replace_all) {
      throw new Error(
        `old_string found ${occurrences} times. Either make it more specific to be unique, or set replace_all: true to replace all occurrences.`
      );
    }

    // Perform replacement
    let newContent: string;
    if (replace_all) {
      newContent = content.split(old_string).join(new_string);
    } else {
      newContent = content.replace(old_string, new_string);
    }

    // Write updated content
    await fs.writeFile(file_path, newContent, 'utf-8');

    // Calculate changes
    const oldLines = content.split('\n').length;
    const newLines = newContent.split('\n').length;
    const lineDiff = newLines - oldLines;

    return JSON.stringify({
      success: true,
      file: file_path,
      replacements: replace_all ? occurrences : 1,
      lineChange: lineDiff,
      message: `Edited ${file_path}: ${replace_all ? occurrences : 1} replacement(s), ${lineDiff >= 0 ? '+' : ''}${lineDiff} lines`,
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
