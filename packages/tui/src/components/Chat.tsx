/**
 * Chat Component
 *
 * Renders the full conversation history plus the current streaming turn.
 * All messages live in a single dynamic section — no Ink Static.
 * This avoids Ink's Static race condition entirely.
 */

import React from 'react';
import { Box, Text } from 'ink';
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
  // Find the current turn boundary. The "current turn" is the latest user
  // message + its assistant response (if any). Previous turns are rendered
  // from the messages array with their stored tool calls. The current turn
  // uses live streaming state (actions, streamingContent, etc.).
  let currentTurnStart = messages.length;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]!.role === 'user') {
      currentTurnStart = i;
      break;
    }
    if (messages[i]!.role === 'assistant') {
      currentTurnStart = i;
    }
  }

  const previousMessages = messages.slice(0, currentTurnStart);
  const currentTurnMessages = messages.slice(currentTurnStart);
  const currentUserMsg = currentTurnMessages.find(m => m.role === 'user');
  const currentAssistantMsg = currentTurnMessages.find(m => m.role === 'assistant');

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1} paddingLeft={gutter + 1}>
      {/* ── Previous turns ── rendered from stored messages */}
      {previousMessages.map((msg, i) => (
        <Box key={`prev-${i}`}>
          <Message message={msg} showToolCalls />
        </Box>
      ))}

      {/* ── Current turn ── */}

      {/* User message */}
      {currentUserMsg && (
        <Message message={currentUserMsg} />
      )}

      {/* Active streaming session */}
      {isLoading && (() => {
        // Find the last reasoning action to make it keyboard-active
        const lastReasoningId = [...actions].reverse().find(a => a.type === 'reasoning')?.id;
        return (
        <Box flexDirection="column" marginTop={1}>
          {/* Assistant header */}
          <Box marginBottom={0}>
            <Text bold color="white">{'\u203A'} Stratus</Text>
            <Text bold color={CODE_COLOR}>Code</Text>
          </Box>

          {/* Actions in chronological order: reasoning → tool → text → reasoning → tool → ... */}
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
              {action.type === 'reasoning' && (
                <ReasoningBlock
                  reasoning={action.content}
                  isStreaming={false}
                  isActive={action.id === lastReasoningId && !streamingReasoning}
                />
              )}
            </Box>
          ))}

          {/* Live streaming reasoning (current block being streamed) */}
          {streamingReasoning && (
            <ReasoningBlock
              reasoning={streamingReasoning}
              isStreaming={true}
            />
          )}

          {/* Live streaming text */}
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
        );
      })()}

      {/* Completed response — stays until next turn pushes it to history */}
      {!isLoading && currentAssistantMsg && (() => {
        const lastReasoningId = [...actions].reverse().find(a => a.type === 'reasoning')?.id;
        return (
        <Box flexDirection="column" marginTop={1}>
          {/* Actions from the completed turn (reasoning + tools + text interleaved) */}
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
              {action.type === 'reasoning' && (
                <ReasoningBlock
                  reasoning={action.content}
                  isStreaming={false}
                  isActive={action.id === lastReasoningId}
                />
              )}
            </Box>
          ))}
          {/* Final assistant message */}
          <Message message={currentAssistantMsg} />
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
