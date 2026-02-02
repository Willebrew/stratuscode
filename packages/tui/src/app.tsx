/**
 * Main App Component
 *
 * The root component for the TUI.
 */

import React, { useState, useCallback } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import type { StratusCodeConfig } from '@stratuscode/shared';
import { Chat } from './components/Chat';
import { UnifiedInput } from './components/UnifiedInput';
import { SplashScreen } from './components/SplashScreen';
import { PlanActions } from './components/PlanActions';
import { ModelPicker } from './components/ModelPicker';
import { useChat } from './hooks/useChat';
import { useQuestions } from './hooks/useQuestions';
import { useTodos } from './hooks/useTodos';
import { useCenteredPadding } from './hooks/useCenteredPadding';
import { colors } from './theme/colors';
import type { Command } from './commands/registry';
import type { Question } from './components/QuestionDialog';
const CODE_COLOR = '#8642EC';

// ============================================
// Types
// ============================================

export interface AppProps {
  projectDir: string;
  config: StratusCodeConfig;
  initialAgent?: string;
}

// ============================================
// App Component
// ============================================

interface SessionInfo {
  id: string;
  title: string;
  messageCount: number;
  firstMessage?: string;
}

export function App({ projectDir, config, initialAgent = 'build' }: AppProps) {
  const { exit } = useApp();
  const { gutter } = useCenteredPadding(100);
  const [showSplash, setShowSplash] = useState(true);
  const [agent, setAgent] = useState(initialAgent);
  const [showSessionPicker, setShowSessionPicker] = useState(false);
  const [availableSessions, setAvailableSessions] = useState<SessionInfo[]>([]);
  const [selectedSessionIndex, setSelectedSessionIndex] = useState(0);

  const [systemMessage, setSystemMessage] = useState<string | null>(null);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [activeModel, setActiveModel] = useState(config.model);
  const [activeProvider, setActiveProvider] = useState<string | undefined>();

  const {
    messages,
    isLoading,
    error,
    streamingContent,
    streamingReasoning,
    toolCalls,
    actions,
    tokens,
    sessionId,
    sendMessage,
    executeTool,
    loadSession,
    abort,
    clear,
    planExitProposed,
    resetPlanExit,
  } = useChat({
    projectDir,
    config,
    agent,
    modelOverride: activeModel !== config.model ? activeModel : undefined,
    providerOverride: activeProvider,
  });

  // Handle pending questions from question tool
  const { pendingQuestion, answer: answerQuestion, skip: skipQuestion } = useQuestions({
    sessionId,
  });

  // Auto-load todos when agent creates them
  const { todos, counts: todoCounts } = useTodos({
    sessionId,
  });

  // Convert to Question format for dialog
  const questionForDialog: Question | undefined = pendingQuestion ? {
    id: pendingQuestion.id,
    question: pendingQuestion.question,
    header: pendingQuestion.header,
    options: pendingQuestion.options,
    allowMultiple: pendingQuestion.allowMultiple,
    allowCustom: pendingQuestion.allowCustom,
  } : undefined;

  // Show a temporary system message
  const showSystemMessage = useCallback((msg: string) => {
    setSystemMessage(msg);
    setTimeout(() => setSystemMessage(null), 3000);
  }, []);

  // Plan actions only appear when the model calls plan_exit with proposingExit: true
  const shouldShowPlanActions =
    agent === 'plan' &&
    !isLoading &&
    planExitProposed;

  // Handle plan action buttons
  const handleAcceptAndBuild = useCallback(() => {
    setAgent('build');
    resetPlanExit();
    // Pass 'build' as agentOverride so the system prompt uses BUILD mode immediately,
    // rather than relying on the async setAgent state update.
    sendMessage('The plan is approved. Read the plan file and start implementing.', 'build', { buildSwitch: true });
  }, [sendMessage, resetPlanExit]);

  const handleKeepPlanning = useCallback(() => {
    resetPlanExit();
    showSystemMessage('Continue refining the plan...');
  }, [showSystemMessage, resetPlanExit]);

  // Handle slash commands - execute directly without messaging agent
  const handleCommand = useCallback(async (command: Command) => {
    switch (command.action) {
      // Session commands
      case 'session:new':
        clear();
        showSystemMessage('Started new session');
        break;
      case 'session:clear':
        clear();
        showSystemMessage('Cleared conversation');
        break;
      case 'session:history':
        // Show session picker
        try {
          const { listSessions, getMessages } = await import('@stratuscode/storage');
          const sessionList = listSessions(projectDir, 20);

          // Find sessions that have messages (skip current session)
          const sessionsWithMessages = sessionList
            .filter(s => {
              if (s.id === sessionId) return false;
              const msgs = getMessages(s.id);
              return msgs.length > 0;
            })
            .map(s => {
              const msgs = getMessages(s.id);
              const firstUserMsg = msgs.find(m => m.role === 'user');
              const firstMsgContent = typeof firstUserMsg?.content === 'string'
                ? firstUserMsg.content.slice(0, 50)
                : undefined;
              return {
                id: s.id,
                title: s.title,
                messageCount: msgs.length,
                firstMessage: firstMsgContent,
              };
            });

          if (sessionsWithMessages.length === 0) {
            showSystemMessage('No previous sessions with messages found');
          } else {
            setAvailableSessions(sessionsWithMessages);
            setSelectedSessionIndex(0);
            setShowSessionPicker(true);
          }
        } catch (err) {
          showSystemMessage(`Could not load session history: ${err}`);
        }
        break;

      // Mode commands
      case 'mode:plan':
        setAgent('plan');
        showSystemMessage('Switched to PLAN mode');
        break;
      case 'mode:build':
        setAgent('build');
        showSystemMessage('Switched to BUILD mode');
        break;
      case 'mode:compact':
        showSystemMessage('Compact view not yet implemented');
        break;

      // Tool commands - execute directly
      case 'tool:codesearch':
        showSystemMessage('Use: /search <query> or type a search query');
        break;
      case 'tool:reindex': {
        showSystemMessage('Reindexing codebase...');
        const result = await executeTool('codesearch', { query: '__reindex__', reindex: true });
        try {
          const parsed = JSON.parse(result);
          showSystemMessage(parsed.error ? `Error: ${parsed.message}` : 'Codebase reindexed');
        } catch {
          showSystemMessage('Reindex complete');
        }
        break;
      }
      case 'tool:todos': {
        // Todos auto-refresh via useTodos hook
        showSystemMessage(`Todos: ${todoCounts.total} total (${todoCounts.completed} done)`);
        break;
      }
      case 'tool:revert': {
        showSystemMessage('Reverting changes...');
        const result = await executeTool('revert', {});
        try {
          const parsed = JSON.parse(result);
          showSystemMessage(parsed.error ? `Error: ${parsed.message}` : `Reverted: ${parsed.summary || 'Done'}`);
        } catch {
          showSystemMessage('Revert complete');
        }
        break;
      }
      case 'tool:lsp':
        showSystemMessage('LSP status: checking language servers...');
        // TODO: Actually check LSP status
        showSystemMessage('LSP servers: typescript (active)');
        break;

      // Settings commands
      case 'settings:model':
        setShowModelPicker(true);
        break;
      case 'settings:theme':
        showSystemMessage('Theme settings not yet implemented');
        break;
      case 'settings:config':
        showSystemMessage('Config editor not yet implemented');
        break;

      // Help commands
      case 'help:show':
        showSystemMessage('Commands: /new /clear /plan /build /search /todos /revert /help');
        break;
      case 'help:shortcuts':
        showSystemMessage('Shortcuts: Ctrl+C exit | Tab switch mode | Esc cancel | ? help');
        break;
      case 'help:about':
        showSystemMessage('StratusCode - AI coding assistant');
        break;

      default:
        showSystemMessage(`Unknown command: ${command.action}`);
        break;
    }
  }, [clear, executeTool, loadSession, showSystemMessage, config.model, todoCounts, projectDir, sessionId]);

  // Handle global keyboard shortcuts
  useInput((input, key) => {
    // Model picker is open — let it handle its own input
    if (showModelPicker) {
      return;
    }

    // Session picker navigation
    if (showSessionPicker) {
      if (key.escape) {
        setShowSessionPicker(false);
        return;
      }
      if (key.upArrow) {
        setSelectedSessionIndex(i => Math.max(0, i - 1));
        return;
      }
      if (key.downArrow) {
        setSelectedSessionIndex(i => Math.min(availableSessions.length - 1, i + 1));
        return;
      }
      // Delete session with 'd' or 'D'
      if (input === 'd' || input === 'D') {
        const session = availableSessions[selectedSessionIndex];
        if (session) {
          // Delete from storage
          import('@stratuscode/storage').then(({ deleteSession }) => {
            deleteSession(session.id);
            // Remove from list
            setAvailableSessions(prev => prev.filter(s => s.id !== session.id));
            // Adjust selected index if needed
            setSelectedSessionIndex(i => Math.min(i, availableSessions.length - 2));
            showSystemMessage(`Deleted session`);
          });
        }
        return;
      }
      // Number keys for quick select
      const num = parseInt(input, 10);
      if (num >= 1 && num <= availableSessions.length) {
        const session = availableSessions[num - 1]!;
        loadSession(session.id);
        setShowSessionPicker(false);
        showSystemMessage(`Loaded session`);
        return;
      }
      if (key.return) {
        const session = availableSessions[selectedSessionIndex];
        if (session) {
          loadSession(session.id);
          setShowSessionPicker(false);
          showSystemMessage(`Loaded session`);
        }
        return;
      }
      return; // Don't process other keys when picker is open
    }

    // Ctrl+C to cancel or exit
    if (input === 'c' && key.ctrl) {
      if (isLoading) {
        abort();
      } else {
        exit();
      }
    }

    // Ctrl+L to clear screen (send clear message)
    if (input === 'l' && key.ctrl) {
      // Clear screen effect - handled by terminal
    }

    // Ctrl+N for new session
    if (input === 'n' && key.ctrl && !isLoading) {
      clear();
      showSystemMessage('Started new session');
    }

    // Tab to switch agents
    if (key.tab && !isLoading) {
      setAgent(prev => (prev === 'build' ? 'plan' : 'build'));
    }

    // Escape to cancel current operation
    if (key.escape && isLoading) {
      abort();
    }

    // ? to show help (when not typing)
    if (input === '?' && !isLoading) {
      showSystemMessage('Commands: /new /clear /plan /build /search /todos /revert /help');
    }
  });

  const handleSubmit = useCallback(
    (text: string) => {
      if (text.trim() && !isLoading) {
        sendMessage(text);
      }
    },
    [sendMessage, isLoading]
  );

  // Show splash screen until first message (unless an overlay like model picker is open)
  if (showSplash && messages.length === 0 && !showModelPicker) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        {/* Splash logo centers itself via alignItems="center" — no gutter needed */}
        <SplashScreen
          version="0.1.0"
          projectDir={projectDir}
          model={activeModel}
        />
        {/* Input box at bottom — aligned with chat content */}
        <Box flexGrow={1} />
        <Box paddingX={2} paddingY={1} paddingLeft={gutter + 2}>
          <UnifiedInput
            onSubmit={(text) => {
              setShowSplash(false);
              sendMessage(text);
            }}
            onCommand={handleCommand}
            placeholder="What would you like to build?"
            showStatus={true}
            agent={agent}
            model={activeModel}
            tokens={tokens}
            isLoading={false}
          />
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* System message toast */}
      {systemMessage && (
        <Box paddingX={2} marginY={1} paddingLeft={gutter + 2}>
          <Text color={colors.secondary}>[i] {systemMessage}</Text>
        </Box>
      )}

      {/* Main content area - show model picker, session picker, or chat */}
      <Box flexGrow={1} flexDirection="column">
        {showModelPicker ? (
          <Box paddingLeft={gutter}>
            <ModelPicker
              config={config}
              currentModel={activeModel}
              onSelect={(model, providerKey) => {
                setActiveModel(model);
                setActiveProvider(providerKey);
                setShowModelPicker(false);
                showSystemMessage(`Model: ${model}${providerKey ? ` (${providerKey})` : ''}`);
              }}
              onClose={() => setShowModelPicker(false)}
            />
          </Box>
        ) : showSessionPicker ? (
          /* Session picker - full screen mode */
          <Box flexDirection="column" paddingX={1} flexGrow={1} paddingLeft={gutter + 1}>
            <Box marginBottom={1}>
              <Text bold color={colors.primary}>Session History</Text>
            </Box>
            <Box marginBottom={1}>
              <Text color={colors.textDim}>↑↓ navigate | Enter load | D delete | Esc close</Text>
            </Box>
            {availableSessions.slice(0, 9).map((session, index) => {
              const isFocused = index === selectedSessionIndex;
              const displayTitle = session.firstMessage
                ? `"${session.firstMessage}${session.firstMessage.length >= 50 ? '...' : ''}"`
                : `Session ${index + 1}`;
              return (
                <Box key={session.id} marginBottom={0}>
                  <Text color={isFocused ? colors.primary : colors.textDim}>
                    {isFocused ? '› ' : '  '}
                  </Text>
                  <Text color={colors.textDim}>{index + 1}. </Text>
                  <Text color={isFocused ? colors.text : colors.textMuted} bold={isFocused}>
                    {displayTitle}
                  </Text>
                  <Text color={colors.textDim}> ({session.messageCount} msgs)</Text>
                </Box>
              );
            })}
            {availableSessions.length === 0 && (
              <Text color={colors.textMuted}>No sessions with messages found</Text>
            )}
          </Box>
        ) : (
          /* Normal chat view — Static messages + dynamic bottom */
          <Box flexDirection="column" flexGrow={1}>
            <Chat
              messages={messages}
              isLoading={isLoading}
              streamingContent={streamingContent}
              streamingReasoning={streamingReasoning}
              toolCalls={toolCalls}
              actions={actions}
              gutter={gutter}
              pendingQuestion={questionForDialog}
              onSubmit={handleSubmit}
              onCommand={handleCommand}
              onQuestionAnswer={answerQuestion}
              onQuestionSkip={skipQuestion}
              error={error}
            />
          </Box>
        )}
      </Box>

      {/* -- Pinned bottom section: plan actions + input -- */}

      {/* Plan actions */}
      {shouldShowPlanActions && (
        <Box paddingX={2} paddingLeft={gutter + 2}>
          <PlanActions
            onAcceptAndBuild={handleAcceptAndBuild}
            onKeepPlanning={handleKeepPlanning}
          />
        </Box>
      )}

      {/* Combined input and status bar -- always at very bottom */}
      <Box paddingX={2} paddingY={1} paddingLeft={gutter + 2}>
        <UnifiedInput
          onSubmit={handleSubmit}
          onCommand={handleCommand}
          showStatus={true}
          agent={agent}
          model={activeModel}
          tokens={tokens}
          isLoading={isLoading}
          todos={todos}
        />
      </Box>
    </Box>
  );
}
