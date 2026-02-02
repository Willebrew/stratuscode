/**
 * Todo Sidebar Component
 *
 * Displays the current plan's todo list in the sidebar.
 */

import React from 'react';
import { Box, Text } from 'ink';
import { colors, getStatusColor, getPriorityColor } from '../theme/colors';
import { icons, getStatusIcon, getPriorityIcon } from '../theme/icons';

// ============================================
// Types
// ============================================

export interface TodoItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority?: 'low' | 'medium' | 'high';
}

export interface TodoSidebarProps {
  todos: TodoItem[];
  title?: string;
  showCounts?: boolean;
  maxVisible?: number;
}

// ============================================
// Component
// ============================================

export const TodoSidebar = React.memo(function TodoSidebar({
  todos,
  title = 'Plan',
  showCounts = true,
  maxVisible = 10
}: TodoSidebarProps) {
  const pending = todos.filter(t => t.status === 'pending').length;
  const inProgress = todos.filter(t => t.status === 'in_progress').length;
  const completed = todos.filter(t => t.status === 'completed').length;
  
  const visibleTodos = todos.slice(0, maxVisible);
  const hiddenCount = todos.length - visibleTodos.length;

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={colors.border}
      paddingX={1}
      width={40}
    >
      {/* Header */}
      <Box justifyContent="space-between" marginBottom={1}>
        <Text color={colors.text} bold>{title}</Text>
        {showCounts && todos.length > 0 && (
          <Box>
            <Text color={colors.completed}>{completed}</Text>
            <Text color={colors.textDim}>/</Text>
            <Text color={colors.text}>{todos.length}</Text>
          </Box>
        )}
      </Box>

      {/* Progress bar */}
      {todos.length > 0 && (
        <Box marginBottom={1}>
          <ProgressBar 
            completed={completed} 
            inProgress={inProgress} 
            total={todos.length} 
          />
        </Box>
      )}

      {/* Todo list */}
      {todos.length === 0 ? (
        <Text color={colors.textDim}>No tasks yet</Text>
      ) : (
        <Box flexDirection="column">
          {visibleTodos.map((todo, index) => (
            <TodoRow key={todo.id} todo={todo} />
          ))}
          {hiddenCount > 0 && (
            <Text color={colors.textDim}>+{hiddenCount} more...</Text>
          )}
        </Box>
      )}

      {/* Status counts */}
      {showCounts && todos.length > 0 && (
        <Box marginTop={1} justifyContent="space-between">
          <Text color={colors.pending}>
            {icons.pending} {pending}
          </Text>
          <Text color={colors.inProgress}>
            {icons.inProgress} {inProgress}
          </Text>
          <Text color={colors.completed}>
            {icons.completed} {completed}
          </Text>
        </Box>
      )}
    </Box>
  );
});

// ============================================
// Sub-components
// ============================================

const TodoRow = React.memo(function TodoRow({ todo }: { todo: TodoItem }) {
  const statusIcon = getStatusIcon(todo.status);
  const statusColor = getStatusColor(todo.status);
  const priorityIcon = todo.priority ? getPriorityIcon(todo.priority) : '';
  const priorityColor = todo.priority ? getPriorityColor(todo.priority) : colors.textMuted;

  // Truncate long content
  const maxLength = 30;
  const content = todo.content.length > maxLength 
    ? todo.content.slice(0, maxLength - 3) + '...'
    : todo.content;

  return (
    <Box>
      <Text color={statusColor}>{statusIcon} </Text>
      <Text 
        color={todo.status === 'completed' ? colors.textDim : colors.text}
        strikethrough={todo.status === 'completed'}
      >
        {content}
      </Text>
      {todo.priority === 'high' && (
        <Text color={priorityColor}> {priorityIcon}</Text>
      )}
    </Box>
  );
});

function ProgressBar({ completed, inProgress, total }: { completed: number; inProgress: number; total: number }) {
  const width = 20;
  const completedWidth = Math.round((completed / total) * width);
  const inProgressWidth = Math.round((inProgress / total) * width);
  const pendingWidth = width - completedWidth - inProgressWidth;

  return (
    <Box>
      <Text color={colors.completed}>
        {icons.progressFull.repeat(completedWidth)}
      </Text>
      <Text color={colors.inProgress}>
        {icons.progressHalf.repeat(inProgressWidth)}
      </Text>
      <Text color={colors.textDim}>
        {icons.progressEmpty.repeat(Math.max(0, pendingWidth))}
      </Text>
    </Box>
  );
}

// ============================================
// Compact variant
// ============================================

export function TodoCompact({ todos }: { todos: TodoItem[] }) {
  const pending = todos.filter(t => t.status === 'pending').length;
  const inProgress = todos.filter(t => t.status === 'in_progress').length;
  const completed = todos.filter(t => t.status === 'completed').length;

  return (
    <Box>
      <Text color={colors.textMuted}>Tasks: </Text>
      <Text color={colors.completed}>{icons.completed}{completed}</Text>
      <Text color={colors.textDim}> {icons.dot} </Text>
      <Text color={colors.inProgress}>{icons.inProgress}{inProgress}</Text>
      <Text color={colors.textDim}> {icons.dot} </Text>
      <Text color={colors.pending}>{icons.pending}{pending}</Text>
    </Box>
  );
}
