/**
 * UnifiedInput Component
 *
 * A single input component used on both the splash screen and chat view.
 * Integrates: input field, inline command palette, task strip, and status bar
 * — all within one bordered box.
 *
 * Paste regions are tracked inline using marker characters:
 *   \uFFF0 ... \uFFF1  = pasted text block (displayed as [Pasted ~N lines])
 *   \uFFFC              = image placeholder  (displayed as [Image])
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import chalk from 'chalk';
import { CommandPaletteInline, getCommandResultCount, getCommandAtIndex } from './CommandPalette';
import { FileMentionPalette, getFileResultCount, getFileAtIndex } from './FileMentionPalette';
import { ModelPickerInline, type ModelEntry } from './ModelPickerInline';
import { SessionHistoryInline, type SessionInfo } from './SessionHistoryInline';
import { QuestionPromptInline, type Question } from './QuestionPromptInline';
import type { Command } from '../commands/registry';
import type { TokenUsage } from '@stratuscode/shared';
import type { TodoItem } from '../hooks/useTodos';
import { colors, getAgentColor, getStatusColor } from '../theme/colors';
import { icons, getStatusIcon } from '../theme/icons';
import { usePaste, readClipboardImage } from '../hooks/usePaste';
import { useCallback } from 'react';

const CODE_COLOR = '#8642EC';

// Marker characters embedded in the value string
const PASTE_START = '\uFFF0';
const PASTE_END = '\uFFF1';
const IMAGE_MARKER = '\uFFFC';

// Thresholds for collapsing pasted text
const PASTE_LINE_THRESHOLD = 3;
const PASTE_CHAR_THRESHOLD = 150;

// ============================================
// Types
// ============================================

export interface Attachment {
  type: 'image';
  data: string; // base64
  mime?: string;
}

type InlineOverlay =
  | {
      kind: 'model';
      entries: ModelEntry[];
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

export interface UnifiedInputProps {
  onSubmit: (text: string, attachments?: Attachment[]) => void;
  onCommand?: (command: Command) => void;
  placeholder?: string;
  disabled?: boolean;
  // Status bar options
  showStatus?: boolean;
  agent?: string;
  model?: string;
  tokens?: TokenUsage;
  sessionTokens?: TokenUsage;
  contextUsage?: { used: number; limit: number; percent: number };
  contextStatus?: string | null;
  showTelemetryDetails?: boolean;
  isLoading?: boolean;
  // Tasks
  todos?: TodoItem[];
  /** Ref to expose toggle function for /todos command */
  onToggleTasks?: React.MutableRefObject<(() => void) | null>;
  /** Project directory for @ file mentions */
  projectDir?: string;
  /** Optional fixed width for centering calculations */
  width?: number;
  /** Inline overlay rendered above the prompt */
  inlineOverlay?: InlineOverlay | null;
  /** Current reasoning effort level */
  reasoningEffort?: 'off' | 'minimal' | 'low' | 'medium' | 'high';
}

// ============================================
// Display helpers
// ============================================

function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + '…';
}

interface DisplayResult {
  display: string;
  cursorInDisplay: number;
  /** Maps display char index → color key */
  colorRanges: Array<{ start: number; end: number; color: 'paste' | 'image' }>;
}

/**
 * Build the display string from the raw value, collapsing paste regions
 * and replacing image markers. Also maps the value-space cursor to display-space.
 */
