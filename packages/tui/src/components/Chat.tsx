/**
 * Chat Component
 *
 * Renders the current streaming turn only.
 * Previous turns are rendered via <Static> in app.tsx to avoid re-renders.
 */

import React, { useMemo } from 'react';
import { Box, Text, useStdout } from 'ink';
import type { Message as MessageType, ToolCall } from '@stratuscode/shared';
import { Message } from './Message';
import { ToolCallDisplay } from './ToolCall';
import { QuestionDialog, type Question } from './QuestionDialog';
import { ReasoningBlock } from './ReasoningBlock';
import { ThinkingIndicator } from './ThinkingIndicator';
import { MarkdownText } from './MarkdownText';
import { colors } from '../theme/colors';
import type { ActionPart } from '../hooks/useChat';
import type { Command } from '../commands/registry';

const CODE_COLOR = '#8642EC';

// ============================================
// Types
// ============================================

export interface ChatProps {
  /** Current turn messages only (previous turns rendered via Static in app.tsx) */
  messages: MessageType[];
  isLoading: boolean;
  streamingContent: string;
  streamingReasoning: string;
  toolCalls: ToolCall[];
  actions: ActionPart[];
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
  compactView = false,
  pendingQuestion,
  onQuestionAnswer,
  onQuestionSkip,
}: ChatProps) {
  const currentUserMsg = messages.find(m => m.role === 'user');
  const currentAssistantMsg = messages.find(m => m.role === 'assistant');

  // ── Viewport limiting ──
  // Ink clears the entire terminal when dynamic output >= stdout.rows.
  // Cap visible actions + streaming text so the dynamic section stays small.
  const { stdout } = useStdout();
  const termRows = stdout?.rows ?? 24;
  // Reserve: input box ~5, header ~2, user msg ~3, margins ~4 = ~14 rows overhead
  const dynamicBudget = Math.max(8, termRows - 14);

  // During streaming: only show tail actions that fit within budget.
  // Rough estimate: each tool action ~4 rows, text/reasoning ~3 rows.
  const maxVisibleActions = isLoading
    ? Math.max(2, Math.floor(dynamicBudget / 5))
    : actions.length;
  const visibleActions = useMemo(
    () => actions.slice(-maxVisibleActions),
    [actions, maxVisibleActions]
  );
  const hiddenActionCount = actions.length - visibleActions.length;

  // During streaming: truncate text to last N lines that fit in budget.
  const maxStreamingLines = Math.max(4, Math.floor(dynamicBudget / 2));
  const truncatedStreaming = useMemo(() => {
    if (!streamingContent) return '';
    const lines = streamingContent.split('\n');
    if (lines.length <= maxStreamingLines) return streamingContent;
    return '…\n' + lines.slice(-maxStreamingLines).join('\n');
  }, [streamingContent, maxStreamingLines]);

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1} paddingLeft={gutter + 1}>
      {/* ── Current turn ── */}

      {/* User message */}
      {currentUserMsg && (
        <Message message={currentUserMsg} />
      )}

      {/* Active streaming session */}
      {isLoading && (() => {
        // Find the last reasoning action to make it keyboard-active
        const lastReasoningId = [...visibleActions].reverse().find(a => a.type === 'reasoning')?.id;
        return (
        <Box flexDirection="column" marginTop={1}>
          {/* Assistant header */}
          <Box marginBottom={0}>
            <Text bold color="white">{'\u203A'} Stratus</Text>
            <Text bold color={CODE_COLOR}>Code</Text>
          </Box>

          {/* Truncation indicator */}
          {hiddenActionCount > 0 && (
            <Box marginLeft={2}>
              <Text color={colors.textDim}>… {hiddenActionCount} earlier action{hiddenActionCount !== 1 ? 's' : ''}</Text>
            </Box>
          )}

          {/* Actions in chronological order (viewport-limited during streaming) */}
          {visibleActions.map((action) => (
            <Box key={action.id} marginY={0}>
              {action.type === 'tool' && action.toolCall && (
                <ToolCallDisplay toolCall={action.toolCall} />
              )}
              {action.type === 'text' && (
                <Box marginLeft={2}>
                  <MarkdownText content={action.content} />
                </Box>
              )}
              {action.type === 'reasoning' && !compactView && (
                <ReasoningBlock
                  reasoning={action.content}
                  isStreaming={false}
                  isActive={action.id === lastReasoningId && !streamingReasoning}
                  defaultExpanded={false}
                />
              )}
            </Box>
          ))}

          {/* Live streaming reasoning (current block being streamed) */}
          {streamingReasoning && !compactView && (
            <ReasoningBlock
              reasoning={streamingReasoning}
              isStreaming={true}
            />
          )}

          {/* Live streaming text (viewport-limited) */}
          {truncatedStreaming && (
            <Box marginLeft={2}>
              <Text color="white" wrap="wrap">{truncatedStreaming}</Text>
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
        const hasTextActions = actions.some(a => a.type === 'text');
        return (
        <Box flexDirection="column" marginTop={1}>
          {actions.length > 0 && (
            <>
              {/* Assistant header (shown when actions exist) */}
              <Box marginBottom={0}>
                <Text bold color="white">{'\u203A'} Stratus</Text>
                <Text bold color={CODE_COLOR}>Code</Text>
              </Box>
              {/* Actions from the completed turn (reasoning + tools + text interleaved) */}
              {actions.map((action) => (
                <Box key={action.id} marginY={0}>
                  {action.type === 'tool' && action.toolCall && (
                    <ToolCallDisplay toolCall={action.toolCall} />
                  )}
                  {action.type === 'text' && (
                    <Box marginLeft={2}>
                      <MarkdownText content={action.content} />
                    </Box>
                  )}
                  {action.type === 'reasoning' && !compactView && (
                    <ReasoningBlock
                      reasoning={action.content}
                      isStreaming={false}
                      isActive={action.id === lastReasoningId}
                      defaultExpanded={false}
                    />
                  )}
                </Box>
              ))}
            </>
          )}
          {/* Final assistant message — only render if no text was shown in actions */}
          {!hasTextActions && <Message message={currentAssistantMsg} />}
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
