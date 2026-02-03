/**
 * Chat Component (Timeline-based)
 *
 * Renders a chronological feed of timeline events.
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { TimelineEvent, ToolCall } from '@stratuscode/shared';
import { Message } from './Message';
import { ToolCallDisplay } from './ToolCall';
import { QuestionDialog, type Question } from './QuestionDialog';
import { ReasoningBlock } from './ReasoningBlock';
import { MarkdownText } from './MarkdownText';
import { colors } from '../theme/colors';
import type { Command } from '../commands/registry';

export interface ChatProps {
  timelineEvents: TimelineEvent[];
  isLoading: boolean;
  error: string | null;
  gutter?: number;
  compactView?: boolean;
  pendingQuestion?: Question;
  onSubmit: (text: string) => void;
  onCommand?: (command: Command) => void;
  onQuestionAnswer?: (answers: string[]) => void;
  onQuestionSkip?: () => void;
}

export const Chat = React.memo(function Chat({
  timelineEvents,
  isLoading,
  error,
  gutter = 0,
  compactView = false,
  pendingQuestion,
  onQuestionAnswer,
  onQuestionSkip,
}: ChatProps) {
  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1} paddingLeft={gutter + 1}>
      {timelineEvents.map((event) => {
        switch (event.kind) {
          case 'user':
          case 'assistant':
            return (
              <Message
                key={event.id}
                message={{
                  role: event.kind === 'user' ? 'user' : 'assistant',
                  content: event.content,
                }}
              />
            );
          case 'reasoning':
            if (compactView) return null;
            return (
              <ReasoningBlock
                key={event.id}
                reasoning={event.content}
                isStreaming={!!event.streaming}
                defaultExpanded={false}
              />
            );
          case 'tool_call': {
            const tool: ToolCall = {
              id: event.toolCallId || event.id,
              type: 'function',
              function: { name: event.toolName || 'tool', arguments: '{}' },
              status: event.status || 'running',
            };
            return (
              <Box key={event.id} marginY={0}>
                <ToolCallDisplay toolCall={tool} />
              </Box>
            );
          }
          case 'tool_result':
            return (
              <Box key={event.id} marginLeft={2} marginY={0}>
                <Text color={colors.textDim}>Result: </Text>
                <MarkdownText content={event.content} />
              </Box>
            );
          case 'status':
          default:
            return (
              <Box key={event.id} marginY={0}>
                <Text color={colors.textDim}>{event.content}</Text>
              </Box>
            );
        }
      })}

      {/* Error display */}
      {error && (
        <Box marginY={1}>
          <Text color={colors.error}>Error: {error}</Text>
        </Box>
      )}

      {/* Pending question dialog */}
      {pendingQuestion && onQuestionAnswer && onQuestionSkip && (
        <Box marginY={1}>
          <QuestionDialog
            question={pendingQuestion}
            onAnswer={onQuestionAnswer}
            onSkip={onQuestionSkip}
          />
        </Box>
      )}

      {/* Loading hint */}
      {isLoading && (
        <Box marginY={1}>
          <Text color={colors.textDim}>Streaming...</Text>
        </Box>
      )}
    </Box>
  );
});
