/**
 * UnifiedInput Component
 *
 * A single input component used on both the splash screen and chat view.
 * Integrates: input field, inline command palette, task strip, and status bar
 * — all within one bordered box.
 */

import React, { useState, useMemo } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import { CommandPaletteInline, getCommandResultCount, getCommandAtIndex } from './CommandPalette';
import type { Command } from '../commands/registry';
import { colors, getAgentColor, getStatusColor } from '../theme/colors';
import { icons, getStatusIcon } from '../theme/icons';

const CODE_COLOR = '#8642EC';

// ============================================
// Types
// ============================================

export interface TodoItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority: 'low' | 'medium' | 'high';
}

export interface UnifiedInputProps {
  onSubmit: (text: string) => void;
  onCommand?: (command: Command) => void;
  placeholder?: string;
  disabled?: boolean;
  // Status bar options
  showStatus?: boolean;
  agent?: string;
  model?: string;
  tokens?: { input: number; output: number };
  isLoading?: boolean;
  // Tasks
  todos?: TodoItem[];
}

// ============================================
// Helpers
// ============================================

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + '…';
}

// ============================================
// Component
// ============================================

export function UnifiedInput({
  onSubmit,
  onCommand,
  placeholder,
  disabled = false,
  showStatus = false,
  agent = 'build',
  model = '',
  tokens = { input: 0, output: 0 },
  isLoading = false,
  todos = [],
}: UnifiedInputProps) {
  const { stdout } = useStdout();
  const [value, setValue] = useState('');
  const [showCommandMenu, setShowCommandMenu] = useState(false);
  const [commandSelectedIndex, setCommandSelectedIndex] = useState(0);
  const [tasksExpanded, setTasksExpanded] = useState(false);

  const isSlashCommand = value.startsWith('/');
  const commandQuery = isSlashCommand ? value.slice(1) : '';
  const isDisabled = disabled || isLoading;

  const defaultPlaceholder = showStatus
    ? (isLoading ? 'Processing...' : 'Type a message... (/ for commands)')
    : 'What would you like to build?';

  // Compute divider width dynamically
  const terminalWidth = stdout?.columns ?? 80;
  const effectiveWidth = Math.min(terminalWidth, 100);
  const dividerWidth = Math.max(10, effectiveWidth - 10);

  // Task counts
  const completedCount = useMemo(() => todos.filter(t => t.status === 'completed').length, [todos]);
  const hasTodos = todos.length > 0;

  // Collapsed task items — fit on one line
  const collapsedTasks = useMemo(() => {
    if (!hasTodos) return { visible: [], hidden: 0 };
    // Rough estimate: each task takes ~25 chars
    const maxTasks = Math.max(1, Math.floor((dividerWidth - 20) / 25));
    const visible = todos.slice(0, maxTasks);
    const hidden = todos.length - visible.length;
    return { visible, hidden };
  }, [todos, dividerWidth, hasTodos]);

  useInput((input, key) => {
    if (isDisabled) return;

    // Ctrl+T to toggle tasks
    if (input === 't' && key.ctrl && hasTodos) {
      setTasksExpanded(prev => !prev);
      return;
    }

    // Command palette navigation
    if (showCommandMenu && isSlashCommand) {
      if (key.escape) {
        setShowCommandMenu(false);
        setValue('');
        return;
      }
      if (key.upArrow) {
        setCommandSelectedIndex(i => Math.max(0, i - 1));
        return;
      }
      if (key.downArrow) {
        const max = getCommandResultCount(commandQuery) - 1;
        setCommandSelectedIndex(i => Math.min(max, i + 1));
        return;
      }
      if (key.return) {
        const cmd = getCommandAtIndex(commandQuery, commandSelectedIndex);
        if (cmd) handleCommandSelect(cmd);
        return;
      }
      // Number keys for quick select (1-9)
      const num = parseInt(input, 10);
      if (num >= 1 && num <= 9) {
        const cmd = getCommandAtIndex(commandQuery, num - 1);
        if (cmd) handleCommandSelect(cmd);
        return;
      }
      // Allow typing to filter — fall through to character handling
      if (key.backspace || key.delete) {
        setValue(prev => {
          const newVal = prev.slice(0, -1);
          if (!newVal.startsWith('/')) {
            setShowCommandMenu(false);
          }
          setCommandSelectedIndex(0);
          return newVal;
        });
        return;
      }
      if (input && !key.ctrl && !key.meta && !key.return) {
        setValue(prev => prev + input);
        setCommandSelectedIndex(0);
        return;
      }
      return;
    }

    if (key.return) {
      if (value === '/') return;
      if (value.trim() && !isSlashCommand) {
        onSubmit(value);
        setValue('');
        setShowCommandMenu(false);
      }
      return;
    }

    if (key.backspace || key.delete) {
      setValue(prev => {
        const newVal = prev.slice(0, -1);
        setShowCommandMenu(newVal.startsWith('/'));
        return newVal;
      });
      return;
    }

    if (input && !key.ctrl && !key.meta) {
      setValue(prev => {
        const newVal = prev + input;
        if (newVal === '/' || newVal.startsWith('/')) {
          setShowCommandMenu(true);
          setCommandSelectedIndex(0);
        }
        return newVal;
      });
    }
  });

  // Handle command selection from inline palette
  const handleCommandSelect = (cmd: Command) => {
    if (onCommand) onCommand(cmd);
    setValue('');
    setShowCommandMenu(false);
    setCommandSelectedIndex(0);
  };

  return (
    <Box flexDirection="column">
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={colors.primary}
      >
        {/* Inline command palette (when / is typed) */}
        {showCommandMenu && isSlashCommand && (
          <>
            <CommandPaletteInline
              query={commandQuery}
              selectedIndex={commandSelectedIndex}
              onSelect={handleCommandSelect}
            />
            <Box paddingX={1}>
              <Text color={colors.border}>{'─'.repeat(dividerWidth)}</Text>
            </Box>
          </>
        )}

        {/* Task strip (collapsed or expanded) */}
        {hasTodos && showStatus && !showCommandMenu && (
          <>
            {tasksExpanded ? (
              /* Expanded: full task list */
              <Box flexDirection="column" paddingX={1} paddingY={0}>
                <Box>
                  <Text color={colors.text} bold>Tasks </Text>
                  <Text color={colors.completed}>{completedCount}</Text>
                  <Text color={colors.textDim}>/{todos.length}</Text>
                  <Text color={colors.textDim}> (Ctrl+T to collapse)</Text>
                </Box>
                {todos.map(todo => (
                  <Box key={todo.id}>
                    <Text color={getStatusColor(todo.status)}>
                      {getStatusIcon(todo.status)}{' '}
                    </Text>
                    <Text
                      color={todo.status === 'completed' ? colors.textDim : colors.text}
                      strikethrough={todo.status === 'completed'}
                    >
                      {todo.content}
                    </Text>
                  </Box>
                ))}
              </Box>
            ) : (
              /* Collapsed: single line summary */
              <Box paddingX={1} paddingY={0}>
                <Text color={colors.text} bold>Tasks </Text>
                <Text color={colors.completed}>{completedCount}</Text>
                <Text color={colors.textDim}>/{todos.length} </Text>
                <Text color={colors.textDim}>{icons.pipe} </Text>
                {collapsedTasks.visible.map(todo => (
                  <Text key={todo.id}>
                    <Text color={getStatusColor(todo.status)}>
                      {getStatusIcon(todo.status)}{' '}
                    </Text>
                    <Text color={todo.status === 'completed' ? colors.textDim : colors.text}>
                      {truncate(todo.content, 20)}
                    </Text>
                    <Text color={colors.textDim}>{'  '}</Text>
                  </Text>
                ))}
                {collapsedTasks.hidden > 0 && (
                  <Text color={colors.textDim}>+{collapsedTasks.hidden} more</Text>
                )}
              </Box>
            )}
            <Box paddingX={1}>
              <Text color={colors.border}>{'─'.repeat(dividerWidth)}</Text>
            </Box>
          </>
        )}

        {/* Input row */}
        <Box paddingX={1} paddingY={0}>
          <Text color={colors.primary} bold>{'› '}</Text>
          {value ? (
            <Text wrap="wrap" color={isSlashCommand ? colors.secondary : colors.text}>{value}</Text>
          ) : (
            <Text color={colors.textDim}>{placeholder || defaultPlaceholder}</Text>
          )}
          {!isDisabled && <Text color={colors.primary}>▎</Text>}
        </Box>

        {/* Status bar (optional) */}
        {showStatus && (
          <>
            <Box paddingX={1}>
              <Text color={colors.border}>{'─'.repeat(dividerWidth)}</Text>
            </Box>
            <Box paddingX={1} justifyContent="space-between">
              <Box>
                <Text color="white" bold>Stratus</Text>
                <Text color={CODE_COLOR} bold>Code</Text>
                <Text color={colors.textDim}> • </Text>
                <Text color={getAgentColor(agent)} bold>{agent.toUpperCase()}</Text>
                {model && (
                  <>
                    <Text color={colors.textDim}> • </Text>
                    <Text color={colors.textMuted}>{model}</Text>
                  </>
                )}
                {isLoading && (
                  <>
                    <Text color={colors.textDim}> • </Text>
                    <Text color={colors.secondary}>Working...</Text>
                  </>
                )}
              </Box>
              <Box>
                <Text color={colors.textDim}>Tokens </Text>
                <Text color={colors.text}>{formatNumber(tokens.input)}</Text>
                <Text color={colors.textDim}> in / </Text>
                <Text color={colors.text}>{formatNumber(tokens.output)}</Text>
                <Text color={colors.textDim}> out</Text>
              </Box>
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
}
