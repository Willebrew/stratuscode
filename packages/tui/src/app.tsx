/**
 * Main App Component
 *
 * The root component for the TUI.
 */

import React, { useState, useCallback, useRef, useMemo } from 'react';
import { Box, Static, Text, useApp, useInput } from 'ink';
import * as fs from 'fs';
import * as path from 'path';
import type { StratusCodeConfig } from '@stratuscode/shared';
import { Chat } from './components/Chat';
import { Message } from './components/Message';
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
  const [showShortcutsPanel, setShowShortcutsPanel] = useState(false);
  const [compactView, setCompactView] = useState(false);
  const shortcutsPanelJustOpenedRef = useRef(false);
  const [activeModel, setActiveModel] = useState(config.model);
  const [activeProvider, setActiveProvider] = useState<string | undefined>();
  const tasksExpandedRef = useRef<(() => void) | null>(null);

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
    setTimeout(() => setSystemMessage(null), 5000);
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
        setCompactView(prev => !prev);
        showSystemMessage(compactView ? 'Expanded view' : 'Compact view');
        break;

      // Tool commands - execute directly
      case 'tool:codesearch': {
        // If command has args, execute search directly
        const searchQuery = command.args?.[0];
        if (searchQuery) {
          showSystemMessage(`Searching: ${searchQuery}...`);
          const result = await executeTool('codesearch', { query: searchQuery });
          try {
            const parsed = JSON.parse(result);
            if (parsed.error) {
              showSystemMessage(`Search error: ${parsed.message}`);
            } else if (Array.isArray(parsed) && parsed.length > 0) {
              const summary = parsed.slice(0, 5).map((r: any) => r.filePath || r.file).join(', ');
              showSystemMessage(`Found ${parsed.length} results: ${summary}`);
            } else {
              showSystemMessage('No results found');
            }
          } catch {
            showSystemMessage('Search complete');
          }
        } else {
          showSystemMessage('Usage: /search <query>');
        }
        break;
      }
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
        // Toggle tasks expanded in UnifiedInput
        if (tasksExpandedRef.current) {
          tasksExpandedRef.current();
        } else {
          showSystemMessage(`Todos: ${todoCounts.total} total (${todoCounts.completed} done)`);
        }
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
      case 'tool:lsp': {
        // Show LSP server status
        try {
          const toolsMod = await import('@stratuscode/tools') as any;
          const createMgr = toolsMod.createLSPManager;

          const lines: string[] = [];

          if (typeof createMgr === 'function') {
            const lspManager = createMgr(projectDir);
            const active = lspManager.getActiveServers();
            const broken = lspManager.getBrokenServers();

            if (active.length > 0) {
              lines.push(`Active: ${active.map((s: { id: string; root: string }) => `${s.id} (${s.root})`).join(', ')}`);
            }
            if (broken.length > 0) {
              lines.push(`Broken: ${broken.join(', ')}`);
            }
          }

          // Show detected project types
          const detected: string[] = [];
          if (fs.existsSync(path.join(projectDir, 'tsconfig.json')) || fs.existsSync(path.join(projectDir, 'package.json'))) {
            detected.push('TypeScript/JavaScript');
          }
          if (fs.existsSync(path.join(projectDir, 'pyproject.toml')) || fs.existsSync(path.join(projectDir, 'setup.py')) || fs.existsSync(path.join(projectDir, 'requirements.txt'))) {
            detected.push('Python');
          }
          if (fs.existsSync(path.join(projectDir, 'go.mod'))) {
            detected.push('Go');
          }
          if (fs.existsSync(path.join(projectDir, 'Cargo.toml'))) {
            detected.push('Rust');
          }
          if (detected.length > 0) {
            lines.push(`Available: ${detected.join(', ')}`);
          }

          showSystemMessage(lines.length > 0 ? `LSP:\n${lines.join('\n')}` : 'LSP: No language servers detected');
        } catch {
          showSystemMessage('LSP: Unable to query server status');
        }
        break;
      }

      // Settings commands
      case 'settings:model':
        setShowModelPicker(true);
        break;
      case 'settings:theme':
        showSystemMessage('Theme: default (custom themes coming soon)');
        break;
      case 'settings:config': {
        const configPath = path.join(projectDir, '.stratuscode', 'config.json');
        const configExists = fs.existsSync(configPath);
        showSystemMessage(configExists
          ? `Config: ${configPath} | Model: ${activeModel} | Agent: ${agent}`
          : `No config file. Create ${configPath} to customize.`);
        break;
      }

      // Help commands
      case 'help:show':
        shortcutsPanelJustOpenedRef.current = true;
        setShowShortcutsPanel(true);
        break;
      case 'help:shortcuts':
        shortcutsPanelJustOpenedRef.current = true;
        setShowShortcutsPanel(true);
        break;
      case 'help:about':
        showSystemMessage(`StratusCode v0.1.0 — AI coding assistant | Model: ${activeModel} | Agent: ${agent}`);
        break;

      default:
        showSystemMessage(`Unknown command: ${command.action}`);
        break;
    }
  }, [clear, executeTool, loadSession, showSystemMessage, config.model, todoCounts, projectDir, sessionId, compactView, activeModel, agent]);

  // Handle global keyboard shortcuts
  useInput((input, key) => {
    // Model picker is open — let it handle its own input
    if (showModelPicker) {
      return;
    }

    // Shortcuts panel — dismiss with Esc or any key
    if (showShortcutsPanel) {
      if (shortcutsPanelJustOpenedRef.current) {
        shortcutsPanelJustOpenedRef.current = false;
        return;
      }
      if (key.escape || key.return || input) {
        setShowShortcutsPanel(false);
      }
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

    // Ctrl+N for new session — always available
    if (input === 'n' && key.ctrl) {
      clear();
      showSystemMessage('Started new session');
    }

    // Tab to switch agents — always available
    if (key.tab) {
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

  // Compute the turn boundary for Static rendering of previous messages.
  // Previous messages go into <Static> (written once, never re-rendered).
  // Current turn messages go into the dynamic section.
  const currentTurnStart = useMemo(() => {
    let start = messages.length;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]!.role === 'user') {
        start = i;
        break;
      }
      if (messages[i]!.role === 'assistant') {
        start = i;
      }
    }
    return start;
  }, [messages]);

  const previousMessages = useMemo(
    () => messages.slice(0, currentTurnStart),
    [messages, currentTurnStart]
  );

  const currentTurnMessages = useMemo(
    () => messages.slice(currentTurnStart),
    [messages, currentTurnStart]
  );

  // Memoize Static items — only recompute when previousMessages changes
  const staticItems = useMemo(
    () => previousMessages.map((msg, i) => ({ id: `prev-${i}`, msg })),
    [previousMessages]
  );

  // Show splash screen until first message (unless an overlay is open)
  if (showSplash && messages.length === 0 && !showModelPicker && !showSessionPicker && !showShortcutsPanel) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        {/* Splash logo centers itself via alignItems="center" — no gutter needed */}
        <SplashScreen
          version="0.1.0"
          projectDir={projectDir}
          model={activeModel}
        />
        {/* System message toast (visible on splash screen too) */}
        {systemMessage && (
          <Box paddingX={2} marginY={1} paddingLeft={gutter + 2}>
            <Text color={colors.secondary}>[i] {systemMessage}</Text>
          </Box>
        )}
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
            projectDir={projectDir}
          />
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* Previous messages — rendered once via Static, never re-rendered */}
      {staticItems.length > 0 && !showShortcutsPanel && !showModelPicker && !showSessionPicker && (
        <Static items={staticItems}>
          {({ id, msg }) => (
            <Box key={id} paddingX={1} paddingLeft={gutter + 1}>
              <Message message={msg} showToolCalls compactView={compactView} />
            </Box>
          )}
        </Static>
      )}

      {/* System message toast */}
      {systemMessage && (
        <Box paddingX={2} marginY={1} paddingLeft={gutter + 2}>
          <Text color={colors.secondary}>[i] {systemMessage}</Text>
        </Box>
      )}

      {/* Main content area - show model picker, session picker, or chat */}
      <Box flexGrow={1} flexDirection="column">
        {showShortcutsPanel ? (
          /* Shortcuts reference panel */
          <Box flexDirection="column" paddingX={1} flexGrow={1} paddingLeft={gutter + 1}>
            <Box marginBottom={1}>
              <Text bold color={colors.primary}>Keyboard Shortcuts</Text>
            </Box>
            <Box flexDirection="column">
              <Text color={colors.textDim} bold>── General ──</Text>
              <Text color={colors.text}><Text color={colors.secondary} bold>{process.platform === 'darwin' ? '⌃C       ' : 'Ctrl+C   '}</Text> Exit / Cancel operation</Text>
              <Text color={colors.text}><Text color={colors.secondary} bold>{process.platform === 'darwin' ? '⌃N       ' : 'Ctrl+N   '}</Text> New session</Text>
              <Text color={colors.text}><Text color={colors.secondary} bold>Tab      </Text> Switch mode (Plan/Build)</Text>
              <Text color={colors.text}><Text color={colors.secondary} bold>Esc      </Text> Cancel / Close panel</Text>
              <Text color={colors.text}><Text color={colors.secondary} bold>?        </Text> Show help</Text>
              <Text> </Text>
              <Text color={colors.textDim} bold>── Editing ──</Text>
              <Text color={colors.text}><Text color={colors.secondary} bold>{process.platform === 'darwin' ? '⌃U       ' : 'Ctrl+U   '}</Text> Clear input line</Text>
              <Text color={colors.text}><Text color={colors.secondary} bold>{process.platform === 'darwin' ? '⌃W       ' : 'Ctrl+W   '}</Text> Delete last word</Text>
              <Text color={colors.text}><Text color={colors.secondary} bold>/        </Text> Open command palette</Text>
              <Text color={colors.text}><Text color={colors.secondary} bold>@        </Text> Mention a file</Text>
              <Text> </Text>
              <Text color={colors.textDim} bold>── Chat ──</Text>
              <Text color={colors.text}><Text color={colors.secondary} bold>{process.platform === 'darwin' ? '⌃T       ' : 'Ctrl+T   '}</Text> Toggle todo list</Text>
              <Text color={colors.text}><Text color={colors.secondary} bold>Enter    </Text> Toggle reasoning block</Text>
            </Box>
            <Box marginTop={1}>
              <Text color={colors.textDim}>Press any key to close</Text>
            </Box>
          </Box>
        ) : showModelPicker ? (
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
              messages={currentTurnMessages}
              isLoading={isLoading}
              streamingContent={streamingContent}
              streamingReasoning={streamingReasoning}
              toolCalls={toolCalls}
              actions={actions}
              gutter={gutter}
              compactView={compactView}
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
          onToggleTasks={tasksExpandedRef}
          projectDir={projectDir}
        />
      </Box>
    </Box>
  );
}
