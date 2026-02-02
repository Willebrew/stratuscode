/**
 * Apply Patch Tool
 *
 * Applies unified diff patches to files.
 */

import { defineTool } from './sage-adapter';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface ApplyPatchArgs extends Record<string, unknown> {
  patch: string;
  cwd?: string;
}

export const applyPatchTool = defineTool<ApplyPatchArgs>({
  name: 'apply_patch',
  description: `Apply a unified diff patch to files.

The patch should be in unified diff format (output of git diff or diff -u).
Supports multi-file patches.

Example patch format:
--- a/file.txt
+++ b/file.txt
@@ -1,3 +1,4 @@
 line 1
+new line
 line 2
 line 3`,
  parameters: {
    type: 'object',
    properties: {
      patch: {
        type: 'string',
        description: 'The unified diff patch to apply.',
      },
      cwd: {
        type: 'string',
        description: 'Working directory for relative paths in the patch. Defaults to project directory.',
      },
    },
    required: ['patch'],
  },
  timeout: 30000,

  async execute(args, context) {
    const { patch, cwd } = args;
    const workDir = cwd || context.projectDir;

    // Parse the patch
    const filePatches = parsePatch(patch);

    if (filePatches.length === 0) {
      throw new Error('No valid patches found in input');
    }

    const results: Array<{
      file: string;
      hunksApplied: number;
      success: boolean;
    }> = [];

    // Apply each file patch
    for (const filePatch of filePatches) {
      const filePath = path.isAbsolute(filePatch.path)
        ? filePatch.path
        : path.join(workDir, filePatch.path);

      try {
        // Read current content
        let content: string;
        try {
          content = await fs.readFile(filePath, 'utf-8');
        } catch {
          // File doesn't exist, start with empty content for new files
          content = '';
        }

        // Apply hunks
        const newContent = applyHunks(content, filePatch.hunks);

        // Write updated content
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, newContent, 'utf-8');

        results.push({
          file: filePatch.path,
          hunksApplied: filePatch.hunks.length,
          success: true,
        });
      } catch (error) {
        results.push({
          file: filePatch.path,
          hunksApplied: 0,
          success: false,
        });
        throw new Error(
          `Failed to apply patch to ${filePatch.path}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    return JSON.stringify({
      success: true,
      filesPatched: results.length,
      results,
      message: `Applied patch to ${results.length} file(s)`,
    });
  },
});

// ============================================
// Patch Parsing
// ============================================

interface FilePatch {
  path: string;
  hunks: Hunk[];
}

interface Hunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: HunkLine[];
}

interface HunkLine {
  type: 'context' | 'add' | 'remove';
  content: string;
}

function parsePatch(patch: string): FilePatch[] {
  const files: FilePatch[] = [];
  const lines = patch.split('\n');
  let i = 0;

  while (i < lines.length) {
    // Look for file header
    if (lines[i]?.startsWith('---') && lines[i + 1]?.startsWith('+++')) {
      const oldFile = lines[i]!.slice(4).trim();
      const newFile = lines[i + 1]!.slice(4).trim();
      
      // Remove a/ or b/ prefix
      const filePath = newFile.replace(/^[ab]\//, '');
      
      const hunks: Hunk[] = [];
      i += 2;

      // Parse hunks
      while (i < lines.length && !lines[i]?.startsWith('---')) {
        if (lines[i]?.startsWith('@@')) {
          const hunk = parseHunk(lines, i);
          if (hunk) {
            hunks.push(hunk.hunk);
            i = hunk.nextIndex;
          } else {
            i++;
          }
        } else {
          i++;
        }
      }

      if (hunks.length > 0) {
        files.push({ path: filePath, hunks });
      }
    } else {
      i++;
    }
  }

  return files;
}

function parseHunk(lines: string[], startIndex: number): { hunk: Hunk; nextIndex: number } | null {
  const headerLine = lines[startIndex];
  if (!headerLine) return null;

  // Parse @@ -oldStart,oldCount +newStart,newCount @@
  const match = headerLine.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
  if (!match) return null;

  const hunk: Hunk = {
    oldStart: parseInt(match[1]!, 10),
    oldCount: parseInt(match[2] || '1', 10),
    newStart: parseInt(match[3]!, 10),
    newCount: parseInt(match[4] || '1', 10),
    lines: [],
  };

  let i = startIndex + 1;
  while (i < lines.length) {
    const line = lines[i];
    if (!line || line.startsWith('@@') || line.startsWith('---')) {
      break;
    }

    if (line.startsWith('+')) {
      hunk.lines.push({ type: 'add', content: line.slice(1) });
    } else if (line.startsWith('-')) {
      hunk.lines.push({ type: 'remove', content: line.slice(1) });
    } else if (line.startsWith(' ') || line === '') {
      hunk.lines.push({ type: 'context', content: line.slice(1) || '' });
    } else {
      // Treat as context if no prefix
      hunk.lines.push({ type: 'context', content: line });
    }
    i++;
  }

  return { hunk, nextIndex: i };
}

// ============================================
// Patch Application
// ============================================

function applyHunks(content: string, hunks: Hunk[]): string {
  const lines = content.split('\n');
  let offset = 0;

  for (const hunk of hunks) {
    const startLine = hunk.oldStart - 1 + offset;

    // Remove old lines and add new lines
    const linesToRemove: number[] = [];
    const linesToAdd: string[] = [];

    for (const line of hunk.lines) {
      if (line.type === 'add') {
        linesToAdd.push(line.content);
      } else if (line.type === 'remove') {
        linesToRemove.push(1);
      }
    }

    // Apply the hunk
    let removeCount = 0;
    const newLines: string[] = [];
    let lineIndex = 0;

    for (const hunkLine of hunk.lines) {
      if (hunkLine.type === 'context') {
        newLines.push(hunkLine.content);
        lineIndex++;
      } else if (hunkLine.type === 'add') {
        newLines.push(hunkLine.content);
      } else if (hunkLine.type === 'remove') {
        lineIndex++;
        removeCount++;
      }
    }

    // Replace the lines
    lines.splice(startLine, hunk.oldCount, ...newLines);
    offset += hunk.newCount - hunk.oldCount;
  }

  return lines.join('\n');
}
