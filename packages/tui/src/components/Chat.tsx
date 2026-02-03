/**
 * Chat Component (Timeline-based)
 *
 * Renders a chronological feed of timeline events with proper streaming support.
 * Shows reasoning blocks, tool calls with diffs, and assistant text as they arrive.
 */

import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import type { TimelineEvent, TimelineToolEvent, ToolCall } from '@stratuscode/shared';
import { ToolCallDisplay } from './ToolCall';
import { QuestionDialog, type Question } from './QuestionDialog';
import { ReasoningBlock } from './ReasoningBlock';
import { ThinkingIndicator } from './ThinkingIndicator';
import { MarkdownText } from './MarkdownText';
import { colors } from '../theme/colors';
import type { Command } from '../commands/registry';

const CODE_COLOR = '#8642EC';

// ============================================
// Types
// ============================================

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

// ============================================
// Helpers
// ============================================

/**
 * Build a ToolCall object from a tool_call event paired with its tool_result event.
 */
function buildToolCall(
  callEvent: TimelineToolEvent,
  resultEvent: TimelineToolEvent | undefined,
): ToolCall {
  return {
    id: callEvent.toolCallId,
    type: 'function',
    function: {
      name: callEvent.toolName || 'unknown',
      arguments: callEvent.content, // arguments JSON stored in content
    },
    status: resultEvent ? 'completed' : (callEvent.status || 'running'),
    result: resultEvent?.content,
  };
}

// ============================================
// Component
// ============================================

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
  // Index tool_result events by toolCallId for fast lookup
  const resultIndex = useMemo(() => {
    const index = new Map<string, TimelineToolEvent>();
    for (const event of timelineEvents) {
      if (event.kind === 'tool_result' && 'toolCallId' in event) {
        index.set(event.toolCallId, event as TimelineToolEvent);
      }
    }
    return index;
  }, [timelineEvents]);

  // Track whether we've shown the assistant header for the current turn
  let needsAssistantHeader = false;
  let lastRole: 'user' | 'assistant' = 'user';

  // Determine if the last reasoning event is the currently streaming one
  const lastReasoningId = useMemo(() => {
    for (let i = timelineEvents.length - 1; i >= 0; i--) {
      if (timelineEvents[i]!.kind === 'reasoning') return timelineEvents[i]!.id;
    }
    return null;
  }, [timelineEvents]);

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1} paddingLeft={gutter + 1}>
      {timelineEvents.map((event, idx) => {
        // Skip tool_result events — they're merged into their tool_call
        if (event.kind === 'tool_result') return null;

        // User message
        if (event.kind === 'user') {
          lastRole = 'user';
          needsAssistantHeader = true;
          return (
            <Box key={event.id} flexDirection="column" marginY={1}>
              <Box marginBottom={0}>
                <Text bold color={colors.primary}>{'\u203A'} You</Text>
              </Box>
              <Box marginLeft={2}>
                <Text wrap="wrap">{event.content}</Text>
              </Box>
            </Box>
          );
        }

        // For all non-user events, show the assistant header once per turn
        const showHeader = needsAssistantHeader;
        if (needsAssistantHeader) {
          needsAssistantHeader = false;
          lastRole = 'assistant';
        }

        // Reasoning block
        if (event.kind === 'reasoning') {
          return (
            <Box key={event.id} flexDirection="column">
              {showHeader && (
                <Box marginTop={1} marginBottom={0}>
                  <Text bold color="white">{'\u203A'} Stratus</Text>
                  <Text bold color={CODE_COLOR}>Code</Text>
                </Box>
              )}
              {!compactView && (
                <ReasoningBlock
                  reasoning={event.content}
                  isStreaming={!!event.streaming}
                  isActive={event.id === lastReasoningId && !event.streaming}
                  defaultExpanded={false}
                />
              )}
            </Box>
          );
        }

        // Tool call — pair with its result
        if (event.kind === 'tool_call' && 'toolCallId' in event) {
          const callEvent = event as TimelineToolEvent;
          const resultEvent = resultIndex.get(callEvent.toolCallId);
          const toolCall = buildToolCall(callEvent, resultEvent);

          return (
            <Box key={event.id} flexDirection="column">
              {showHeader && (
                <Box marginTop={1} marginBottom={0}>
                  <Text bold color="white">{'\u203A'} Stratus</Text>
                  <Text bold color={CODE_COLOR}>Code</Text>
                </Box>
              )}
              <ToolCallDisplay toolCall={toolCall} />
            </Box>
          );
        }

        // Assistant text
        if (event.kind === 'assistant') {
          return (
            <Box key={event.id} flexDirection="column">
              {showHeader && (
                <Box marginTop={1} marginBottom={0}>
                  <Text bold color="white">{'\u203A'} Stratus</Text>
                  <Text bold color={CODE_COLOR}>Code</Text>
                </Box>
              )}
              <Box marginLeft={2}>
                <MarkdownText content={event.content} />
                {event.streaming && <Text color={CODE_COLOR}>{'\u258C'}</Text>}
              </Box>
            </Box>
          );
        }

        // Status events (errors, etc.)
        if (event.kind === 'status') {
          return (
            <Box key={event.id} marginY={0}>
              <Text color={colors.textDim}>{event.content}</Text>
            </Box>
          );
        }

        return null;
      })}

      {/* Thinking indicator — shown when loading and no events have arrived yet,
          or when the last event was a tool_result (waiting for next action) */}
      {isLoading && (() => {
        const lastEvent = timelineEvents[timelineEvents.length - 1];
        const lastNonUser = timelineEvents.filter(e => e.kind !== 'user');
        const showThinking =
          lastNonUser.length === 0 ||
          lastEvent?.kind === 'tool_result' ||
          lastEvent?.kind === 'user';

        if (!showThinking) return null;

        return (
          <Box flexDirection="column">
            {needsAssistantHeader && (
              <Box marginTop={1} marginBottom={0}>
                <Text bold color="white">{'\u203A'} Stratus</Text>
                <Text bold color={CODE_COLOR}>Code</Text>
              </Box>
            )}
            <Box marginLeft={2}>
              <ThinkingIndicator />
            </Box>
          </Box>
        );
      })()}

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
    </Box>
  );
});
