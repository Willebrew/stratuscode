/**
 * RichDiff Component
 *
 * A rich diff visualization with line numbers, syntax highlighting,
 * and collapsible hunks. Inspired by OpenCode's diff component.
 */

import React, { useState, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { Collapsible } from './Collapsible';
import { colors } from '../theme/colors';
import { icons } from '../theme/icons';

// ============================================
// Types
// ============================================

export interface RichDiffProps {
  /** The diff content (unified diff format) */
  diff: string;
  /** File path for display */
  filePath?: string;
  /** Language for syntax highlighting hints */
  language?: string;
  /** Initially collapsed */
  defaultCollapsed?: boolean;
  /** Whether this diff is focused */
  isFocused?: boolean;
  /** Max lines to show before truncating */
  maxLines?: number;
}

interface DiffLine {
  type: 'header' | 'hunk' | 'add' | 'remove' | 'context' | 'empty';
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
}

interface DiffHunk {
  header: string;
  lines: DiffLine[];
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
}

interface ParsedDiff {
  oldFile?: string;
  newFile?: string;
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
}

// ============================================
// Parser
// ============================================

function parseDiff(diff: string): ParsedDiff {
  const lines = diff.split('\n');
  const result: ParsedDiff = {
    hunks: [],
    additions: 0,
    deletions: 0,
  };

  let currentHunk: DiffHunk | null = null;
  let oldLineNum = 0;
  let newLineNum = 0;

  for (const line of lines) {
    // File headers
    if (line.startsWith('--- ')) {
      result.oldFile = line.slice(4).replace(/^a\//, '');
      continue;
    }
    if (line.startsWith('+++ ')) {
      result.newFile = line.slice(4).replace(/^b\//, '');
      continue;
    }

    // Hunk header: @@ -1,5 +1,7 @@
    const hunkMatch = line.match(/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@(.*)$/);
    if (hunkMatch) {
      if (currentHunk) {
        result.hunks.push(currentHunk);
      }

      const [, oldStartRaw, oldCountRaw, newStartRaw, newCountRaw] = hunkMatch;
      if (!oldStartRaw || !newStartRaw) continue;

      const oldStart = parseInt(oldStartRaw, 10);
      const oldCount = parseInt(oldCountRaw ?? '1', 10);
      const newStart = parseInt(newStartRaw, 10);
      const newCount = parseInt(newCountRaw ?? '1', 10);

      currentHunk = {
        header: line,
        lines: [],
        oldStart,
        oldCount,
        newStart,
        newCount,
      };
      
      oldLineNum = oldStart;
      newLineNum = newStart;
      continue;
    }

    if (!currentHunk) continue;

    // Diff lines
    if (line.startsWith('+')) {
      currentHunk.lines.push({
        type: 'add',
        content: line.slice(1),
        newLineNum: newLineNum++,
      });
      result.additions++;
    } else if (line.startsWith('-')) {
      currentHunk.lines.push({
        type: 'remove',
        content: line.slice(1),
        oldLineNum: oldLineNum++,
      });
      result.deletions++;
    } else if (line.startsWith(' ')) {
      currentHunk.lines.push({
        type: 'context',
        content: line.slice(1),
        oldLineNum: oldLineNum++,
        newLineNum: newLineNum++,
      });
    } else if (line === '') {
      currentHunk.lines.push({
        type: 'empty',
        content: '',
        oldLineNum: oldLineNum++,
        newLineNum: newLineNum++,
      });
    }
  }

  if (currentHunk) {
    result.hunks.push(currentHunk);
  }

  return result;
}

// ============================================
// Syntax Highlighting (basic)
// ============================================

const KEYWORDS = new Set([
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while',
  'class', 'extends', 'import', 'export', 'from', 'default', 'async', 'await',
  'try', 'catch', 'throw', 'new', 'this', 'super', 'typeof', 'instanceof',
  'true', 'false', 'null', 'undefined', 'void', 'type', 'interface', 'enum',
]);

function highlightLine(content: string, baseColor: string): React.ReactNode {
  // Simple keyword highlighting
  const parts: React.ReactNode[] = [];
  let remaining = content;
  let key = 0;

  // Match strings, comments, keywords
  const regex = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\/\/.*$|\/\*[\s\S]*?\*\/|\b\w+\b)/g;
  let match;
  let lastIndex = 0;

  while ((match = regex.exec(content)) !== null) {
    // Add text before match
    if (match.index > lastIndex) {
      parts.push(
        <Text key={key++} color={baseColor}>
          {content.slice(lastIndex, match.index)}
        </Text>
      );
    }

    const token = match[0];
    
    // Strings
    if (token.startsWith('"') || token.startsWith("'") || token.startsWith('`')) {
      parts.push(
        <Text key={key++} color={colors.success}>
          {token}
        </Text>
      );
    }
    // Comments
    else if (token.startsWith('//') || token.startsWith('/*')) {
      parts.push(
        <Text key={key++} color={colors.textDim}>
          {token}
        </Text>
      );
    }
    // Keywords
    else if (KEYWORDS.has(token)) {
      parts.push(
        <Text key={key++} color={colors.secondary} bold>
          {token}
        </Text>
      );
    }
    // Other tokens
    else {
      parts.push(
        <Text key={key++} color={baseColor}>
          {token}
        </Text>
      );
    }

    lastIndex = regex.lastIndex;
  }

  // Add remaining text
  if (lastIndex < content.length) {
    parts.push(
      <Text key={key++} color={baseColor}>
        {content.slice(lastIndex)}
      </Text>
    );
  }

  return parts.length > 0 ? <>{parts}</> : <Text color={baseColor}>{content}</Text>;
}

// ============================================
// Line Number Display
// ============================================

function LineNumbers({ oldNum, newNum, width = 4 }: { oldNum?: number; newNum?: number; width?: number }) {
  const oldStr = oldNum !== undefined ? String(oldNum).padStart(width, ' ') : ' '.repeat(width);
  const newStr = newNum !== undefined ? String(newNum).padStart(width, ' ') : ' '.repeat(width);
  
  return (
    <Text color={colors.textDim}>
      {oldStr} {newStr} │
    </Text>
  );
}

// ============================================
// Diff Line Component
// ============================================

function DiffLineDisplay({ line, showLineNumbers = true }: { line: DiffLine; showLineNumbers?: boolean }) {
  const prefix = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ';

  // Colors: green for additions, red for deletions, dim for context
  const lineColor = 
    line.type === 'add' ? '#22c55e' :      // bright green
    line.type === 'remove' ? '#ef4444' :   // bright red
    colors.textMuted;

  // Background: subtle tint for additions/deletions only, no bg for context
  const bgColor =
    line.type === 'add' ? '#052e16' :      // dark green bg
    line.type === 'remove' ? '#450a0a' :   // dark red bg
    undefined;

  return (
    <Box>
      {showLineNumbers && (
        <LineNumbers oldNum={line.oldLineNum} newNum={line.newLineNum} />
      )}
      <Text backgroundColor={bgColor} color={lineColor}>
        {prefix}{line.content || ' '}
      </Text>
    </Box>
  );
}

// ============================================
// Hunk Component
// ============================================

function DiffHunkDisplay({ 
  hunk, 
  index, 
  defaultCollapsed = false,
  showLineNumbers = true,
}: { 
  hunk: DiffHunk; 
  index: number;
  defaultCollapsed?: boolean;
  showLineNumbers?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const hunkHeader = (
    <Box>
      <Text color={colors.info}>
        @@ -{hunk.oldStart},{hunk.oldCount} +{hunk.newStart},{hunk.newCount} @@
      </Text>
      <Text color={colors.textDim}> ({hunk.lines.length} lines)</Text>
    </Box>
  );

  return (
    <Box flexDirection="column">
      {/* Hunk header - clickable to collapse */}
      <Box>
        <Text 
          color={colors.textDim}
          dimColor
        >
          {collapsed ? '▶' : '▼'}{' '}
        </Text>
        {hunkHeader}
      </Box>
      
      {/* Hunk lines */}
      {!collapsed && (
        <Box flexDirection="column" marginLeft={2}>
          {hunk.lines.map((line, i) => (
            <DiffLineDisplay key={i} line={line} showLineNumbers={showLineNumbers} />
          ))}
        </Box>
      )}
    </Box>
  );
}

// ============================================
// Main Component
// ============================================

export function RichDiff({
  diff,
  filePath,
  language,
  defaultCollapsed = false,
  isFocused = false,
  maxLines = 100,
}: RichDiffProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  
  const parsed = useMemo(() => parseDiff(diff), [diff]);
  
  // Detect language from file extension
  const detectedLanguage = language || (filePath ? getLanguageFromPath(filePath) : undefined);
  
  // Calculate total lines for truncation
  const totalLines = parsed.hunks.reduce((sum, h) => sum + h.lines.length, 0);
  const isTruncated = totalLines > maxLines;

  useInput((input, key) => {
    if (!isFocused) return;
    
    if (input === 'c' || input === ' ') {
      setCollapsed(!collapsed);
    }
  });

  const displayPath = filePath || parsed.newFile || parsed.oldFile || 'Diff';

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={isFocused ? colors.primary : colors.border}
    >
      {/* Header */}
      <Box paddingX={1} justifyContent="space-between">
        <Box>
          <Text color={colors.secondary}>{icons.file} </Text>
          <Text bold color={isFocused ? colors.primary : colors.text}>{displayPath}</Text>
          {detectedLanguage && (
            <Text color={colors.textDim}> ({detectedLanguage})</Text>
          )}
        </Box>
        <Box>
          <Text color={colors.success}>+{parsed.additions}</Text>
          <Text color={colors.textDim}> / </Text>
          <Text color={colors.error}>-{parsed.deletions}</Text>
          <Text color={colors.textDim}> (</Text>
          <Text color={colors.textMuted}>{collapsed ? 'c to expand' : 'c to collapse'}</Text>
          <Text color={colors.textDim}>)</Text>
        </Box>
      </Box>

      {/* Diff content */}
      {!collapsed && (
        <Box flexDirection="column" paddingX={1}>
          {parsed.hunks.map((hunk, i) => (
            <DiffHunkDisplay 
              key={i} 
              hunk={hunk} 
              index={i}
              showLineNumbers={true}
            />
          ))}
          
          {isTruncated && (
            <Box marginTop={1}>
              <Text color={colors.textDim}>
                ... {totalLines - maxLines} more lines (showing first {maxLines})
              </Text>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}

// ============================================
// Helpers
// ============================================

function getLanguageFromPath(path: string): string | undefined {
  const ext = path.split('.').pop()?.toLowerCase();
  const langMap: Record<string, string> = {
    ts: 'TypeScript',
    tsx: 'TypeScript',
    js: 'JavaScript',
    jsx: 'JavaScript',
    py: 'Python',
    rb: 'Ruby',
    go: 'Go',
    rs: 'Rust',
    java: 'Java',
    c: 'C',
    cpp: 'C++',
    h: 'C',
    hpp: 'C++',
    css: 'CSS',
    scss: 'SCSS',
    html: 'HTML',
    json: 'JSON',
    yaml: 'YAML',
    yml: 'YAML',
    md: 'Markdown',
    sh: 'Shell',
    bash: 'Bash',
    zsh: 'Zsh',
  };
  return ext ? langMap[ext] : undefined;
}

// ============================================
// Simple Diff Generator
// ============================================

export function generateUnifiedDiff(
  oldContent: string,
  newContent: string,
  oldPath: string = 'a/file',
  newPath: string = 'b/file'
): string {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');
  
  const diffLines: string[] = [
    `--- ${oldPath}`,
    `+++ ${newPath}`,
  ];
  
  // Simple LCS-based diff
  const changes: Array<{ type: 'add' | 'remove' | 'context'; line: string }> = [];
  
  let i = 0, j = 0;
  while (i < oldLines.length || j < newLines.length) {
    const hasOld = i < oldLines.length;
    const hasNew = j < newLines.length;

    if (!hasOld && hasNew) {
      const line = newLines[j] ?? '';
      changes.push({ type: 'add', line });
      j++;
      continue;
    }

    if (hasOld && !hasNew) {
      const line = oldLines[i] ?? '';
      changes.push({ type: 'remove', line });
      i++;
      continue;
    }

    const oldLine = oldLines[i] ?? '';
    const newLine = newLines[j] ?? '';

    if (oldLine === newLine) {
      changes.push({ type: 'context', line: oldLine });
      i++;
      j++;
      continue;
    }

    // Look ahead for matches
    const lookAhead = 3;
    let foundOld = -1, foundNew = -1;
    
    for (let k = 1; k <= lookAhead && foundOld === -1; k++) {
      const candidate = oldLines[i + k];
      if (candidate !== undefined && candidate === newLine) {
        foundOld = k;
      }
    }
    for (let k = 1; k <= lookAhead && foundNew === -1; k++) {
      const candidate = newLines[j + k];
      if (candidate !== undefined && oldLine === candidate) {
        foundNew = k;
      }
    }
    
    if (foundNew !== -1 && (foundOld === -1 || foundNew <= foundOld)) {
      for (let k = 0; k < foundNew; k++) {
        const line = newLines[j];
        if (line !== undefined) {
          changes.push({ type: 'add', line });
        }
        j++;
      }
    } else if (foundOld !== -1) {
      for (let k = 0; k < foundOld; k++) {
        const line = oldLines[i];
        if (line !== undefined) {
          changes.push({ type: 'remove', line });
        }
        i++;
      }
    } else {
      changes.push({ type: 'remove', line: oldLine });
      i++;
      changes.push({ type: 'add', line: newLine });
      j++;
    }
  }
  
  // Generate hunk
  if (changes.length > 0) {
    const adds = changes.filter(c => c.type === 'add').length;
    const removes = changes.filter(c => c.type === 'remove').length;
    const contexts = changes.filter(c => c.type === 'context').length;
    
    diffLines.push(`@@ -1,${removes + contexts} +1,${adds + contexts} @@`);
    
    for (const change of changes) {
      const prefix = change.type === 'add' ? '+' : change.type === 'remove' ? '-' : ' ';
      diffLines.push(`${prefix}${change.line}`);
    }
  }
  
  return diffLines.join('\n');
}
