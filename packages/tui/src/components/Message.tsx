/**
 * Message Component
 *
 * Renders a single chat message. When showToolCalls is true (for history),
 * tool calls are rendered inline with each assistant message.
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { Message as MessageType } from '@stratuscode/shared';
import { ToolCallDisplay } from './ToolCall';
import { MarkdownText } from './MarkdownText';
import { colors } from '../theme/colors';
import { icons } from '../theme/icons';

// ============================================
// Types
// ============================================

export interface MessageProps {
  message: MessageType;
  /** Show full tool call details (for previous turns in history) */
  showToolCalls?: boolean;
}

// ============================================
// Component
// ============================================

const CODE_COLOR = '#8642EC';

export const Message = React.memo(function Message({ message, showToolCalls }: MessageProps) {
  const isUser = message.role === 'user';
  const isTool = message.role === 'tool';

  if (isTool) return null;

  const content = typeof message.content === 'string'
    ? message.content
    : JSON.stringify(message.content);

  // For assistant messages with no text and no tool calls to show, skip
  if (!isUser && !content.trim() && (!message.toolCalls || message.toolCalls.length === 0)) {
    return null;
  }

  // Tool-only turn with showToolCalls=false — show nothing (already shown live)
  if (!isUser && !content.trim() && message.toolCalls && message.toolCalls.length > 0 && !showToolCalls) {
    return null;
  }

  return (
    <Box flexDirection="column" marginY={1}>
      {/* Role indicator */}
      <Box marginBottom={0}>
        {isUser ? (
          <Text bold color={colors.primary}>{icons.chevronRight} You</Text>
        ) : (
          <>
            <Text bold color="white">{icons.chevronRight} Stratus</Text>
            <Text bold color={CODE_COLOR}>Code</Text>
          </>
        )}
      </Box>

      {/* Tool calls (full detail for history) */}
      {!isUser && showToolCalls && message.toolCalls && message.toolCalls.length > 0 && (
        <Box flexDirection="column">
          {message.toolCalls.map((tc) => (
            <ToolCallDisplay key={tc.id} toolCall={tc} />
          ))}
        </Box>
      )}

      {/* Compact tool summary (when not showing full details) */}
      {!isUser && !showToolCalls && message.toolCalls && message.toolCalls.length > 0 && (
        <Box marginLeft={2}>
          <Text color={colors.textDim}>
            {icons.check} Used {message.toolCalls.length} tool{message.toolCalls.length !== 1 ? 's' : ''}
          </Text>
        </Box>
      )}

      {/* Content */}
      {content.trim() && (
        <Box marginLeft={2}>
          {isUser ? (
            <Text wrap="wrap">{content}</Text>
          ) : (
            <MarkdownText content={content} />
          )}
        </Box>
      )}
    </Box>
  );
});
