/**
 * ToolCall Component
 *
 * Renders a tool call as a flat single-line display with icon, name, args, and status.
 * No expand/collapse — tools are compact inline indicators.
 * Errors are shown as a second line below the tool line.
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { ToolCall } from '@stratuscode/shared';
import { colors } from '../theme/colors';
import { icons } from '../theme/icons';

// ============================================
// Tool Icons (ASCII - no emojis)
// ============================================

const TOOL_ICONS: Record<string, string> = {
  read: icons.file,
  write: icons.file,
  edit: icons.edit,
  multi_edit: icons.edit,
  bash: icons.terminal,
  grep: icons.search,
  glob: icons.search,
  ls: icons.folder,
  task: icons.bullet,
  websearch: icons.search,
  webfetch: icons.search,
  apply_patch: icons.edit,
  question: '?',
  todoread: icons.check,
  todowrite: icons.check,
  codesearch: icons.search,
  lsp: icons.code,
  revert: '<-',
  skill: icons.code,
  batch: icons.folder,
};

function getToolIcon(name: string): string {
  return TOOL_ICONS[name] || '*';
}

// ============================================
// Status indicators
// ============================================

const STATUS_ICONS: Record<string, string> = {
  pending: '○',
  running: '◐',
  completed: '✓',
  failed: '✗',
};

const STATUS_COLORS: Record<string, string> = {
  pending: colors.textMuted,
  running: colors.warning,
  completed: colors.success,
  failed: colors.error,
};

// ============================================
// Helpers
// ============================================

function formatArgs(tc: ToolCall): string {
  try {
    const args = JSON.parse(tc.function.arguments);
    if (args.file_path) return args.file_path;
    if (args.command) return args.command.slice(0, 60) + (args.command.length > 60 ? '...' : '');
    if (args.query) return `"${args.query}"`;
    if (args.pattern) return args.pattern;
    if (args.directory_path) return args.directory_path;
    if (args.description) return args.description.slice(0, 60) + (args.description.length > 60 ? '...' : '');
    if (args.url) return args.url.slice(0, 50);
    return '';
  } catch {
    return '';
  }
}

function getErrorMessage(result: string | undefined): string | null {
  if (!result) return null;
  try {
    const parsed = JSON.parse(result);
    if (parsed.error) return parsed.message || 'Unknown error';
    return null;
  } catch {
    return null;
  }
}

// ============================================
// Component
// ============================================

export interface ToolCallDisplayProps {
  toolCall: ToolCall;
  isFocused?: boolean;
  defaultOpen?: boolean;
}

export const ToolCallDisplay = React.memo(function ToolCallDisplay({ toolCall }: ToolCallDisplayProps) {
  const icon = getToolIcon(toolCall.function.name);
  const subtitle = formatArgs(toolCall);
  const status = (toolCall.status || 'pending') as 'pending' | 'running' | 'completed' | 'failed';
  const statusIcon = STATUS_ICONS[status] || '○';
  const statusColor = STATUS_COLORS[status] || colors.textMuted;
  const errorMessage = status === 'failed' ? getErrorMessage(toolCall.result) : null;

  return (
    <Box flexDirection="column" marginLeft={2}>
      {/* Single-line tool display: status + icon + name + args */}
      <Box>
        <Box width={3}><Text color={statusColor}>{statusIcon}</Text></Box>
        <Box width={4}><Text color={colors.secondary}>{icon}</Text></Box>
        <Text color={colors.text} bold>{toolCall.function.name}</Text>
        {subtitle && (
          <Text color={colors.textMuted}> {subtitle}</Text>
        )}
        {status === 'running' && (
          <Text color={colors.warning}> ...</Text>
        )}
      </Box>

      {/* Error line (only when failed) */}
      {errorMessage && (
        <Box marginLeft={4}>
          <Text color={colors.error}>{errorMessage}</Text>
        </Box>
      )}
    </Box>
  );
});

// ============================================
// Tool Call List (for displaying multiple)
// ============================================

export interface ToolCallListProps {
  toolCalls: ToolCall[];
  focusedIndex?: number;
}

export function ToolCallList({ toolCalls, focusedIndex }: ToolCallListProps) {
  if (toolCalls.length === 0) return null;

  return (
    <Box flexDirection="column" marginY={1}>
      {toolCalls.map((tc) => (
        <ToolCallDisplay key={tc.id} toolCall={tc} />
      ))}
    </Box>
  );
}
