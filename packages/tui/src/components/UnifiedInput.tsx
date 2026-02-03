/**
 * UnifiedInput Component
 *
 * A single input component used on both the splash screen and chat view.
 * Integrates: input field, inline command palette, task strip, and status bar
 * — all within one bordered box.
 */

import React, { useState, useMemo, useEffect } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import { CommandPaletteInline, getCommandResultCount, getCommandAtIndex } from './CommandPalette';
import { FileMentionPalette, getFileResultCount, getFileAtIndex } from './FileMentionPalette';
import type { Command } from '../commands/registry';
import type { TokenUsage } from '@stratuscode/shared';
import type { TodoItem } from '../hooks/useTodos';
import { colors, getAgentColor, getStatusColor } from '../theme/colors';
import { icons, getStatusIcon } from '../theme/icons';

const CODE_COLOR = '#8642EC';

// ============================================
// Types
// ============================================

export interface UnifiedInputProps {
  onSubmit: (text: string) => void;
  onCommand?: (command: Command) => void;
  placeholder?: string;
  disabled?: boolean;
  // Status bar options
  showStatus?: boolean;
  agent?: string;
  model?: string;
  tokens?: TokenUsage;
  sessionTokens?: TokenUsage;
  contextUsage?: { used: number; limit: number; percent: number };
  showTelemetryDetails?: boolean;
  isLoading?: boolean;
  // Tasks
  todos?: TodoItem[];
  /** Ref to expose toggle function for /todos command */
  onToggleTasks?: React.MutableRefObject<(() => void) | null>;
  /** Project directory for @ file mentions */
  projectDir?: string;
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
  sessionTokens,
  contextUsage,
  showTelemetryDetails = false,
  isLoading = false,
  todos = [],
  onToggleTasks,
  projectDir,
}: UnifiedInputProps) {
  const { stdout } = useStdout();
  const [value, setValue] = useState('');
  const [cursorPos, setCursorPos] = useState(0);
  const [showCommandMenu, setShowCommandMenu] = useState(false);
  const [commandSelectedIndex, setCommandSelectedIndex] = useState(0);
  const [showFileMention, setShowFileMention] = useState(false);
  const [fileSelectedIndex, setFileSelectedIndex] = useState(0);
  const [tasksExpanded, setTasksExpanded] = useState(false);

  const isSlashCommand = value.startsWith('/');
  const commandQuery = isSlashCommand ? value.slice(1) : '';
  const isDisabled = disabled || isLoading;

  // Extract @ mention query: text after the last '@' in the value
  const atIndex = value.lastIndexOf('@');
  const fileMentionQuery = showFileMention && atIndex >= 0 ? value.slice(atIndex + 1) : '';

  // Expose toggle function for /todos command
  useEffect(() => {
    if (onToggleTasks) {
      onToggleTasks.current = () => setTasksExpanded(prev => !prev);
      return () => { onToggleTasks.current = null; };
    }
  }, [onToggleTasks]);

  const defaultPlaceholder = showStatus
    ? (isLoading ? 'Processing...' : 'Type a message... (/ for commands)')
    : 'What would you like to build?';

  // Compute divider width dynamically
  const terminalWidth = stdout?.columns ?? 80;
  const effectiveWidth = Math.min(terminalWidth, 100);
  const dividerWidth = Math.max(10, effectiveWidth - 10);
  const wideLayout = effectiveWidth >= 60;

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

  const totalTokens = sessionTokens ?? tokens;
  const ctxPercent = contextUsage ? contextUsage.percent : undefined;

  // Helper: insert text at cursor position
  const insertAt = (prev: string, pos: number, text: string): string =>
    prev.slice(0, pos) + text + prev.slice(pos);

  // Helper: delete char before cursor
  const deleteAt = (prev: string, pos: number): string =>
    pos > 0 ? prev.slice(0, pos - 1) + prev.slice(pos) : prev;

  useInput((input, key) => {
    // Ctrl+T to toggle tasks — always available, even during loading
    if (input === 't' && key.ctrl && hasTodos) {
      setTasksExpanded(prev => !prev);
      return;
    }

    // Block text input and command submission when disabled (loading)
    if (isDisabled) return;

    // Left/right arrow keys — cursor movement (always available when not in palette/mention)
    if (key.leftArrow && !showCommandMenu && !showFileMention) {
      setCursorPos(p => Math.max(0, p - 1));
      return;
    }
    if (key.rightArrow && !showCommandMenu && !showFileMention) {
      setCursorPos(p => Math.min(value.length, p + 1));
      return;
    }

    // Ctrl+A — move to start
    if (input === 'a' && key.ctrl) {
      setCursorPos(0);
      return;
    }
    // Ctrl+E — move to end
    if (input === 'e' && key.ctrl) {
      setCursorPos(value.length);
      return;
    }

    // Ctrl+U — clear entire input
    if (input === 'u' && key.ctrl) {
      setValue('');
      setCursorPos(0);
      setShowCommandMenu(false);
      setShowFileMention(false);
      setFileSelectedIndex(0);
      setCommandSelectedIndex(0);
      return;
    }

    // Ctrl+W — delete last word
    if (input === 'w' && key.ctrl) {
      setValue(prev => {
        const before = prev.slice(0, cursorPos);
        const after = prev.slice(cursorPos);
        const trimmed = before.trimEnd();
        const lastSpace = trimmed.lastIndexOf(' ');
        const newBefore = lastSpace >= 0 ? trimmed.slice(0, lastSpace + 1) : '';
        const newVal = newBefore + after;
        setCursorPos(newBefore.length);
        setShowCommandMenu(newVal.startsWith('/'));
        if (!newVal.includes('@')) setShowFileMention(false);
        return newVal;
      });
      return;
    }

    // File mention navigation
    if (showFileMention && projectDir) {
      if (key.escape) {
        setShowFileMention(false);
        return;
      }
      if (key.upArrow) {
        setFileSelectedIndex(i => Math.max(0, i - 1));
        return;
      }
      if (key.downArrow) {
        const max = getFileResultCount(projectDir, fileMentionQuery) - 1;
        setFileSelectedIndex(i => Math.min(Math.max(0, max), i + 1));
        return;
      }
      if (key.tab || key.return) {
        const filePath = getFileAtIndex(projectDir, fileMentionQuery, fileSelectedIndex);
        if (filePath) {
          const before = value.slice(0, atIndex);
          const newVal = before + '@' + filePath + ' ';
          setValue(newVal);
          setCursorPos(newVal.length);
          setShowFileMention(false);
          setFileSelectedIndex(0);
        }
        return;
      }
      if (key.backspace || key.delete) {
        setValue(prev => {
          const newVal = deleteAt(prev, cursorPos);
          setCursorPos(p => Math.max(0, p - 1));
          if (newVal.lastIndexOf('@') < 0) {
            setShowFileMention(false);
          }
          setFileSelectedIndex(0);
          return newVal;
        });
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setValue(prev => {
          const newVal = insertAt(prev, cursorPos, input);
          setCursorPos(p => p + input.length);
          return newVal;
        });
        setFileSelectedIndex(0);
        return;
      }
      return;
    }

    // Command palette navigation
    if (showCommandMenu && isSlashCommand) {
      if (key.escape) {
        setShowCommandMenu(false);
        setValue('');
        setCursorPos(0);
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
      const num = parseInt(input, 10);
      if (num >= 1 && num <= 9) {
        const cmd = getCommandAtIndex(commandQuery, num - 1);
        if (cmd) handleCommandSelect(cmd);
        return;
      }
      if (key.backspace || key.delete) {
        setValue(prev => {
          const newVal = deleteAt(prev, cursorPos);
          setCursorPos(p => Math.max(0, p - 1));
          if (!newVal.startsWith('/')) {
            setShowCommandMenu(false);
          }
          setCommandSelectedIndex(0);
          return newVal;
        });
        return;
      }
      if (input && !key.ctrl && !key.meta && !key.return) {
        setValue(prev => {
          const newVal = insertAt(prev, cursorPos, input);
          setCursorPos(p => p + input.length);
          return newVal;
        });
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
        setCursorPos(0);
        setShowCommandMenu(false);
        setShowFileMention(false);
      }
      return;
    }

    if (key.backspace || key.delete) {
      setValue(prev => {
        const newVal = deleteAt(prev, cursorPos);
        setCursorPos(p => Math.max(0, p - 1));
        setShowCommandMenu(newVal.startsWith('/'));
        if (!newVal.includes('@')) {
          setShowFileMention(false);
        }
        return newVal;
      });
      return;
    }

    if (input && !key.ctrl && !key.meta) {
      setValue(prev => {
        const newVal = insertAt(prev, cursorPos, input);
        setCursorPos(p => p + input.length);
        if (newVal === '/' || newVal.startsWith('/')) {
          setShowCommandMenu(true);
          setCommandSelectedIndex(0);
        }
        if (input === '@' && projectDir && !newVal.startsWith('/')) {
          setShowFileMention(true);
          setFileSelectedIndex(0);
        }
        return newVal;
      });
    }
  });

  // Handle command selection from inline palette
  const handleCommandSelect = (cmd: Command) => {
    if (onCommand) {
      // Extract args from the typed text (e.g., "/search my query" → args = ["my query"])
      const inputText = value.slice(1); // Remove leading /
      const cmdName = cmd.name;
      const argText = inputText.startsWith(cmdName)
        ? inputText.slice(cmdName.length).trim()
        : '';
      const enrichedCmd = argText
        ? { ...cmd, args: [argText] }
        : cmd;
      onCommand(enrichedCmd);
    }
    setValue('');
    setCursorPos(0);
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

        {/* File mention palette (when @ is typed) */}
        {showFileMention && projectDir && !showCommandMenu && (
          <>
            <FileMentionPalette
              query={fileMentionQuery}
              selectedIndex={fileSelectedIndex}
              projectDir={projectDir}
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
            <>
              <Text wrap="wrap" color={isSlashCommand ? colors.secondary : colors.text}>
                {value.slice(0, cursorPos)}
              </Text>
              {!isDisabled && (
                cursorPos < value.length ? (
                  // Cursor on a character — show it with inverse video
                  <Text inverse color={isSlashCommand ? colors.secondary : colors.text}>
                    {value[cursorPos]}
                  </Text>
                ) : (
                  // Cursor at end — show block cursor
                  <Text color={colors.primary}>▎</Text>
                )
              )}
              <Text wrap="wrap" color={isSlashCommand ? colors.secondary : colors.text}>
                {value.slice(cursorPos + (isDisabled ? 0 : cursorPos < value.length ? 1 : 0))}
              </Text>
            </>
          ) : (
            <>
              {!isDisabled && <Text color={colors.primary}>▎</Text>}
              <Text color={colors.textDim}>{placeholder || defaultPlaceholder}</Text>
            </>
          )}
        </Box>

        {/* Status bar (optional) */}
        {showStatus && (
          <>
            <Box paddingX={1}>
              <Text color={colors.border}>{'─'.repeat(dividerWidth)}</Text>
            </Box>
            <Box paddingX={1} paddingBottom={1} flexDirection={wideLayout ? 'row' : 'column'} justifyContent={wideLayout ? 'space-between' : 'flex-start'} alignItems={wideLayout ? 'center' : 'flex-start'} gap={1}>
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
              <Box flexDirection={showTelemetryDetails ? 'column' : 'row'} flexWrap="wrap" gap={1} marginTop={wideLayout ? 0 : 1}>
                <Text color={colors.secondary}>IN {formatNumber(totalTokens.input)}</Text>
                <Text color={colors.secondary}>OUT {formatNumber(totalTokens.output)}</Text>
                {ctxPercent !== undefined && (
                  <Text color={ctxPercent > 90 ? colors.error : colors.textDim}>CTX {ctxPercent}%</Text>
                )}
                {contextUsage && showTelemetryDetails && (
                  <Text color={colors.textDim}>
                    {formatNumber(contextUsage.used)}/{formatNumber(contextUsage.limit)} tokens used
                  </Text>
                )}
                {showTelemetryDetails && (
                  <Text color={colors.textDim}>Model {model || 'default'}</Text>
                )}
              </Box>
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
}
