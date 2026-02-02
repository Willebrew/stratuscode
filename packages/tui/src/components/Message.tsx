/**
 * Message Component
 *
 * Renders a single chat message in Static (terminal scrollback).
 *
 * IMPORTANT: Tool calls and reasoning are NOT rendered here because they were
 * already displayed in real-time by the dynamic streaming section in Chat.tsx.
 * Ink's Static writes items into scrollback, but the dynamic section's output
 * also scrolls into scrollback as content grows. Rendering tool calls in both
 * places causes visible duplication.
 *
 * For assistant messages, we show:
 *   - A compact tool call summary line (e.g. "Used 5 tools")
 *   - The final text content
 * For user messages, we show the content as-is.
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { Message as MessageType } from '@stratuscode/shared';
import { MarkdownText } from './MarkdownText';
import { colors } from '../theme/colors';
import { icons } from '../theme/icons';

// ============================================
// Types
// ============================================

export interface MessageProps {
  message: MessageType;
}

// ============================================
// Component
// ============================================

// Purple color matching splash screen
const CODE_COLOR = '#8642EC';

export const Message = React.memo(function Message({ message }: MessageProps) {
  const isUser = message.role === 'user';
  const isTool = message.role === 'tool';

  if (isTool) {
    // Tool results are shown inline during streaming
    return null;
  }

  const content = typeof message.content === 'string'
    ? message.content
    : JSON.stringify(message.content);

  // For assistant messages with no text content (tool-only turns), show nothing
  // since the tool calls were already visible during the dynamic streaming phase.
  if (!isUser && !content.trim() && message.toolCalls && message.toolCalls.length > 0) {
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

      {/* Compact tool call summary (not the full list — that was shown during streaming) */}
      {!isUser && message.toolCalls && message.toolCalls.length > 0 && (
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