function computeDisplay(value: string, valueCursor: number): DisplayResult {
  let display = '';
  let cursorInDisplay = 0;
  let cursorSet = false;
  const colorRanges: DisplayResult['colorRanges'] = [];
  let i = 0;

  while (i < value.length) {
    // Set cursor position when we reach the cursor index in the value
    if (!cursorSet && i >= valueCursor) {
      cursorInDisplay = display.length;
      cursorSet = true;
    }

    if (value[i] === PASTE_START) {
      const endIdx = value.indexOf(PASTE_END, i);
      if (endIdx === -1) { i++; continue; }
      const pasteText = value.slice(i + 1, endIdx);
      const lineCount = pasteText.split('\n').length;
      const isLarge = lineCount >= PASTE_LINE_THRESHOLD || pasteText.length >= PASTE_CHAR_THRESHOLD;
      const summary = isLarge
        ? `[Pasted ~${lineCount} lines]`
        : pasteText.replace(/\n/g, ' ');
      // Add space before marker if adjacent to non-space text
      if (display.length > 0 && display[display.length - 1] !== ' ' && isLarge) {
        display += ' ';
      }
      const start = display.length;
      display += summary;
      if (isLarge) {
        colorRanges.push({ start, end: display.length, color: 'paste' });
      }
      // Add space after marker if next char is non-space
      const nextChar = endIdx + 1 < value.length ? value[endIdx + 1] : null;
      if (isLarge && nextChar && nextChar !== ' ' && nextChar !== PASTE_START && nextChar !== IMAGE_MARKER) {
        display += ' ';
      }
      // If cursor is inside this paste region, place it at end of summary
      if (!cursorSet && valueCursor > i && valueCursor <= endIdx + 1) {
        cursorInDisplay = display.length;
        cursorSet = true;
      }
      i = endIdx + 1;
    } else if (value[i] === IMAGE_MARKER) {
      // Add space before marker if adjacent to non-space text
      if (display.length > 0 && display[display.length - 1] !== ' ') {
        display += ' ';
      }
      const start = display.length;
      display += '[Image]';
      colorRanges.push({ start, end: display.length, color: 'image' });
      // Add space after marker if next char is non-space
      const nextChar = i + 1 < value.length ? value[i + 1] : null;
      if (nextChar && nextChar !== ' ' && nextChar !== PASTE_START && nextChar !== IMAGE_MARKER && nextChar !== PASTE_END) {
        display += ' ';
      }
      i++;
    } else {
      display += value[i];
      i++;
    }
  }

  if (!cursorSet) {
    cursorInDisplay = display.length;
  }

  return { display, cursorInDisplay, colorRanges };
}

// ============================================
// Cursor navigation helpers (skip over markers)
// ============================================

function cursorLeft(value: string, pos: number): number {
  if (pos <= 0) return 0;
  const prev = pos - 1;
  // If stepping onto PASTE_END, jump to before PASTE_START
  if (value[prev] === PASTE_END) {
    const start = value.lastIndexOf(PASTE_START, prev);
    return start >= 0 ? start : prev;
  }
  return prev;
}

function cursorRight(value: string, pos: number): number {
  if (pos >= value.length) return value.length;
  // If stepping onto PASTE_START, jump past PASTE_END
  if (value[pos] === PASTE_START) {
    const end = value.indexOf(PASTE_END, pos);
    return end >= 0 ? end + 1 : pos + 1;
  }
  // If stepping onto IMAGE_MARKER, skip it
  if (value[pos] === IMAGE_MARKER) return pos + 1;
  return pos + 1;
}

function handleBackspace(value: string, pos: number): { newValue: string; newPos: number } | null {
  if (pos <= 0) return null;
  const prev = pos - 1;
  // Deleting back into a paste region → remove the whole region
  if (value[prev] === PASTE_END) {
    const start = value.lastIndexOf(PASTE_START, prev);
    if (start >= 0) {
      return { newValue: value.slice(0, start) + value.slice(pos), newPos: start };
    }
  }
  // Deleting an image marker
  if (value[prev] === IMAGE_MARKER) {
    return { newValue: value.slice(0, prev) + value.slice(pos), newPos: prev };
  }
  // Normal char
  return { newValue: value.slice(0, prev) + value.slice(pos), newPos: prev };
}

// ============================================
// Component
// ============================================

