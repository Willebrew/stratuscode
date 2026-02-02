/**
 * ToolCall Component
 *
 * Renders a tool call with a clean, readable layout.
 * Shows tool name with a left border accent, args below.
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { ToolCall } from '@stratuscode/shared';
import { colors } from '../theme/colors';

// ============================================
// Tool display names and colors
// ============================================

const TOOL_LABELS: Record<string, { label: string; color: string }> = {
  read:        { label: 'Read',        color: '#7fd88f' }, // green
  write:       { label: 'Write',       color: '#f5a742' }, // orange
  edit:        { label: 'Edit',        color: '#f5a742' },
  multi_edit:  { label: 'Multi Edit',  color: '#f5a742' },
  bash:        { label: 'Terminal',    color: '#56b6c2' }, // cyan
  grep:        { label: 'Search',      color: '#9d7cd8' }, // purple
  glob:        { label: 'Glob',        color: '#9d7cd8' },
  ls:          { label: 'List',        color: '#9d7cd8' },
  task:        { label: 'Task',        color: '#e5c07b' }, // yellow
  websearch:   { label: 'Web Search',  color: '#56b6c2' },
  webfetch:    { label: 'Fetch',       color: '#56b6c2' },
  apply_patch: { label: 'Patch',       color: '#f5a742' },
  question:    { label: 'Question',    color: '#e5c07b' },
  todoread:    { label: 'Todos',       color: '#e5c07b' },
  todowrite:   { label: 'Todos',       color: '#e5c07b' },
  codesearch:  { label: 'Code Search', color: '#9d7cd8' },
  lsp:         { label: 'LSP',         color: '#9d7cd8' },
  revert:      { label: 'Revert',      color: '#e06c75' }, // red
  skill:       { label: 'Skill',       color: '#56b6c2' },
  batch:       { label: 'Batch',       color: '#e5c07b' },
};

function getToolInfo(name: string): { label: string; color: string } {
  return TOOL_LABELS[name] || { label: name, color: colors.textMuted };
}

// ============================================
// Status
// ============================================

const STATUS_ICONS: Record<string, string> = {
  pending: '○',
  running: '●',
  completed: '●',
  failed: '✕',
};

// ============================================
// Helpers
// ============================================

function formatArgs(tc: ToolCall): string {
  try {
    const args = JSON.parse(tc.function.arguments);
    if (args.file_path) return args.file_path;
    if (args.command) {
      const cmd = args.command.replace(/\n/g, ' ');
      return cmd.length > 72 ? cmd.slice(0, 72) + '…' : cmd;
    }
    if (args.query) return `"${args.query}"`;
    if (args.pattern) return args.pattern;
    if (args.directory_path) return args.directory_path;
    if (args.description) {
      const d = args.description;
      return d.length > 72 ? d.slice(0, 72) + '…' : d;
    }
    if (args.url) return args.url.length > 60 ? args.url.slice(0, 60) + '…' : args.url;
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
  const info = getToolInfo(toolCall.function.name);
  const subtitle = formatArgs(toolCall);
  const status = (toolCall.status || 'pending') as 'pending' | 'running' | 'completed' | 'failed';
  const statusIcon = STATUS_ICONS[status] || '○';
  const errorMessage = status === 'failed' ? getErrorMessage(toolCall.result) : null;
  const isRunning = status === 'running';
  const isFailed = status === 'failed';

  return (
    <Box flexDirection="column" marginLeft={2} marginY={0}>
      {/* Tool line: colored dot + label + args */}
      <Box>
        <Text color={isFailed ? colors.error : info.color}>
          {statusIcon}
        </Text>
        <Text color={info.color} bold> {info.label}</Text>
        {subtitle && (
          <Text color={colors.textMuted}> {subtitle}</Text>
        )}
        {isRunning && (
          <Text color={colors.textMuted}> …</Text>
        )}
      </Box>

      {/* Error detail */}
      {errorMessage && (
        <Box marginLeft={2}>
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

export function ToolCallList({ toolCalls }: ToolCallListProps) {
  if (toolCalls.length === 0) return null;

  return (
    <Box flexDirection="column" marginY={1}>
      {toolCalls.map((tc) => (
        <ToolCallDisplay key={tc.id} toolCall={tc} />
      ))}
    </Box>
  );
}
