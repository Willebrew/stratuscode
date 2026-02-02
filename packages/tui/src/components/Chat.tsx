/**
 * Chat Component
 *
 * Uses Ink's Static component for completed messages (rendered once into terminal
 * scrollback) and a dynamic bottom section for the active session. This prevents
 * flickering and duplication. The terminal's native scrollback handles viewing
 * older messages.
 */

import React, { useRef } from 'react';
import { Box, Text, Static } from 'ink';
import type { Message as MessageType, ToolCall } from '@stratuscode/shared';
import { Message } from './Message';
import { ToolCallDisplay } from './ToolCall';
import { QuestionDialog, type Question } from './QuestionDialog';
import { ReasoningBlock } from './ReasoningBlock';
import { ThinkingIndicator } from './ThinkingIndicator';
import { colors } from '../theme/colors';
import type { ActionPart } from '../hooks/useChat';
import type { Command } from '../commands/registry';

const CODE_COLOR = '#8642EC';

// ============================================
// Types
// ============================================

export interface ChatProps {
  messages: MessageType[];
  isLoading: boolean;
  streamingContent: string;
  streamingReasoning: string;
  toolCalls: ToolCall[];
  actions: ActionPart[];
  error: string | null;
  gutter?: number;
  pendingQuestion?: Question;
  onSubmit: (text: string) => void;
  onCommand?: (command: Command) => void;
  onQuestionAnswer?: (answers: string[]) => void;
  onQuestionSkip?: () => void;
}

// ============================================
// Component
// ============================================

export const Chat = React.memo(function Chat({
  messages,
  isLoading,
  streamingContent,
  streamingReasoning,
  actions,
  error,
  gutter = 0,
  pendingQuestion,
  onQuestionAnswer,
  onQuestionSkip,
}: ChatProps) {
  // Maintain stable item references for Ink's Static component.
  // Static tracks items by reference identity — if we create new wrapper
  // objects each render (via .map()), it treats ALL items as new and
  // re-renders everything, causing duplication in scrollback.
  const staticItemsRef = useRef<Array<{ id: string; msg: MessageType }>>([]);

  // Grow the stable items list as new messages arrive.
  // Shrink it if messages are cleared (new session / clear command).
  if (staticItemsRef.current.length > messages.length) {
    // Messages were cleared — reset
    staticItemsRef.current = [];
  }

  // Keep the trailing assistant message OUT of Static. It lives in the dynamic
  // section until the next user message pushes it into Static. This avoids an
  // Ink race condition where Static adds a new item in the same render that the
  // dynamic section shrinks, causing Ink's cursor management to overwrite the
  // newly-added Static item.
  const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
  const trailingAssistant = lastMsg?.role === 'assistant' ? lastMsg : null;
  const staticEnd = trailingAssistant ? messages.length - 1 : messages.length;

  for (let i = staticItemsRef.current.length; i < staticEnd; i++) {
    staticItemsRef.current.push({ id: `msg-${i}`, msg: messages[i]! });
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* ── Completed messages ──
          Rendered ONCE into terminal scrollback. Ink never re-renders these.
          User scrolls back in terminal to see older messages. */}
      <Static items={staticItemsRef.current}>
        {({ id, msg }) => (
          <Box key={id} paddingX={1} paddingLeft={gutter + 1}>
            <Message message={msg} />
          </Box>
        )}
      </Static>

      {/* ── Dynamic section ── re-renders each tick, stays at bottom of terminal */}
      <Box flexDirection="column" paddingX={1} paddingLeft={gutter + 1}>
        {/* Active session — interleaved text + tool calls + streaming */}
        {isLoading && (
          <Box flexDirection="column" marginY={1}>
            {/* Reasoning (thinking) */}
            {streamingReasoning && (
              <ReasoningBlock
                reasoning={streamingReasoning}
                isStreaming={true}
              />
            )}

            {/* Actions in order: interleaved text chunks + tool calls */}
            {actions.map((action) => (
              <Box key={action.id} marginY={0}>
                {action.type === 'tool' && action.toolCall && (
                  <ToolCallDisplay toolCall={action.toolCall} />
                )}
                {action.type === 'text' && (
                  <Box marginLeft={2}>
                    <Text color="white" wrap="wrap">{action.content}</Text>
                  </Box>
                )}
              </Box>
            ))}

            {/* Remaining streaming text (after the last captured text chunk) */}
            {streamingContent && (
              <Box marginLeft={2}>
                <Text color="white" wrap="wrap">{streamingContent}</Text>
                <Text color={CODE_COLOR}>▌</Text>
              </Box>
            )}

            {/* Thinking indicator — only when nothing else is showing */}
            {!streamingContent && !streamingReasoning && actions.length === 0 && (
              <Box marginLeft={2}>
                <ThinkingIndicator />
              </Box>
            )}
          </Box>
        )}

        {/* Completed response — stays in dynamic section until next user message */}
        {!isLoading && trailingAssistant && (
          <Box flexDirection="column" marginY={1}>
            {/* Show tool calls from the completed turn */}
            {actions.filter(a => a.type === 'tool' && a.toolCall).map((action) => (
              <Box key={action.id} marginY={0}>
                <ToolCallDisplay toolCall={action.toolCall!} />
              </Box>
            ))}
            {/* Final assistant message */}
            <Message message={trailingAssistant} />
          </Box>
        )}

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
    </Box>
  );
});
