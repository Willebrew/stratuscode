/**
 * Diff Utility
 *
 * Generates unified diff format for file changes.
 */

/**
 * Generate a unified diff between old and new content.
 */
export function generateUnifiedDiff(
  oldContent: string,
  newContent: string,
  filePath: string
): string {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');

  const diffLines: string[] = [
    `--- a/${filePath}`,
    `+++ b/${filePath}`,
  ];

  const changes: Array<{ type: 'add' | 'remove' | 'context'; line: string }> = [];

  let i = 0, j = 0;
  while (i < oldLines.length || j < newLines.length) {
    if (i >= oldLines.length) {
      changes.push({ type: 'add', line: newLines[j++]! });
    } else if (j >= newLines.length) {
      changes.push({ type: 'remove', line: oldLines[i++]! });
    } else if (oldLines[i] === newLines[j]) {
      changes.push({ type: 'context', line: oldLines[i]! });
      i++;
      j++;
    } else {
      // Look ahead for matches
      const lookAhead = 5;
      let foundOld = -1, foundNew = -1;

      for (let k = 1; k <= lookAhead && foundOld === -1; k++) {
        if (i + k < oldLines.length && oldLines[i + k] === newLines[j]) {
          foundOld = k;
        }
      }
      for (let k = 1; k <= lookAhead && foundNew === -1; k++) {
        if (j + k < newLines.length && oldLines[i] === newLines[j + k]) {
          foundNew = k;
        }
      }

      if (foundNew !== -1 && (foundOld === -1 || foundNew <= foundOld)) {
        for (let k = 0; k < foundNew; k++) {
          changes.push({ type: 'add', line: newLines[j++]! });
        }
      } else if (foundOld !== -1) {
        for (let k = 0; k < foundOld; k++) {
          changes.push({ type: 'remove', line: oldLines[i++]! });
        }
      } else {
        changes.push({ type: 'remove', line: oldLines[i++]! });
        changes.push({ type: 'add', line: newLines[j++]! });
      }
    }
  }

  // Split into hunks with context
  if (changes.length > 0) {
    const CONTEXT = 3;
    // Find ranges of non-context lines and group them into hunks
    const nonContextIndices: number[] = [];
    for (let idx = 0; idx < changes.length; idx++) {
      if (changes[idx]!.type !== 'context') nonContextIndices.push(idx);
    }

    if (nonContextIndices.length === 0) return ''; // No changes

    // Group non-context indices into hunk ranges
    const hunkRanges: Array<[number, number]> = [];
    let start = nonContextIndices[0]!;
    let end = nonContextIndices[0]!;

    for (let idx = 1; idx < nonContextIndices.length; idx++) {
      if (nonContextIndices[idx]! - end <= CONTEXT * 2 + 1) {
        end = nonContextIndices[idx]!;
      } else {
        hunkRanges.push([start, end]);
        start = nonContextIndices[idx]!;
        end = nonContextIndices[idx]!;
      }
    }
    hunkRanges.push([start, end]);

    for (const [hStart, hEnd] of hunkRanges) {
      const ctxStart = Math.max(0, hStart - CONTEXT);
      const ctxEnd = Math.min(changes.length - 1, hEnd + CONTEXT);

      let oldLine = 1, newLine = 1;
      // Count lines before this hunk
      for (let idx = 0; idx < ctxStart; idx++) {
        if (changes[idx]!.type !== 'add') oldLine++;
        if (changes[idx]!.type !== 'remove') newLine++;
      }

      const hunkChanges = changes.slice(ctxStart, ctxEnd + 1);
      const oldCount = hunkChanges.filter(c => c.type !== 'add').length;
      const newCount = hunkChanges.filter(c => c.type !== 'remove').length;

      diffLines.push(`@@ -${oldLine},${oldCount} +${newLine},${newCount} @@`);

      for (const change of hunkChanges) {
        const prefix = change.type === 'add' ? '+' : change.type === 'remove' ? '-' : ' ';
        diffLines.push(`${prefix}${change.line}`);
      }
    }
  }

  return diffLines.join('\n');
}
