/**
 * Main App Component
 *
 * The root component for the TUI.
 */

import React, { useState, useCallback, useRef } from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import * as fs from 'fs';
import * as path from 'path';
import type { StratusCodeConfig } from '@stratuscode/shared';
import { modelSupportsReasoning } from '@stratuscode/shared';
import { Chat } from './components/Chat';
import { UnifiedInput, type Attachment } from './components/UnifiedInput';
import { SplashScreen } from './components/SplashScreen';
import { PlanActions } from './components/PlanActions';
import { buildModelEntries } from './components/ModelPickerInline';
import { useChat } from './hooks/useChat';
import { useQuestions } from './hooks/useQuestions';
import { useTodos } from './hooks/useTodos';
import { useCenteredPadding } from './hooks/useCenteredPadding';
import { colors } from './theme/colors';
import type { Command } from './commands/registry';
import type { Question } from './components/QuestionPromptInline';
const CODE_COLOR = '#7C3AED';

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

type InlineOverlay =
  | {
      kind: 'model';
      entries: ReturnType<typeof buildModelEntries>;
      currentModel: string;
      onSelect: (model: string, providerKey?: string) => void;
      onClose: () => void;
    }
  | {
      kind: 'history';
      sessions: SessionInfo[];
      onSelect: (sessionId: string) => void;
      onDelete?: (sessionId: string) => void;
      onClose: () => void;
    }
  | {
      kind: 'question';
      question: Question;
      onAnswer: (answers: string[]) => void;
      onSkip: () => void;
    };