export function UnifiedInput({
  onSubmit,
  onCommand,
  placeholder,
  disabled = false,
  showStatus = false,
  agent = 'build',
  model = '',
  tokens = { input: 0, output: 0 },
  sessionTokens,
  contextUsage,
  contextStatus,
  showTelemetryDetails = false,
  isLoading = false,
  todos = [],
  onToggleTasks,
  projectDir,
  width,
  inlineOverlay,
  reasoningEffort,
}: UnifiedInputProps) {
  const { stdout } = useStdout();
  const [value, setValue] = useState('');
  const [cursorPos, setCursorPos] = useState(0);
  const [showCommandMenu, setShowCommandMenu] = useState(false);
  const [commandSelectedIndex, setCommandSelectedIndex] = useState(0);
  const [commandOffset, setCommandOffset] = useState(0);
  const [showFileMention, setShowFileMention] = useState(false);
  const [fileSelectedIndex, setFileSelectedIndex] = useState(0);
  const [tasksExpanded, setTasksExpanded] = useState(false);
  const [images, setImages] = useState<Array<{ data: string; mime: string }>>([]);

  // Paste buffer — accumulated text from bracketed paste sequences
  const pasteBufferRef = useRef('');

  // Refs for current value/cursor (needed inside paste finalization)
  const valueRef = useRef(value);
  const cursorRef = useRef(cursorPos);
  valueRef.current = value;
  cursorRef.current = cursorPos;

  const isSlashCommand = value.startsWith('/');
  const commandQuery = isSlashCommand ? value.slice(1) : '';
  const isDisabled = disabled || isLoading;
  const COMMAND_PAGE_SIZE = 12;

  // Finalize paste callback (used by usePaste onPasteEnd)
  const finalizePasteFromHook = useCallback(() => {
    const text = pasteBufferRef.current;
    pasteBufferRef.current = '';
    if (!text) return;

    setValue(prev => {
      const pos = cursorRef.current;

      // Merge: if cursor is right after a PASTE_END, append into that region
      if (pos > 0 && prev[pos - 1] === PASTE_END) {
        const newVal = prev.slice(0, pos - 1) + text + PASTE_END + prev.slice(pos);
        setCursorPos(pos - 1 + text.length + 1);
        return newVal;
      }

      // Merge: if cursor is right before a PASTE_START, prepend into that region
      if (pos < prev.length && prev[pos] === PASTE_START) {
        const newVal = prev.slice(0, pos) + PASTE_START + text + prev.slice(pos + 1);
        setCursorPos(pos + 1 + text.length);
        return newVal;
      }

      // New paste region — always wrap in markers so future chunks can merge
      const insertion = PASTE_START + text + PASTE_END;
      const newVal = prev.slice(0, pos) + insertion + prev.slice(pos);
      setCursorPos(pos + insertion.length);
      return newVal;
    });
  }, []);

  // Enable bracketed paste mode and detect paste sequences at raw stdin level
  const { pasteActiveRef } = usePaste({
    active: !isDisabled,
    onPasteEnd: finalizePasteFromHook,
  });

  // When an inline overlay is open, hide other palettes
  useEffect(() => {
    if (inlineOverlay) {
      setShowCommandMenu(false);
      setShowFileMention(false);
    }
  }, [inlineOverlay]);

  // Compute display from the raw value
  const { display: displayValue, cursorInDisplay: displayCursorPos, colorRanges } = useMemo(
    () => computeDisplay(value, cursorPos),
    [value, cursorPos]
  );

  // Count images in value (for building attachments on submit)
  const imageCount = useMemo(() => {
    let count = 0;
    for (const ch of value) { if (ch === IMAGE_MARKER) count++; }
    return count;
  }, [value]);

  // Extract @ mention query
  const atIndex = value.lastIndexOf('@');
  const fileMentionQuery = showFileMention && atIndex >= 0 ? value.slice(atIndex + 1) : '';

  // Reset command palette selection when query changes
  useEffect(() => {
    setCommandSelectedIndex(0);
    setCommandOffset(0);
  }, [commandQuery]);

  // Expose toggle function for /todos command
  useEffect(() => {
    if (onToggleTasks) {
      onToggleTasks.current = () => setTasksExpanded(prev => !prev);
      return () => { onToggleTasks.current = null; };
    }
  }, [onToggleTasks]);

  const defaultPlaceholder = showStatus
    ? (isLoading ? 'Processing...' : 'Type a message... (/ for commands)')
    : 'What would you like to build?';

  // Layout — derive from actual terminal width; the parent Box constrains us
  const terminalWidth = stdout?.columns ?? 80;
  const containerWidth = width ?? terminalWidth;
  // Reserve space for border (2) + paddingX (2) on each side
  const innerWidth = Math.max(10, containerWidth - 6);
  const wideLayout = containerWidth >= 60;

  // Task counts
  const completedCount = useMemo(() => todos.filter(t => t.status === 'completed').length, [todos]);
  const hasTodos = todos.length > 0;
  const collapsedTasks = useMemo(() => {
    if (!hasTodos) return { visible: [] as TodoItem[], hidden: 0 };
    const maxTasks = Math.max(1, Math.floor((innerWidth - 20) / 25));
    const visible = todos.slice(0, maxTasks);
    const hidden = todos.length - visible.length;
    return { visible, hidden };
  }, [todos, innerWidth, hasTodos]);

  const totalTokens = sessionTokens ?? tokens;
  const ctxPercent = contextUsage ? contextUsage.percent : undefined;

  // Flexible divider that fills available width
  const Divider = () => (
    <Box marginX={1} borderStyle="single" borderTop={true} borderBottom={false} borderLeft={false} borderRight={false} borderColor={colors.border} />
  );

  // --- Inline helpers ---

  const insertTextAt = (prev: string, pos: number, text: string) =>
    prev.slice(0, pos) + text + prev.slice(pos);

  const clearAll = () => {
    setValue('');
    setCursorPos(0);
    setShowCommandMenu(false);
    setShowFileMention(false);
    setFileSelectedIndex(0);
    setCommandSelectedIndex(0);
    setImages([]);
    pasteBufferRef.current = '';
  };

  // --- Input handler ---

  useInput((input, key) => {
    // Delegate all keys to active inline overlay
    if (inlineOverlay) {
      return;
    }

    // Ctrl+T to toggle tasks — always available
    if (input === 't' && key.ctrl && hasTodos) {
      setTasksExpanded(prev => !prev);
      return;
    }

    // Ctrl+V — paste image from clipboard
    if (input === 'v' && key.ctrl) {
      if (!isDisabled) {
        const image = readClipboardImage();
        if (image) {
          setImages(prev => [...prev, { data: image.data, mime: image.mime }]);
          setValue(prev => {
            const pos = cursorRef.current;
            const newVal = prev.slice(0, pos) + IMAGE_MARKER + prev.slice(pos);
            setCursorPos(pos + 1);
            return newVal;
          });
        }
      }
      return;
    }

    if (isDisabled) return;

    // In paste mode, Return is a literal newline — don't submit
    if (key.return && pasteActiveRef.current) {
      pasteBufferRef.current += '\n';
      return;
    }

    // Arrow keys (outside palette/mention)
    if (key.leftArrow && !showCommandMenu && !showFileMention) {
      setCursorPos(p => cursorLeft(value, p));
      return;
    }
    if (key.rightArrow && !showCommandMenu && !showFileMention) {
      setCursorPos(p => cursorRight(value, p));
      return;
    }

    // Ctrl+A — move to start
    if (input === 'a' && key.ctrl) { setCursorPos(0); return; }
    // Ctrl+E — move to end
    if (input === 'e' && key.ctrl) { setCursorPos(value.length); return; }

    // Ctrl+U — clear entire input
    if (input === 'u' && key.ctrl) { clearAll(); return; }

    // Ctrl+W — delete last word
    if (input === 'w' && key.ctrl) {
      setValue(prev => {
        const before = prev.slice(0, cursorPos);
        const after = prev.slice(cursorPos);
        const trimmed = before.trimEnd();
        const lastSpace = trimmed.lastIndexOf(' ');
        const newBefore = lastSpace >= 0 ? trimmed.slice(0, lastSpace + 1) : '';
        const newVal = newBefore + after;
        setCursorPos(newBefore.length);
        setShowCommandMenu(newVal.startsWith('/'));
        if (!newVal.includes('@')) setShowFileMention(false);
        return newVal;
      });
      return;
    }

    // --- File mention navigation ---
    if (showFileMention && projectDir) {
      if (key.escape) { setShowFileMention(false); return; }
      if (key.upArrow) { setFileSelectedIndex(i => Math.max(0, i - 1)); return; }
      if (key.downArrow) {
        const max = getFileResultCount(projectDir, fileMentionQuery) - 1;
        setFileSelectedIndex(i => Math.min(Math.max(0, max), i + 1));
        return;
      }
      if (key.tab || key.return) {
        const filePath = getFileAtIndex(projectDir, fileMentionQuery, fileSelectedIndex);
        if (filePath) {
          const before = value.slice(0, atIndex);
          const newVal = before + '@' + filePath + ' ';
          setValue(newVal);
          setCursorPos(newVal.length);
          setShowFileMention(false);
          setFileSelectedIndex(0);
        }
        return;
      }
      if (key.backspace || key.delete) {
        const result = handleBackspace(value, cursorPos);
        if (result) {
          setValue(result.newValue);
          setCursorPos(result.newPos);
          if (result.newValue.lastIndexOf('@') < 0) setShowFileMention(false);
          setFileSelectedIndex(0);
        }
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setValue(prev => {
          const newVal = insertTextAt(prev, cursorPos, input);
          setCursorPos(p => p + input.length);
          return newVal;
        });
        setFileSelectedIndex(0);
        return;
      }
      return;
    }

    // --- Command palette navigation ---
    if (showCommandMenu && isSlashCommand) {
      const total = getCommandResultCount(commandQuery);
      if (key.escape) { setShowCommandMenu(false); setValue(''); setCursorPos(0); setCommandOffset(0); return; }
      if (key.upArrow) {
        setCommandSelectedIndex(i => {
          const next = Math.max(0, i - 1);
          if (next < commandOffset) setCommandOffset(Math.max(0, next));
          return next;
        });
        return;
      }
      if (key.downArrow) {
        setCommandSelectedIndex(i => {
          const max = Math.max(0, total - 1);
          const next = Math.min(max, i + 1);
          if (next >= commandOffset + COMMAND_PAGE_SIZE) {
            setCommandOffset(Math.max(0, next - COMMAND_PAGE_SIZE + 1));
          }
          return next;
        });
        return;
      }
      if (key.return) {
        const cmd = getCommandAtIndex(commandQuery, commandSelectedIndex);
        if (cmd) handleCommandSelect(cmd);
        return;
      }
      const num = parseInt(input, 10);
      if (num >= 1 && num <= 9) {
        const target = commandOffset + (num - 1);
        const cmd = getCommandAtIndex(commandQuery, target);
        if (cmd) handleCommandSelect(cmd);
        return;
      }
      if (key.backspace || key.delete) {
        const result = handleBackspace(value, cursorPos);
        if (result) {
          setValue(result.newValue);
          setCursorPos(result.newPos);
          if (!result.newValue.startsWith('/')) setShowCommandMenu(false);
          setCommandSelectedIndex(0);
          setCommandOffset(0);
        }
        return;
      }
      if (input && !key.ctrl && !key.meta && !key.return) {
        setValue(prev => {
          const newVal = insertTextAt(prev, cursorPos, input);
          setCursorPos(p => p + input.length);
          return newVal;
        });
        setCommandSelectedIndex(0);
        setCommandOffset(0);
        return;
      }
      return;
    }

    // --- Return → submit ---
    if (key.return) {
      if (value === '/') return;
      // Build the submit text: remove paste markers (keep paste content), remove image markers
      const textContent = value
        .replace(/\uFFF0/g, '')
        .replace(/\uFFF1/g, '')
        .replace(/\uFFFC/g, '');
      const hasImages = images.length > 0;
      const hasText = textContent.trim().length > 0;

      if ((hasText || hasImages) && !isSlashCommand) {
        const imageAttachments: Attachment[] | undefined = hasImages
          ? images.map(img => ({ type: 'image' as const, data: img.data, mime: img.mime }))
          : undefined;
        onSubmit(textContent, imageAttachments);
        clearAll();
      }
      return;
    }

    // --- Backspace ---
    if (key.backspace || key.delete) {
      const result = handleBackspace(value, cursorPos);
      if (result) {
        // If an image marker was deleted, remove the corresponding image from the array
        if (value[cursorPos - 1] === IMAGE_MARKER) {
          // Count how many IMAGE_MARKERs are before cursorPos to find the index
          let idx = 0;
          for (let j = 0; j < cursorPos - 1; j++) {
            if (value[j] === IMAGE_MARKER) idx++;
          }
          setImages(prev => prev.filter((_, k) => k !== idx));
        }
        setValue(result.newValue);
        setCursorPos(result.newPos);
        setShowCommandMenu(result.newValue.startsWith('/'));
        if (!result.newValue.includes('@')) setShowFileMention(false);
      }
      return;
    }

    // --- Character input (including paste content) ---
    if (input && !key.ctrl && !key.meta) {
      // Strip any leftover escape sequence fragments that Ink didn't fully consume
      // (e.g., "200~" or "201~" from bracketed paste markers)
      const clean = input.replace(/\d*~$/g, (match) => {
        // Only strip if it looks like a CSI parameter suffix (digits + ~)
        return /^\d+~$/.test(match) ? '' : match;
      });

      // In paste mode — buffer everything for finalizePaste (called by usePaste onPasteEnd)
      if (pasteActiveRef.current) {
        if (clean) pasteBufferRef.current += clean;
        return;
      }

      if (!clean) return;

      // Normal typing
      setValue(prev => {
        const newVal = insertTextAt(prev, cursorPos, clean);
        setCursorPos(p => p + clean.length);
        if (newVal === '/' || newVal.startsWith('/')) {
          setShowCommandMenu(true);
          setCommandSelectedIndex(0);
        }
        if (clean === '@' && projectDir && !newVal.startsWith('/')) {
          setShowFileMention(true);
          setFileSelectedIndex(0);
        }
        return newVal;
      });
    }
  });

  // Handle command selection from inline palette
  const handleCommandSelect = (cmd: Command) => {
    if (onCommand) {
      const inputText = value.slice(1);
      const cmdName = cmd.name;
      const argText = inputText.startsWith(cmdName) ? inputText.slice(cmdName.length).trim() : '';
      const enrichedCmd = argText ? { ...cmd, args: [argText] } : cmd;
      onCommand(enrichedCmd);
    }
    setValue('');
    setCursorPos(0);
    setShowCommandMenu(false);
    setCommandSelectedIndex(0);
  };

  // --- Render ---

  // Build a single ANSI-colored string for the entire input display.
  // Using one string prevents Ink from wrapping each <Text> node independently,
  // which eliminates layout shifting on multi-line wraps.
  const renderedInput = useMemo(() => {
    if (!displayValue) return '';

    const chalkColor = (c: 'paste' | 'image' | 'normal' | 'slash') => {
      if (c === 'paste') return chalk.hex(colors.secondary);
      if (c === 'image') return chalk.hex(colors.warning);
      if (c === 'slash') return chalk.hex(colors.secondary);
      return chalk.hex(colors.text);
    };

    const baseColor: 'normal' | 'slash' = isSlashCommand ? 'slash' : 'normal';

    // Build a per-character color map
    const charColor = new Array<'paste' | 'image' | 'normal' | 'slash'>(displayValue.length).fill(baseColor);
    for (const r of colorRanges) {
      for (let j = r.start; j < r.end && j < displayValue.length; j++) {
        charColor[j] = r.color;
      }
    }

    // Build the string, inserting cursor and batching same-color runs
    let result = '';
    let i = 0;
    while (i < displayValue.length) {
      // Insert cursor character (inverse video)
      if (i === displayCursorPos && !isDisabled) {
        const cursorCh = displayValue[i]!;
        result += chalk.inverse(chalkColor(charColor[i]!)(cursorCh));
        i++;
        continue;
      }

      // Batch consecutive chars of the same color
      const color = charColor[i]!;
      let end = i + 1;
      while (end < displayValue.length && charColor[end] === color && end !== displayCursorPos) {
        end++;
      }
      result += chalkColor(color)(displayValue.slice(i, end));
      i = end;
    }

    // Cursor at end of string
    if (displayCursorPos >= displayValue.length && !isDisabled) {
      result += chalk.hex(colors.primary)('▎');
    }

    return result;
  }, [displayValue, displayCursorPos, colorRanges, isSlashCommand, isDisabled]);

  return (
    <Box flexDirection="column" width="100%">
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={colors.primary}
        width="100%"
      >
        {/* Expanded tasks (inside box, expands upward) */}
        {hasTodos && showStatus && !showCommandMenu && tasksExpanded && (
          <>
            <Box flexDirection="column" paddingX={1} paddingTop={1}>
              <Box>
                <Text color={colors.text} bold>Tasks </Text>
                <Text color={colors.completed}>{completedCount}</Text>
                <Text color={colors.textDim}>/{todos.length}</Text>
                <Text color={colors.textDim}> (Ctrl+T to collapse)</Text>
              </Box>
              {todos.map(todo => (
                <Box key={todo.id}>
                  <Text color={getStatusColor(todo.status)}>
                    {getStatusIcon(todo.status)}{' '}
                  </Text>
                  <Text
                    color={todo.status === 'completed' ? colors.textDim : colors.text}
                    strikethrough={todo.status === 'completed'}
                  >
                    {todo.content}
                  </Text>
                </Box>
              ))}
            </Box>
            <Divider />
          </>
        )}

        {/* Inline overlays (model picker, history, questions) */}
        {inlineOverlay && (
          <>
            <Box paddingX={1} paddingTop={1} paddingBottom={0}>
              {inlineOverlay.kind === 'model' && (
                <ModelPickerInline
                  entries={inlineOverlay.entries}
                  currentModel={inlineOverlay.currentModel}
                  onSelect={inlineOverlay.onSelect}
                  onClose={inlineOverlay.onClose}
                />
              )}
              {inlineOverlay.kind === 'history' && (
                <SessionHistoryInline
                  sessions={inlineOverlay.sessions}
                  onSelect={inlineOverlay.onSelect}
                  onDelete={inlineOverlay.onDelete}
                  onClose={inlineOverlay.onClose}
                />
              )}
              {inlineOverlay.kind === 'question' && (
                <QuestionPromptInline
                  question={inlineOverlay.question}
                  onAnswer={inlineOverlay.onAnswer}
                  onSkip={inlineOverlay.onSkip}
                />
              )}
            </Box>
            <Divider />
          </>
        )}

        {/* Inline command palette (when / is typed) */}
        {showCommandMenu && isSlashCommand && (
          <>
            <CommandPaletteInline
              query={commandQuery}
              selectedIndex={commandSelectedIndex}
              onSelect={handleCommandSelect}
              offset={commandOffset}
              onOffsetChange={setCommandOffset}
              pageSize={COMMAND_PAGE_SIZE}
            />
            <Divider />
          </>
        )}

        {/* File mention palette (when @ is typed) */}
        {showFileMention && projectDir && !showCommandMenu && (
          <>
            <FileMentionPalette
              query={fileMentionQuery}
              selectedIndex={fileSelectedIndex}
              projectDir={projectDir}
            />
            <Divider />
          </>
        )}

        {/* Task strip — collapsed only (inside box) */}
        {hasTodos && showStatus && !showCommandMenu && !tasksExpanded && (
          <>
            <Box paddingX={1} paddingY={0}>
              <Text color={colors.text} bold>Tasks </Text>
              <Text color={colors.completed}>{completedCount}</Text>
              <Text color={colors.textDim}>/{todos.length} </Text>
              <Text color={colors.textDim}>{icons.pipe} </Text>
              {collapsedTasks.visible.map(todo => (
                <Text key={todo.id}>
                  <Text color={getStatusColor(todo.status)}>
                    {getStatusIcon(todo.status)}{' '}
                  </Text>
                  <Text color={todo.status === 'completed' ? colors.textDim : colors.text}>
                    {truncate(todo.content, 20)}
                  </Text>
                  <Text color={colors.textDim}>{'  '}</Text>
                </Text>
              ))}
              {collapsedTasks.hidden > 0 && (
                <Text color={colors.textDim}>+{collapsedTasks.hidden} more</Text>
              )}
            </Box>
            <Divider />
          </>
        )}

        {/* Input row */}
        <Box paddingX={1} paddingY={1} minHeight={3}>
          <Text color={colors.primary} bold>{'› '}</Text>
          {displayValue ? (
            <Text wrap="wrap">{renderedInput}</Text>
          ) : (
            <>
              {!isDisabled && <Text color={colors.primary}>▎</Text>}
              <Text color={colors.textDim}>{placeholder || defaultPlaceholder}</Text>
            </>
          )}
        </Box>

        {/* Status bar (optional) */}
        {showStatus && (() => {
          // Context bar visual
          const barWidth = Math.max(8, Math.min(20, Math.floor(innerWidth / 5)));
          const pct = ctxPercent ?? 0;
          const filled = Math.round((pct / 100) * barWidth);
          const empty = barWidth - filled;
          const barColor = pct > 90 ? colors.error : pct > 70 ? colors.warning : colors.primaryDim;
          const emptyColor = '#1E293B'; // Slate 800 — visible but subtle

          // Mode badge
          const modeColor = getAgentColor(agent);
          const modeName = agent.toUpperCase();

          // Thinking label
          const thinkingLabel = reasoningEffort && reasoningEffort !== 'off'
            ? `Thinking ${reasoningEffort.toUpperCase()}`
            : '';

          return (
            <Box paddingX={1} paddingBottom={0} paddingTop={0} flexDirection="column">
              {/* Row 1: Mode + model + thinking */}
              <Box justifyContent="space-between">
                <Box>
                  <Text backgroundColor={modeColor} color="#000000" bold>{` ${modeName} `}</Text>
                  {isLoading && <Text color={colors.secondary}> ●</Text>}
                  <Text color={colors.textDim}> │ </Text>
                  <Text color={colors.textMuted}>{model || 'default'}</Text>
                  {thinkingLabel ? (
                    <>
                      <Text color={colors.textDim}> │ </Text>
                      <Text color={colors.secondary}>{thinkingLabel}</Text>
                    </>
                  ) : null}
                </Box>
                <Box>
                  <Text color={colors.textDim}>↑</Text>
                  <Text color={colors.textMuted}>{formatNumber(totalTokens.input)}</Text>
                  <Text color={colors.textDim}> ↓</Text>
                  <Text color={colors.textMuted}>{formatNumber(totalTokens.output)}</Text>
                </Box>
              </Box>

              {/* Row 2: Context memory bar */}
              <Box justifyContent="space-between">
                <Box>
                  <Text color={colors.textDim}>Context </Text>
                  <Text color={barColor}>{'▇'.repeat(filled)}</Text>
                  <Text color={emptyColor}>{'▇'.repeat(empty)}</Text>
                  <Text color={colors.textDim}> {pct}%</Text>
                  {contextStatus && <Text color={colors.textDim}> {contextStatus}</Text>}
                </Box>
                {contextUsage && showTelemetryDetails && (
                  <Text color={colors.textDim}>
                    {formatNumber(contextUsage.used)}/{formatNumber(contextUsage.limit)}
                  </Text>
                )}
              </Box>
            </Box>
          );
        })()}
      </Box>
    </Box>
  );
}
