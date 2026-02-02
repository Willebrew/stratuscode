/**
 * Diff View Component
 *
 * Displays unified diffs with syntax highlighting.
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { colors } from '../theme/colors';
import { icons } from '../theme/icons';

// ============================================
// Types
// ============================================

export interface DiffViewProps {
  diff: string;
  filePath?: string;
  collapsed?: boolean;
  onToggle?: () => void;
}

interface DiffLine {
  type: 'header' | 'add' | 'remove' | 'context' | 'info';
  content: string;
  lineNumber?: number;
}

// ============================================
// Component
// ============================================

export function DiffView({ diff, filePath, collapsed = false, onToggle }: DiffViewProps) {
  const [isCollapsed, setIsCollapsed] = useState(collapsed);
  const lines = parseDiff(diff);

  // Count additions and deletions
  const additions = lines.filter(l => l.type === 'add').length;
  const deletions = lines.filter(l => l.type === 'remove').length;

  useInput((input) => {
    if (input === 'c' || input === ' ') {
      setIsCollapsed(prev => !prev);
      onToggle?.();
    }
  });

  return (
    <Box flexDirection="column" borderStyle="single" borderColor={colors.border}>
      {/* Header */}
      <Box paddingX={1} justifyContent="space-between">
        <Box>
          <Text color={colors.secondary}>{icons.file} </Text>
          <Text bold color={colors.text}>{filePath || 'Diff'}</Text>
        </Box>
        <Box>
          <Text color={colors.success}>+{additions}</Text>
          <Text> </Text>
          <Text color={colors.error}>-{deletions}</Text>
          <Text color={colors.textDim}> (c to toggle)</Text>
        </Box>
      </Box>

      {/* Diff content */}
      {!isCollapsed && (
        <Box flexDirection="column" paddingX={1} paddingY={0}>
          {lines.slice(0, 50).map((line, index) => (
            <DiffLine key={index} line={line} />
          ))}
          {lines.length > 50 && (
            <Text dimColor>... {lines.length - 50} more lines</Text>
          )}
        </Box>
      )}
    </Box>
  );
}

/**
 * Single diff line
 */
function DiffLine({ line }: { line: DiffLine }) {
  switch (line.type) {
    case 'header':
      return <Text bold color={colors.secondary}>{line.content}</Text>;
    case 'add':
      return <Text color={colors.success}>{line.content}</Text>;
    case 'remove':
      return <Text color={colors.error}>{line.content}</Text>;
    case 'info':
      return <Text color={colors.info}>{line.content}</Text>;
    case 'context':
    default:
      return <Text color={colors.textMuted}>{line.content}</Text>;
  }
}

/**
 * Parse a unified diff into lines
 */
function parseDiff(diff: string): DiffLine[] {
  const lines: DiffLine[] = [];

  for (const line of diff.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) {
      lines.push({ type: 'header', content: line });
    } else if (line.startsWith('@@')) {
      lines.push({ type: 'info', content: line });
    } else if (line.startsWith('+')) {
      lines.push({ type: 'add', content: line });
    } else if (line.startsWith('-')) {
      lines.push({ type: 'remove', content: line });
    } else {
      lines.push({ type: 'context', content: line });
    }
  }

  return lines;
}

/**
 * Generate a simple diff between two strings
 */
export function generateSimpleDiff(
  oldContent: string,
  newContent: string,
  filePath?: string
): string {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');

  const diffLines: string[] = [];

  if (filePath) {
    diffLines.push(`--- a/${filePath}`);
    diffLines.push(`+++ b/${filePath}`);
  }

  // Simple line-by-line diff (not optimal but functional)
  const maxLines = Math.max(oldLines.length, newLines.length);

  for (let i = 0; i < maxLines; i++) {
    const oldLine = oldLines[i];
    const newLine = newLines[i];

    if (oldLine === newLine) {
      if (oldLine !== undefined) {
        diffLines.push(` ${oldLine}`);
      }
    } else {
      if (oldLine !== undefined) {
        diffLines.push(`-${oldLine}`);
      }
      if (newLine !== undefined) {
        diffLines.push(`+${newLine}`);
      }
    }
  }

  return diffLines.join('\n');
}