export function App({ projectDir, config, initialAgent = 'build' }: AppProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const { gutter, contentWidth } = useCenteredPadding(100);
  const fullWidth = stdout?.columns ?? 120;
  const centerWidth = Math.max(40, Math.min(110, fullWidth - 4));
  const [showSplash, setShowSplash] = useState(true);
  const [agent, setAgent] = useState(initialAgent);
  const [availableSessions, setAvailableSessions] = useState<SessionInfo[]>([]);


  const [showShortcutsPanel, setShowShortcutsPanel] = useState(false);
  const [compactView, setCompactView] = useState(false);
  const shortcutsPanelJustOpenedRef = useRef(false);
  const [activeModel, setActiveModel] = useState(config.model);
  const [activeProvider, setActiveProvider] = useState<string | undefined>(() => {
    // Auto-detect provider for default model
    if (config.model.includes('codex') && config.providers?.['openai-codex']) {
      return 'openai-codex';
    }
    return undefined;
  });
  const tasksExpandedRef = useRef<(() => void) | null>(null);
  const [showTelemetryDetails, setShowTelemetryDetails] = useState(false);
  const [inlineOverlay, setInlineOverlay] = useState<InlineOverlay | null>(null);
  const [reasoningEffort, setReasoningEffort] = useState<'off' | 'minimal' | 'low' | 'medium' | 'high'>(() => {
    // Use config reasoning effort, or auto-detect from model
    if (config.reasoningEffort) return config.reasoningEffort;
    return modelSupportsReasoning(config.model) ? 'high' : 'off';
  });

  const {
    messages,
    isLoading,
    error,
    timelineEvents,
    sessionTokens,
    contextUsage,
    contextStatus,
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
    reasoningEffortOverride: reasoningEffort,
  });

  // Handle pending questions from question tool
  const { pendingQuestion, answer: answerQuestion, skip: skipQuestion } = useQuestions({
    sessionId,
  });

  // Auto-load todos when agent creates them
  const { todos, counts: todoCounts } = useTodos({
    sessionId,
  });


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
  }, [resetPlanExit]);

  // Open inline question overlay when a pending question arrives
  React.useEffect(() => {
    const needsQuestionOverlay =
      pendingQuestion &&
      (!(inlineOverlay && inlineOverlay.kind === 'question' && inlineOverlay.question.id === pendingQuestion.id));

    if (needsQuestionOverlay) {
      const q: Question = {
        id: pendingQuestion.id,
        question: pendingQuestion.question,
        header: pendingQuestion.header,
        options: pendingQuestion.options,
        allowMultiple: pendingQuestion.allowMultiple,
        allowCustom: pendingQuestion.allowCustom,
      };
      setInlineOverlay({
        kind: 'question',
        question: q,
        onAnswer: (answers) => {
          answerQuestion(answers);
          setInlineOverlay(null);
        },
        onSkip: () => {
          skipQuestion();
          setInlineOverlay(null);
        },
      });
    }
    if (!pendingQuestion && inlineOverlay?.kind === 'question') {
      setInlineOverlay(null);
    }
  }, [pendingQuestion, inlineOverlay, answerQuestion, skipQuestion]);

  // Handle slash commands - execute directly without messaging agent
  const handleCommand = useCallback(async (command: Command) => {
    switch (command.action) {
      // Session commands
      case 'session:new':
      case 'session:clear': {
        // Clear terminal screen and scrollback to prevent text overflow
        if (stdout) {
          stdout.write('\x1b[2J\x1b[3J\x1b[H');
        }
        clear();
        setShowSplash(true);
        break;
      }
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
            // No sessions to show
          } else {
            setAvailableSessions(sessionsWithMessages);
            setInlineOverlay({
              kind: 'history',
              sessions: sessionsWithMessages,
              onSelect: (sessionId) => {
                loadSession(sessionId);
                setInlineOverlay(null);
              },
              onDelete: (sessionId) => {
                import('@stratuscode/storage').then(({ deleteSession }) => {
                  deleteSession(sessionId);
                  setAvailableSessions(prev => prev.filter(s => s.id !== sessionId));
                  setInlineOverlay(current => {
                    if (current?.kind === 'history') {
                      return { ...current, sessions: current.sessions.filter(s => s.id !== sessionId) };
                    }
                    return current;
                  });
                });
              },
              onClose: () => setInlineOverlay(null),
            });
          }
        } catch (err) {
          // Failed to load session history
        }
        break;

      // Mode commands
      case 'mode:plan':
        setAgent('plan');
        break;
      case 'mode:build':
        setAgent('build');
        break;
      case 'mode:compact':
        setCompactView(prev => !prev);
        break;

      // Tool commands - execute directly
      case 'tool:codesearch': {
        // If command has args, execute search directly
        const searchQuery = command.args?.[0];
        if (searchQuery) {
          await executeTool('codesearch', { query: searchQuery });
        }
        break;
      }
      case 'tool:reindex': {
        await executeTool('codesearch', { query: '__reindex__', reindex: true });
        break;
      }
      case 'tool:todos': {
        if (tasksExpandedRef.current) {
          tasksExpandedRef.current();
        }
        break;
      }
      case 'tool:revert': {
        await executeTool('revert', {});
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

        } catch {
          // LSP query failed
        }
        break;
      }

      // Settings commands
      case 'settings:model':
        setInlineOverlay({
          kind: 'model',
          entries: buildModelEntries(config),
          currentModel: activeModel,
          onSelect: (model, providerKey) => {
            setActiveModel(model);
            setActiveProvider(providerKey);
            // Auto-enable/disable reasoning when switching models
            const supports = modelSupportsReasoning(model);
            setReasoningEffort(supports ? 'medium' : 'off');
            setInlineOverlay(null);
          },
          onClose: () => setInlineOverlay(null),
        });
        break;
      case 'settings:theme':
        break;
      case 'settings:config':
        break;

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
        break;

      default:
        break;
    }
  }, [clear, executeTool, loadSession, config, todoCounts, projectDir, sessionId, compactView, activeModel, agent]);

  // Handle global keyboard shortcuts
  useInput((input, key) => {
    // Inline overlays handle their own input
    if (inlineOverlay) {
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

    // Ctrl+C to cancel or exit
    if (input === 'c' && key.ctrl) {
      if (isLoading) {
        abort();
      } else {
        exit();
      }
    }

    if (input === 'i' && key.ctrl) {
      setShowTelemetryDetails(prev => !prev);
      return;
    }

    // Ctrl+R to cycle reasoning effort: off → low → medium → high → off
    if (input === 'r' && key.ctrl) {
      setReasoningEffort(prev => {
        const cycle: Array<'off' | 'low' | 'medium' | 'high'> = ['off', 'low', 'medium', 'high'];
        const idx = cycle.indexOf(prev as any);
        return cycle[(idx + 1) % cycle.length]!;
      });
      return;
    }

    // Ctrl+L to clear screen and return to splash
    if (input === 'l' && key.ctrl) {
      if (stdout) {
        stdout.write('\x1b[2J\x1b[3J\x1b[H');
      }
      clear();
      setShowSplash(true);
    }

    // Ctrl+N for new session — always available
    if (input === 'n' && key.ctrl) {
      if (stdout) {
        stdout.write('\x1b[2J\x1b[3J\x1b[H');
      }
      clear();
      setShowSplash(true);
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
      shortcutsPanelJustOpenedRef.current = true;
      setShowShortcutsPanel(true);
    }
  });

  const handleSubmit = useCallback(
    (text: string, attachments?: Attachment[]) => {
      if (text.trim() && !isLoading) {
        sendMessage(text, undefined, undefined, attachments);
      }
    },
    [sendMessage, isLoading]
  );

  // Show splash screen until first message (unless an overlay is open)
  if (showSplash && messages.length === 0 && !inlineOverlay && !showShortcutsPanel) {
    const inputWidth = Math.min((stdout?.columns ?? 120) - 4, 100);

    return (
      <Box flexDirection="column" flexGrow={1} alignItems="center">
        {/* Top spacer — pushes logo to visual center (slightly above midpoint) */}
        <Box flexGrow={2} />

        {/* Logo + version info */}
        <SplashScreen
          version="0.1.0"
          projectDir={projectDir}
          model={activeModel}
        />

        {/* Bottom spacer */}
        <Box flexGrow={3} />

        {/* Centered input box */}
        <Box width={centerWidth} paddingBottom={1} alignSelf="center">
          <UnifiedInput
            onSubmit={(text, attachments) => {
              setShowSplash(false);
              sendMessage(text, undefined, undefined, attachments);
            }}
            onCommand={handleCommand}
            placeholder="What would you like to build?"
            showStatus={true}
            agent={agent}
            model={activeModel}
            tokens={tokens}
            sessionTokens={sessionTokens}
            contextUsage={contextUsage}
            contextStatus={contextStatus}
            showTelemetryDetails={showTelemetryDetails}
            isLoading={false}
            projectDir={projectDir}
            inlineOverlay={inlineOverlay}
            reasoningEffort={reasoningEffort}
          />
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* Main content area - shortcuts panel or chat */}
      <Box flexGrow={1} flexDirection="column">
        {showShortcutsPanel ? (
          /* Shortcuts reference panel */
          <Box flexDirection="column" flexGrow={1} paddingLeft={gutter} paddingRight={gutter}>
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
              <Text color={colors.text}><Text color={colors.secondary} bold>{process.platform === 'darwin' ? '⌃R       ' : 'Ctrl+R   '}</Text> Cycle reasoning effort (off/low/med/high)</Text>
              <Text color={colors.text}><Text color={colors.secondary} bold>{process.platform === 'darwin' ? '⌃T       ' : 'Ctrl+T   '}</Text> Toggle todo list</Text>
              <Text color={colors.text}><Text color={colors.secondary} bold>Enter    </Text> Toggle reasoning block</Text>
            </Box>
            <Box marginTop={1}>
              <Text color={colors.textDim}>Press any key to close</Text>
            </Box>
          </Box>
        ) : (
          /* Normal chat view — Static messages + dynamic bottom */
          <Box flexDirection="column" flexGrow={1}>
            <Chat
              timelineEvents={timelineEvents}
              isLoading={isLoading}
              gutter={gutter}
              compactView={compactView}
              onSubmit={handleSubmit}
              onCommand={handleCommand}
              error={error}
            />
          </Box>
        )}
      </Box>

      {/* -- Pinned bottom section: plan actions + input -- */}

      {/* Plan actions */}
      {shouldShowPlanActions && (
        <Box justifyContent="center" paddingX={1}>
          <Box width={contentWidth}>
            <PlanActions
              onAcceptAndBuild={handleAcceptAndBuild}
              onKeepPlanning={handleKeepPlanning}
            />
          </Box>
        </Box>
      )}

      {/* Combined input and status bar -- always at very bottom */}
      <Box justifyContent="center" paddingY={1}>
        <Box width={centerWidth}>
          <UnifiedInput
            onSubmit={handleSubmit}
            onCommand={handleCommand}
            showStatus={true}
            agent={agent}
            model={activeModel}
            tokens={tokens}
            sessionTokens={sessionTokens}
            contextUsage={contextUsage}
            showTelemetryDetails={showTelemetryDetails}
            isLoading={isLoading}
            todos={todos}
            onToggleTasks={tasksExpandedRef}
            projectDir={projectDir}
            inlineOverlay={inlineOverlay}
            reasoningEffort={reasoningEffort}
          />
        </Box>
      </Box>
    </Box>
  );
}
