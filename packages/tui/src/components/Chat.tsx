/**
 * Chat Component
 *
 * Previous turns live in Ink's Static (terminal scrollback).
 * The CURRENT turn (latest user message + assistant response) lives in the
 * dynamic section so it's always visible and never lost to Ink's race conditions.
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
  const staticItemsRef = useRef<Array<{ id: string; msg: MessageType }>>([]);

  // Reset if messages were cleared (new session / clear command).
  if (staticItemsRef.current.length > messages.length) {
    staticItemsRef.current = [];
  }

  // Find where the current turn starts. A "turn" is the latest user message
  // plus the assistant's response (if any). Everything before goes to Static.
  // This keeps the current turn in the dynamic section where Ink can safely
  // re-render it without the Static race condition.
  let currentTurnStart = messages.length;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]!.role === 'user') {
      currentTurnStart = i;
      break;
    }
    if (messages[i]!.role === 'assistant') {
      currentTurnStart = i;
      // keep looking for the user message before it
    }
  }

  // Only add messages BEFORE the current turn to Static
  for (let i = staticItemsRef.current.length; i < currentTurnStart; i++) {
    staticItemsRef.current.push({ id: `msg-${i}`, msg: messages[i]! });
  }

  // The current turn messages (rendered in dynamic section)
  const currentTurnMessages = messages.slice(currentTurnStart);
  const currentUserMsg = currentTurnMessages.find(m => m.role === 'user');
  const currentAssistantMsg = currentTurnMessages.find(m => m.role === 'assistant');

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* ── Previous turns ── in terminal scrollback */}
      <Static items={staticItemsRef.current}>
        {({ id, msg }) => (
          <Box key={id} paddingX={1} paddingLeft={gutter + 1}>
            <Message message={msg} />
          </Box>
        )}
      </Static>

      {/* ── Current turn ── always in dynamic section */}
      <Box flexDirection="column" paddingX={1} paddingLeft={gutter + 1}>
        {/* User message for current turn */}
        {currentUserMsg && (
          <Message message={currentUserMsg} />
        )}

        {/* Active streaming session */}
        {isLoading && (
          <Box flexDirection="column" marginTop={1}>
            {/* Assistant header */}
            <Box marginBottom={0}>
              <Text bold color="white">{'\u203A'} Stratus</Text>
              <Text bold color={CODE_COLOR}>Code</Text>
            </Box>

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

            {/* Remaining streaming text */}
            {streamingContent && (
              <Box marginLeft={2}>
                <Text color="white" wrap="wrap">{streamingContent}</Text>
                <Text color={CODE_COLOR}>{'\u258C'}</Text>
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

        {/* Completed response — stays until next turn */}
        {!isLoading && currentAssistantMsg && (
          <Box flexDirection="column" marginTop={1}>
            {/* Tool calls from the completed turn */}
            {actions.filter(a => a.type === 'tool' && a.toolCall).map((action) => (
              <Box key={action.id} marginY={0}>
                <ToolCallDisplay toolCall={action.toolCall!} />
              </Box>
            ))}
            {/* Final assistant message */}
            <Message message={currentAssistantMsg} />
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
