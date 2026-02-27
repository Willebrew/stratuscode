'use client';

import clsx from 'clsx';

import { useState, useEffect, useRef, memo } from 'react';
import { ChevronRight, Loader2, Check, X, Wrench, HelpCircle, FileCode, Rocket, Download, Paperclip, Copy, ThumbsUp, ThumbsDown, RotateCcw, FileEdit, FolderOpen, Search, Terminal, Eye, GitBranch, ClipboardList, Send } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { MarkdownRenderer } from './markdown-renderer';
import { InlineDiff } from './inline-diff';
import { AgentThinkingIndicator, WaveText } from './agent-thinking-indicator';
import { AnimatedStratusLogo } from './animated-stratus-logo';
import type { ChatMessage, ToolCallInfo, MessagePart, TodoItem } from '@/hooks/use-convex-chat';

type GroupedPart = { part: MessagePart; idx: number; nestedParts?: MessagePart[]; statusText?: string; subagentId?: string };

// ── Module-level tool display config (shared by ToolChain + ToolCallCard) ──

const TOOL_DISPLAY_NAMES: Record<string, string> = {
  write_to_file: 'Writing File',
  write: 'Writing File',
  edit: 'Editing File',
  multi_edit: 'Editing Files',
  read_file: 'Reading File',
  read: 'Reading File',
  ls: 'Listing Directory',
  grep: 'Searching Code',
  glob: 'Finding Files',
  bash: 'Running Command',
  websearch: 'Searching Web',
  webfetch: 'Fetching Page',
  lsp: 'Code Intelligence',
  git_commit: 'Committing Changes',
  git_push: 'Pushing to Remote',
  pr_create: 'Creating Pull Request',
  todoread: 'Checking Tasks',
  todowrite: 'Updating Tasks',
  question: 'Asking Question',
  plan_enter: 'Entering Plan Mode',
  plan_exit: 'Plan Approval',
  task: 'Delegating Task',
  delegate_to_explore: 'Exploring Codebase',
  delegate_to_general: 'Running Subagent',
};

const TOOL_ICON_NAMES: Record<string, string> = {
  write_to_file: 'FileCode',
  write: 'FileCode',
  edit: 'FileEdit',
  multi_edit: 'FileEdit',
  read_file: 'Eye',
  read: 'Eye',
  ls: 'FolderOpen',
  grep: 'Search',
  glob: 'Search',
  bash: 'Terminal',
  websearch: 'Search',
  webfetch: 'Download',
  lsp: 'FileCode',
  git_commit: 'GitBranch',
  git_push: 'GitBranch',
  pr_create: 'GitBranch',
  todoread: 'ClipboardList',
  todowrite: 'ClipboardList',
  question: 'HelpCircle',
  plan_enter: 'ClipboardList',
  plan_exit: 'Rocket',
  task: 'Send',
};

const ICON_COMPONENTS: Record<string, React.FC<{ className?: string }>> = {
  FileCode, FileEdit, Eye, FolderOpen, Search, Terminal, Download,
  GitBranch, ClipboardList, HelpCircle, Rocket, Send,
};

function getToolIcon(name: string, className = 'w-3 h-3'): React.ReactNode {
  const iconName = TOOL_ICON_NAMES[name];
  if (iconName) {
    const Icon = ICON_COMPONENTS[iconName];
    if (Icon) return <Icon className={className} />;
  }
  return <Wrench className={className} />;
}

function getToolDisplayName(toolCall: ToolCallInfo): string {
  if (!toolCall.name) return 'Preparing tool...';
  const baseName = TOOL_DISPLAY_NAMES[toolCall.name] || toolCall.name;
  try {
    const parsed = JSON.parse(toolCall.args);
    const filePath = parsed.file_path || parsed.path || parsed.filename;
    if (filePath) {
      const fileName = filePath.split('/').pop();
      return `${baseName} · ${fileName}`;
    }
    if (toolCall.name === 'bash' && parsed.command) {
      const cmd = parsed.command.length > 40 ? parsed.command.slice(0, 40) + '…' : parsed.command;
      return `${baseName} · ${cmd}`;
    }
    if ((toolCall.name === 'grep' || toolCall.name === 'glob') && parsed.pattern) {
      return `${baseName} · "${parsed.pattern}"`;
    }
  } catch { /* args might be partial JSON during streaming */ }
  return baseName;
}

// Simple tools that render as timeline chain items (single-line, no card body)
const CHAIN_TOOLS = new Set([
  'read_file', 'read', 'ls', 'grep', 'glob', 'bash',
  'websearch', 'webfetch', 'lsp',
  'git_commit', 'git_push', 'pr_create',
  'todoread', 'todowrite', 'plan_enter', 'task',
]);

type ChainSegment =
  | { type: 'chain'; items: GroupedPart[] }
  | { type: 'part'; item: GroupedPart };

function groupIntoChains(parts: GroupedPart[]): ChainSegment[] {
  const segments: ChainSegment[] = [];
  let currentChain: GroupedPart[] = [];

  const flushChain = () => {
    if (currentChain.length > 0) {
      segments.push({ type: 'chain', items: [...currentChain] });
      currentChain = [];
    }
  };

  for (const group of parts) {
    const part = group.part as any;

    if (part.type === 'tool_call') {
      const toolName = part.toolCall?.name || '';
      if (toolName === 'set_status') continue;
      if (CHAIN_TOOLS.has(toolName)) {
        currentChain.push(group);
      } else {
        // Everything else (write, edit, question, plan_exit, subagents) as full cards
        flushChain();
        segments.push({ type: 'part', item: group });
      }
    } else {
      flushChain();
      segments.push({ type: 'part', item: group });
    }
  }

  flushChain();
  return segments;
}

/**
 * Group a flat list of parts so that subagent content is nested inside
 * the corresponding delegate_to_* tool call. Handles nested subagents
 * (subagent spawning subagent) via a depth counter.
 */
/**
 * Group a flat list of parts so that subagent content is nested inside
 * the corresponding delegate_to_* tool call. Supports:
 * - Sequential subagents (one at a time)
 * - Parallel subagents (multiple delegate_to_* in one LLM response)
 * - Nested subagents (subagent spawning a child subagent)
 * - Race conditions (subagent_start arriving before its delegate_to_* tool call)
 */
function groupSubagentParts(parts: { part: MessagePart; idx: number }[]): GroupedPart[] {
  const grouped: GroupedPart[] = [];

  // Queue of delegate groups waiting for their subagent_start
  const pendingDelegates: GroupedPart[] = [];

  // Stack of active delegates (between subagent_start and subagent_end).
  const activeStack: GroupedPart[] = [];

  // Depth counter for truly nested child subagents (subagent inside subagent)
  let nestedChildDepth = 0;

  // Round-robin counter for distributing content across parallel subagents.
  // SAGE doesn't tell us which subagent owns a tool call, so we distribute
  // evenly across all active parallel subagents for balanced visuals.
  let parallelRR = 0;

  // Orphaned starts that arrived before their delegate_to_* (race condition)
  const orphanedStarts: { agentName?: string; subagentId?: string; statusText?: string }[] = [];

  for (const item of parts) {
    const part = item.part as any;

    // ── Inside a nested child subagent: pass everything through ──
    if (nestedChildDepth > 0 && activeStack.length > 0) {
      const active = activeStack[activeStack.length - 1]!;
      if (part.type === 'subagent_start') nestedChildDepth++;
      else if (part.type === 'subagent_end') nestedChildDepth--;
      active.nestedParts!.push(item.part);
      continue;
    }

    // ── delegate_to_* tool call ──
    if (part.type === 'tool_call' && part.toolCall?.name?.startsWith('delegate_to_')) {
      if (activeStack.length === 1) {
        // Inside exactly one active subagent → this is a CHILD delegation (nested)
        activeStack[0]!.nestedParts!.push(item.part);
      } else if (activeStack.length > 1) {
        // Multiple parallel subagents active → child of one of them (nest in round-robin target)
        const target = activeStack[parallelRR % activeStack.length]!;
        target.nestedParts!.push(item.part);
        parallelRR++;
      } else {
        // Top-level → new group (parallel sibling or first delegate)
        const group: GroupedPart = { ...item, nestedParts: [] };

        // Check for a matching orphaned start (race condition)
        const agentSuffix = part.toolCall.name.replace('delegate_to_', '');
        let matchedOrphan = false;
        for (let i = 0; i < orphanedStarts.length; i++) {
          const os = orphanedStarts[i]!;
          if (os.subagentId?.startsWith(agentSuffix) || os.agentName === agentSuffix) {
            group.statusText = os.statusText;
            group.subagentId = os.subagentId;
            activeStack.push(group);
            orphanedStarts.splice(i, 1);
            matchedOrphan = true;
            break;
          }
        }

        if (!matchedOrphan) {
          pendingDelegates.push(group);
        }
        grouped.push(group);
      }
      continue;
    }

    // ── subagent_start ──
    if (part.type === 'subagent_start') {
      if (pendingDelegates.length > 0) {
        // Match to the next pending delegate (FIFO)
        const delegate = pendingDelegates.shift()!;
        delegate.statusText = part.statusText;
        delegate.subagentId = part.subagentId;
        activeStack.push(delegate);
      } else if (activeStack.length === 1) {
        // No pending delegates + exactly one active → nested child subagent
        activeStack[0]!.nestedParts!.push(item.part);
        nestedChildDepth = 1;
      } else {
        // No pending delegates + 0 or 2+ active → orphaned start (race condition)
        orphanedStarts.push({ agentName: part.agentName, subagentId: part.subagentId, statusText: part.statusText });
      }
      continue;
    }

    // ── subagent_end ──
    if (part.type === 'subagent_end') {
      // Find and close the matching active delegate
      const endId = part.subagentId;
      let closedIdx = -1;
      if (endId) {
        closedIdx = activeStack.findIndex(g => g.subagentId === endId);
      }
      if (closedIdx === -1 && activeStack.length > 0) {
        closedIdx = 0; // FIFO fallback for legacy messages without subagentId
      }
      if (closedIdx >= 0) {
        activeStack.splice(closedIdx, 1);
      }
      continue;
    }

    // ── Regular content (text, reasoning, tool_call, etc.) ──
    if (activeStack.length === 1) {
      // Exactly one active subagent → nest inside it
      activeStack[0]!.nestedParts!.push(item.part);
    } else if (activeStack.length > 1) {
      // Multiple parallel subagents → distribute round-robin
      const target = activeStack[parallelRR % activeStack.length]!;
      target.nestedParts!.push(item.part);
      parallelRR++;
    } else if (pendingDelegates.length > 0) {
      // delegate_to_* was seen but subagent_start hasn't arrived yet (race condition).
      // Route content into the pending delegate so tool calls aren't orphaned at top-level.
      pendingDelegates[0]!.nestedParts!.push(item.part);
    } else {
      // Top-level
      grouped.push(item);
    }
  }

  return grouped;
}

interface AttachmentInfo {
  _id: string;
  filename: string;
  mimeType: string;
  size: number;
}

interface MessageBubbleProps {
  index: number;
  isLast?: boolean;
  message: ChatMessage;
  todos?: TodoItem[];
  sessionId?: string;
  attachments?: AttachmentInfo[];
  onSend?: (message: string) => void;
  onAnswer?: (answer: string) => void;
}

// Module-level timer stores — persist across component remounts
const _frozenTimers = new Map<string, number>();   // messageId → frozen seconds
const _startTimes = new Map<string, number>();     // messageId → Date.now() when thinking started
const _lastTicks = new Map<string, number>();      // messageId → last displayed seconds value

export const MessageBubble = memo(function MessageBubble({ index, isLast, message, todos, sessionId, attachments, onSend, onAnswer }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const [isCopied, setIsCopied] = useState(false);
  const [thumbState, setThumbState] = useState<'up' | 'down' | null>(null);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  if (isUser) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="flex justify-end"
      >
        <div className="max-w-[85%] sm:max-w-[70%]">
          {attachments && attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-1.5 justify-end">
              {attachments.map((a) => (
                <span
                  key={a._id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/10 border border-white/[0.08] text-muted-foreground text-[11px]"
                >
                  <Paperclip className="w-3 h-3" />
                  <span className="max-w-[150px] truncate">{a.filename}</span>
                </span>
              ))}
            </div>
          )}
          <div className="rounded-2xl px-4 sm:px-5 py-3 sm:py-3.5 bg-foreground text-background">
            <MarkdownRenderer content={message.content} />
          </div>
        </div>
      </motion.div>
    );
  }

  // Agent message — render parts in chronological order, no avatar
  // Pre-process: merge all reasoning parts into a single block at the front,
  // and concatenate all text parts into one. Some models interleave reasoning
  // and text tokens which creates fragmented parts — merge them for clean display.
  const questionTexts = new Set<string>();
  const seenQuestionKeys = new Set<string>();
  const deduplicatedParts: { part: MessagePart; idx: number }[] = [];

  // Collect question texts for duplicate filtering
  for (const part of message.parts) {
    if (part.type === 'tool_call' && part.toolCall.name === 'question') {
      try {
        const parsed = JSON.parse(part.toolCall.args);
        if (parsed.question) questionTexts.add(parsed.question);
      } catch { /* ignore */ }
    }
  }

  // Merge all reasoning into one block at the top, then preserve
  // the original interleaved order of text / tool_calls / subagents.
  // Consecutive text parts are merged but text-tool-text stays in order.
  let mergedReasoning = '';
  let nextIdx = 0;
  let pendingText = '';

  const flushText = () => {
    if (!pendingText.trim()) { pendingText = ''; return; }
    // Check if this text duplicates a question tool call
    let isDup = false;
    if (questionTexts.size > 0) {
      const trimmed = pendingText.trim();
      for (const qt of questionTexts) {
        if (trimmed.includes(qt) || qt.includes(trimmed)) { isDup = true; break; }
      }
    }
    if (!isDup) {
      deduplicatedParts.push({ part: { type: 'text', content: pendingText }, idx: nextIdx++ });
    }
    pendingText = '';
  };

  for (let i = 0; i < message.parts.length; i++) {
    const part = message.parts[i]!;
    if (part.type === 'reasoning') {
      mergedReasoning += (mergedReasoning ? '\n' : '') + part.content;
    } else if (part.type === 'text') {
      if (isErrorJSON(part.content)) continue;
      pendingText += part.content;
    } else {
      // Non-text/reasoning part — flush any pending text first to preserve order
      flushText();
      // Skip duplicate question tool calls
      if (part.type === 'tool_call' && (part as any).toolCall?.name === 'question') {
        try {
          const parsed = JSON.parse((part as any).toolCall.args);
          const key = parsed.question || '';
          if (seenQuestionKeys.has(key)) continue;
          seenQuestionKeys.add(key);
        } catch { /* ignore */ }
      }
      deduplicatedParts.push({ part, idx: nextIdx++ });
    }
  }
  flushText(); // flush any trailing text

  // Prepend merged reasoning at the top
  if (mergedReasoning.trim()) {
    deduplicatedParts.unshift({ part: { type: 'reasoning', content: mergedReasoning }, idx: -1 });
  }

  const hasNonReasoningParts = message.parts.some(p => p.type !== 'reasoning');
  const hasReasoningParts = message.parts.some(p => p.type === 'reasoning');
  const isThinkingCompleted = !message.streaming || hasNonReasoningParts;
  const isGeneratingContent = message.streaming && hasNonReasoningParts;

  // Stable key for timer Map, avoiding the "streaming" temporary ID
  const timerKey = sessionId ? `${sessionId}-${index}` : index.toString();

  // --- Thinking timer ---
  // Three sources of truth, in priority order:
  // 1. message.thinkingSeconds (from DB or streaming state) — authoritative
  // 2. _frozenTimers (frozen locally when thinking completed during streaming)
  // 3. Live counting from _startTimes (while thinking is in progress)
  const isThinkingStage = message.stage === 'thinking';

  const [thinkingSeconds, setThinkingSeconds] = useState(() => {
    if (message.thinkingSeconds !== undefined && message.thinkingSeconds > 0) return message.thinkingSeconds;
    // Floor at 1 for any frozen/ticked value so we never show "0s"
    const frozen = _frozenTimers.get(timerKey);
    if (frozen !== undefined && frozen > 0) return frozen;
    const ticked = _lastTicks.get(timerKey);
    if (ticked !== undefined && ticked > 0) return ticked;
    return 0;
  });

  // Record when thinking starts
  if (!isThinkingCompleted && !_startTimes.has(timerKey) && (hasReasoningParts || isThinkingStage)) {
    _startTimes.set(timerKey, Date.now());
  }

  // Freeze when thinking completes (during streaming or on persisted message)
  if (isThinkingCompleted && hasReasoningParts && !_frozenTimers.has(timerKey)) {
    if (message.thinkingSeconds !== undefined && message.thinkingSeconds > 0) {
      _frozenTimers.set(timerKey, message.thinkingSeconds);
    } else if (_startTimes.has(timerKey)) {
      const elapsed = Math.max(
        1, // Never show "0s"
        _lastTicks.get(timerKey) ?? 0,
        Math.round((Date.now() - _startTimes.get(timerKey)!) / 1000)
      );
      _frozenTimers.set(timerKey, elapsed);
    }
  }

  useEffect(() => {
    // Source 1: message.thinkingSeconds from DB/streaming — always wins
    if (message.thinkingSeconds !== undefined && message.thinkingSeconds > 0) {
      _frozenTimers.set(timerKey, message.thinkingSeconds);
      setThinkingSeconds(message.thinkingSeconds);
      return;
    }

    // Source 2: locally frozen value (already floored at 1 when frozen)
    const frozen = _frozenTimers.get(timerKey);
    if (frozen !== undefined && frozen > 0) {
      setThinkingSeconds(frozen);
      return;
    }

    // Source 3: live counting while thinking is active
    const start = _startTimes.get(timerKey);
    if (!start || isThinkingCompleted) {
      // Thinking completed but no frozen value and no DB value — the model
      // thought for less than 1s. Show 1s so we never display "0s".
      if (isThinkingCompleted && hasReasoningParts) {
        setThinkingSeconds(1);
      }
      return;
    }

    const tick = () => {
      const elapsed = Math.round((Date.now() - start) / 1000);
      _lastTicks.set(timerKey, elapsed);
      setThinkingSeconds(elapsed);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [timerKey, isThinkingCompleted, message.thinkingSeconds, isThinkingStage, hasReasoningParts]);

  // Pick a fun random phrase for the generation indicator — stable per message
  const generatingPhrase = (() => {
    const phrases = [
      'Cooking...', 'Stratifying...', 'Brewing...', 'Conjuring...',
      'Crafting...', 'Weaving...', 'Forging...', 'Assembling...',
      'Composing...', 'Manifesting...', 'Sculpting...', 'Synthesizing...',
      'Channeling...', 'Architecting...', 'Distilling...', 'Materializing...',
      'Orchestrating...', 'Calibrating...', 'Rendering...', 'Transmitting...',
      'Deploying thoughts...', 'Spinning up...', 'Mixing ingredients...',
      'Connecting neurons...', 'Warming up the GPU...', 'Almost there...',
      'Working some magic...', 'On it...',
    ];
    // Use both message ID and session ID for better entropy
    const seed = `${message.id}-${sessionId || index}`;
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = ((hash << 5) - hash) + seed.charCodeAt(i);
      hash |= 0;
    }
    return phrases[Math.abs(hash) % phrases.length]!;
  })();

  return (
    <div className="flex flex-col gap-2 relative group pb-1">
      {/* Show stage indicator: booting → waiting → thinking.
          Disappears once reasoning parts arrive (AgentThinkingIndicator takes over). */}
      <AnimatePresence mode="popLayout">
        {message.streaming && !hasReasoningParts && !hasNonReasoningParts && (
          <motion.div
            key={message.stage === 'booting' ? 'booting' : message.stage === 'thinking' ? 'thinking' : 'waiting'}
            initial={{ opacity: 0, filter: 'blur(4px)', scale: 0.95 }}
            animate={{ opacity: 1, filter: 'blur(0px)', scale: 1 }}
            exit={{ opacity: 0, filter: 'blur(4px)', scale: 1.05 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="flex items-center gap-2 min-h-[32px]"
          >
            <AnimatedStratusLogo mode={isThinkingStage ? 'thinking' : 'generating'} size={20} />
            <span className="text-[13px] text-muted-foreground inline-flex items-center gap-1.5">
              {message.stage === 'booting' ? (
                <WaveText text="Setting up environment..." />
              ) : isThinkingStage ? (
                <>
                  <WaveText text="Thinking" />
                  {thinkingSeconds > 0 && <span className="font-mono text-[11px] tabular-nums opacity-60">{thinkingSeconds}s</span>}
                </>
              ) : (
                <WaveText text={generatingPhrase} />
              )}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Render parts — group simple tool calls into timeline chains */}
      {groupIntoChains(groupSubagentParts(deduplicatedParts)).map((segment, segIdx) =>
        segment.type === 'chain' ? (
          <ToolChain key={`chain-${segIdx}`} items={segment.items} />
        ) : (
          <MessagePartView key={segment.item.idx} part={segment.item.part} nestedParts={segment.item.nestedParts} statusText={segment.item.statusText} subagentId={segment.item.subagentId} allParts={deduplicatedParts.map(d => d.part)} todos={todos} sessionId={sessionId} onSend={onSend} onAnswer={onAnswer} isStreaming={message.streaming} messageId={message.id} thinkingSeconds={thinkingSeconds} />
        )
      )}

      {/* Show generation swoop logo under the response if streaming content */}
      {isGeneratingContent && (
        <div className="mt-2 flex items-center gap-2 text-foreground/40 min-h-[32px]">
          <AnimatedStratusLogo mode="generating" size={20} />
          <span className="text-sm font-medium">{generatingPhrase}</span>
        </div>
      )}

      {/* Show idle logo and action buttons when response is fully complete */}
      {!isGeneratingContent && isThinkingCompleted && message.parts.length > 0 && (
        <div className="mt-2 flex items-center gap-3 min-h-[32px]">
          {/* Static logo at bottom left, exactly where generating logo was */}
          {isLast && (
            <div className="flex items-center gap-2 text-foreground/20 animate-fade-in shrink-0">
              <AnimatedStratusLogo mode="idle" size={20} />
            </div>
          )}

          {/* Action buttons sitting horizontally to the right of the logo space */}
          <div className="flex items-center gap-1.5 text-muted-foreground/40 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <button
              onClick={handleCopy}
              className="p-1.5 hover:bg-secondary/40 hover:text-foreground rounded-md transition-colors"
              title="Copy"
            >
              {isCopied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setThumbState(thumbState === 'up' ? null : 'up')}
              className={clsx("p-1.5 rounded-md transition-colors", thumbState === 'up' ? "bg-secondary/60 text-foreground" : "hover:bg-secondary/40 hover:text-foreground")}
              title="Good response"
            >
              <ThumbsUp className="w-4 h-4" />
            </button>
            <button
              onClick={() => setThumbState(thumbState === 'down' ? null : 'down')}
              className={clsx("p-1.5 rounded-md transition-colors", thumbState === 'down' ? "bg-secondary/60 text-foreground" : "hover:bg-secondary/40 hover:text-foreground")}
              title="Bad response"
            >
              <ThumbsDown className="w-4 h-4" />
            </button>
            <button
              className="p-1.5 hover:bg-secondary/40 hover:text-foreground rounded-md transition-colors ml-1"
              title="Retry"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

function MessagePartView({ part, nestedParts, statusText, subagentId, allParts, todos, sessionId, onSend, onAnswer, isStreaming, messageId, thinkingSeconds }: { part: MessagePart; nestedParts?: MessagePart[]; statusText?: string; subagentId?: string; allParts?: MessagePart[]; todos?: TodoItem[]; sessionId?: string; onSend?: (msg: string) => void; onAnswer?: (answer: string) => void; isStreaming?: boolean; messageId?: string; thinkingSeconds?: number }) {
  switch (part.type) {
    case 'reasoning': {
      // Determine if this reasoning block is "complete" — a non-reasoning part follows it
      const partIndex = allParts?.indexOf(part) ?? -1;
      const isLastReasoning = partIndex >= 0
        ? !allParts!.slice(partIndex + 1).some(p => p.type !== 'reasoning')
        : true;
      const isReasoningCompleted = !isStreaming || !isLastReasoning;
      return (
        <AgentThinkingIndicator
          messageId={messageId || 'reasoning'}
          label="Thinking"
          isCompleted={isReasoningCompleted}
          reasoning={part.content}
          seconds={isLastReasoning ? (thinkingSeconds || undefined) : undefined}
        />
      );
    }
    case 'text':
      return <MarkdownRenderer content={part.content} isStreaming={isStreaming} />;
    case 'tool_call':
      if (part.toolCall.name === 'question') {
        return <QuestionCard toolCall={part.toolCall} onAnswer={onAnswer} />;
      }
      if (part.toolCall.name === 'plan_exit') {
        return <PlanApprovalCard toolCall={part.toolCall} todos={todos} onAnswer={onAnswer} />;
      }
      if (part.toolCall.name === 'write_to_file') {
        return <FileWriteCard toolCall={part.toolCall} sessionId={sessionId} />;
      }
      if (part.toolCall.name === 'edit' || part.toolCall.name === 'multi_edit') {
        return <EditCard toolCall={part.toolCall} sessionId={sessionId} />;
      }
      if (part.toolCall.name === 'set_status') {
        return null;
      }
      if (part.toolCall.name?.startsWith('delegate_to_')) {
        return <SubagentCard toolCall={part.toolCall} nestedParts={nestedParts || []} statusText={statusText} subagentId={subagentId} allParts={allParts} sessionId={sessionId} />;
      }
      return <ToolCallCard toolCall={part.toolCall} />;
  }
}

function QuestionCard({ toolCall, onAnswer }: { toolCall: ToolCallInfo; onAnswer?: (answer: string) => void }) {
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [customText, setCustomText] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);

  let question = '';
  let options: string[] = [];

  // Parse question from args (available immediately when tool_call arrives)
  try {
    const parsed = JSON.parse(toolCall.args);
    if (parsed.question) {
      question = parsed.question;
      options = parsed.options || [];
    }
  } catch { /* ignore */ }

  // Check if already answered via tool result
  let answeredFromResult: string | null = null;
  if (toolCall.result) {
    try {
      const parsed = JSON.parse(toolCall.result);
      if (parsed.answer) answeredFromResult = parsed.answer;
    } catch { /* ignore */ }
  }

  const answered = selectedAnswer || answeredFromResult;
  const isWaiting = toolCall.status === 'running' && !answered;

  if (!question) return null;

  const handleSelect = (opt: string) => {
    if (answered) return;
    setSelectedAnswer(opt);
    setShowCustomInput(false);
    onAnswer?.(opt);
  };

  const handleCustomSubmit = () => {
    if (answered || !customText.trim()) return;
    setSelectedAnswer(customText.trim());
    setShowCustomInput(false);
    onAnswer?.(customText.trim());
  };

  return (
    <div className="rounded-2xl border border-border/50 bg-secondary/20 p-4 sm:p-5">
      <div className="flex items-start gap-2 sm:gap-2.5 mb-3">
        <HelpCircle className="w-4 h-4 text-foreground/70 mt-0.5 flex-shrink-0" />
        <div className="text-xs sm:text-sm font-medium text-foreground flex-1 min-w-0">
          <MarkdownRenderer content={question} />
        </div>
      </div>
      {options.length > 0 && (
        <div className="flex flex-wrap gap-2 pl-0 sm:pl-6">
          {options.map((opt, i) => {
            const isSelected = answered === opt;
            return (
              <button
                key={i}
                onClick={() => handleSelect(opt)}
                disabled={!!answered}
                className={`inline-block px-3 py-2 sm:py-1.5 rounded-full border text-xs font-medium transition-colors ${isSelected
                  ? 'bg-foreground text-background border-foreground'
                  : answered
                    ? 'bg-secondary/50 border-border/50 text-muted-foreground cursor-default opacity-50'
                    : 'bg-secondary border-border text-foreground/80 hover:bg-foreground hover:text-background cursor-pointer active:scale-95'
                  }`}
              >
                {isSelected && <Check className="w-3 h-3 inline mr-1" />}
                {opt}
              </button>
            );
          })}
          {!answered && (
            <button
              onClick={() => setShowCustomInput(!showCustomInput)}
              className="inline-block px-3 py-2 sm:py-1.5 rounded-full border border-dashed border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:border-foreground/50 cursor-pointer transition-colors"
            >
              Other...
            </button>
          )}
        </div>
      )}
      {(showCustomInput || options.length === 0) && !answered && (
        <div className="flex gap-2 mt-2 pl-0 sm:pl-6">
          <input
            type="text"
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCustomSubmit()}
            placeholder="Type your answer..."
            className="flex-1 px-3 py-1.5 rounded-lg border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-foreground/30"
            autoFocus
          />
          <button
            onClick={handleCustomSubmit}
            disabled={!customText.trim()}
            className="px-3 py-1.5 rounded-lg border border-border bg-foreground text-background text-xs font-medium hover:bg-foreground/90 disabled:opacity-40 disabled:cursor-default cursor-pointer transition-colors"
          >
            Send
          </button>
        </div>
      )}
      {isWaiting && !showCustomInput && options.length > 0 && (
        <div className="flex items-center gap-2 mt-3 pl-0 sm:pl-6 text-xs text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>Waiting for your answer...</span>
        </div>
      )}
    </div>
  );
}

function PlanApprovalCard({ toolCall, todos, onAnswer }: { toolCall: ToolCallInfo; todos?: TodoItem[]; onAnswer?: (answer: string) => void }) {
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);

  let summary = '';
  try {
    const parsed = JSON.parse(toolCall.args);
    summary = parsed.summary || '';
  } catch { /* ignore */ }

  // Check if already answered via tool result
  let answeredFromResult: string | null = null;
  let wasApproved = false;
  if (toolCall.result) {
    try {
      const parsed = JSON.parse(toolCall.result);
      wasApproved = !!parsed.approved;
      if (parsed.approved) answeredFromResult = 'Approved';
      else if (parsed.answer) answeredFromResult = parsed.answer;
      else if (parsed.error) answeredFromResult = parsed.error;
    } catch { /* ignore */ }
  }

  const answered = selectedAnswer || answeredFromResult;
  const isWaiting = toolCall.status === 'running' && !answered;

  const handleSelect = (answer: string) => {
    if (answered) return;
    setSelectedAnswer(answer);
    onAnswer?.(answer);
  };

  // Count todo stats
  const todoStats = todos ? {
    total: todos.length,
    completed: todos.filter(t => t.status === 'completed').length,
    inProgress: todos.filter(t => t.status === 'in_progress').length,
    pending: todos.filter(t => t.status === 'pending').length,
  } : null;

  return (
    <div className="rounded-2xl border border-primary/20 bg-primary/[0.03] p-4 sm:p-5">
      <div className="flex items-start gap-2 sm:gap-2.5 mb-3">
        <Rocket className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-xs sm:text-sm font-semibold text-foreground">Ready to build?</p>
          {summary && <p className="text-xs text-muted-foreground mt-1">{summary}</p>}
        </div>
      </div>

      {/* Todo list */}
      {todos && todos.length > 0 && (
        <div className="mt-3 pl-0 sm:pl-6 space-y-1.5">
          <p className="text-xs font-medium text-foreground/70 mb-2">
            Plan ({todoStats!.completed}/{todoStats!.total} tasks)
          </p>
          {todos.map((todo, i) => {
            const statusIcon = todo.status === 'completed' ? '✓' : todo.status === 'in_progress' ? '⋯' : '○';
            const statusColor = todo.status === 'completed' ? 'text-green-600 dark:text-green-400' : todo.status === 'in_progress' ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground';
            return (
              <div key={todo.id || i} className="flex items-start gap-2 text-xs">
                <span className={`${statusColor} font-mono`}>{statusIcon}</span>
                <span className="text-foreground/80 flex-1">{todo.content}</span>
                {todo.priority === 'high' && <span className="text-orange-600 dark:text-orange-400 text-[10px] font-medium">HIGH</span>}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap gap-2 pl-0 sm:pl-6 mt-4">
        {answered ? (
          <div className={`inline-flex items-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-full text-xs font-medium ${wasApproved || selectedAnswer?.includes('Approve')
            ? 'bg-green-500/20 text-green-700 dark:text-green-400 border border-green-500/30'
            : 'bg-secondary/50 text-muted-foreground border border-border/50'
            }`}>
            {(wasApproved || selectedAnswer?.includes('Approve')) ? (
              <><Check className="w-3 h-3" /> Plan approved — switching to build mode</>
            ) : (
              <>{answered}</>
            )}
          </div>
        ) : (
          <>
            <button
              onClick={() => handleSelect('Approve plan and start building')}
              disabled={!!answered}
              className="inline-flex items-center gap-1.5 px-4 py-2 sm:py-1.5 rounded-full border text-xs font-medium bg-foreground text-background hover:bg-foreground/90 cursor-pointer active:scale-95 transition-all"
            >
              <Check className="w-3 h-3" />
              Approve & start building
            </button>
            <button
              onClick={() => handleSelect('Keep planning')}
              disabled={!!answered}
              className="inline-flex items-center gap-1.5 px-4 py-2 sm:py-1.5 rounded-full border border-border text-xs font-medium bg-secondary text-foreground/80 hover:bg-secondary/80 cursor-pointer active:scale-95 transition-colors"
            >
              Keep planning
            </button>
          </>
        )}
      </div>
      {isWaiting && (
        <div className="flex items-center gap-2 mt-3 pl-0 sm:pl-6 text-xs text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>Waiting for your approval...</span>
        </div>
      )}
    </div>
  );
}

function FileWriteCard({ toolCall, sessionId }: { toolCall: ToolCallInfo; sessionId?: string }) {
  let filename = '';
  let code = '';

  try {
    const parsed = JSON.parse(toolCall.args);
    filename = parsed.TargetFile || parsed.target_file || '';
    code = parsed.CodeContent || parsed.code_content || '';
  } catch {
    // Fallback for streaming — extract from partial JSON
    filename = extractPartialString(toolCall.args, 'TargetFile') || extractPartialString(toolCall.args, 'target_file');
    code = extractPartialString(toolCall.args, 'CodeContent') || extractPartialString(toolCall.args, 'code_content');
  }

  const rawName = filename.split('/').pop() || filename;
  // Show a clean name for plan files (e.g. cloud-1770443832795-5fmltw.md → plan.md)
  const displayName = rawName.match(/^cloud-\d+-\w+\.md$/) ? 'plan.md' : rawName;
  const isRunning = toolCall.status === 'running';
  const hasDiff = toolCall.result && isDiffContent(toolCall.result);

  // Progressive reveal animation for code content
  const [revealedChars, setRevealedChars] = useState(0);
  const codeRef = useRef(code);
  const rafRef = useRef<number | null>(null);
  const doneRevealing = revealedChars >= code.length;

  useEffect(() => {
    // Only animate when we have code to reveal and no diff yet
    if (!code || hasDiff || doneRevealing) return;

    // If the code changed (new content arrived), keep revealing from where we are
    codeRef.current = code;

    const CHARS_PER_FRAME = 40;
    let current = revealedChars;

    const step = () => {
      current = Math.min(current + CHARS_PER_FRAME, codeRef.current.length);
      setRevealedChars(current);
      if (current < codeRef.current.length) {
        rafRef.current = requestAnimationFrame(step);
      }
    };
    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [code, hasDiff]);

  // When diff arrives, skip to full reveal
  useEffect(() => {
    if (hasDiff) {
      setRevealedChars(code.length);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    }
  }, [hasDiff, code.length]);

  const visibleCode = doneRevealing ? code : code.slice(0, revealedChars);

  // ── Filename typewriter ──
  const nameAlreadyDone = useRef(toolCall.status === 'completed' || toolCall.status === 'failed');
  const [typedFilename, setTypedFilename] = useState(nameAlreadyDone.current ? displayName : '');
  const filenameRef = useRef(displayName);
  filenameRef.current = displayName;
  const fnAnimatedRef = useRef(nameAlreadyDone.current);

  useEffect(() => {
    if (nameAlreadyDone.current || fnAnimatedRef.current || !displayName) return;
    const t = setTimeout(() => {
      const name = filenameRef.current;
      let i = 0;
      setTypedFilename('');
      const speed = Math.max(15, Math.min(40, 300 / name.length));
      const iv = setInterval(() => {
        i++;
        setTypedFilename(name.slice(0, i));
        if (i >= name.length) { clearInterval(iv); fnAnimatedRef.current = true; setTypedFilename(filenameRef.current); }
      }, speed);
    }, 200);
    return () => clearTimeout(t);
  }, [!!displayName]);

  useEffect(() => {
    if (fnAnimatedRef.current || nameAlreadyDone.current) setTypedFilename(displayName);
  }, [displayName]);

  const shownFilename = typedFilename || (nameAlreadyDone.current ? displayName : '\u00A0');

  return (
    <div className="rounded-xl overflow-hidden border border-border/30 bg-secondary/20">
      <div className="flex items-center gap-2 px-3 py-2 bg-secondary/50 border-b border-border/30">
        {isRunning || !doneRevealing ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
        ) : (
          <FileCode className="w-3.5 h-3.5 text-muted-foreground" />
        )}
        <span className="text-xs text-muted-foreground font-mono truncate flex-1">{shownFilename || 'file'}</span>
        <span className="flex items-center gap-2 flex-shrink-0">
          {hasDiff && (() => {
            const added = (toolCall.result!.match(/^\+[^+]/gm) || []).length;
            return added > 0 ? <span className="text-xs text-green-500">+{added}</span> : null;
          })()}
          {!isRunning && sessionId && filename && (
            <button
              onClick={() => {
                const absolutePath = filename.startsWith('/') ? filename : `/workspace/${filename}`;
                window.open(`/api/sandbox/file?sessionId=${sessionId}&path=${encodeURIComponent(absolutePath)}`);
              }}
              className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
              title="Download file"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          )}
        </span>
      </div>
      {hasDiff ? (
        <InlineDiff diff={toolCall.result!} filename={displayName} defaultExpanded={true} hideHeader />
      ) : visibleCode ? (
        <div className="overflow-x-auto max-h-80 scrollbar-hide bg-muted/30">
          <pre className="p-3 text-xs font-mono text-foreground/90 leading-relaxed whitespace-pre">{visibleCode}{!doneRevealing && <span className="animate-pulse">|</span>}</pre>
        </div>
      ) : isRunning ? (
        <div className="p-3 text-xs text-muted-foreground">
          <span>Writing file...</span>
        </div>
      ) : null}
    </div>
  );
}

function EditCard({ toolCall, sessionId }: { toolCall: ToolCallInfo; sessionId?: string }) {
  let filename = '';
  let explanation = '';
  let oldStr = '';
  let newStr = '';
  let edits: Array<{ old_string: string; new_string: string }> = [];
  try {
    const parsed = JSON.parse(toolCall.args);
    filename = parsed.file_path || parsed.TargetFile || '';
    explanation = parsed.explanation || parsed.Description || '';
    oldStr = parsed.old_string || parsed.TargetContent || '';
    newStr = parsed.new_string || parsed.ReplacementContent || '';
    if (parsed.edits) edits = parsed.edits;
    if (parsed.ReplacementChunks) {
      edits = parsed.ReplacementChunks.map((c: any) => ({
        old_string: c.TargetContent || '',
        new_string: c.ReplacementContent || ''
      }));
    }
  } catch {
    // Fallback for streaming partial JSON
    filename = extractPartialString(toolCall.args, 'TargetFile') || extractPartialString(toolCall.args, 'file_path');
    explanation = extractPartialString(toolCall.args, 'Description') || extractPartialString(toolCall.args, 'explanation');
    oldStr = extractPartialString(toolCall.args, 'TargetContent') || extractPartialString(toolCall.args, 'old_string');
    newStr = extractPartialString(toolCall.args, 'ReplacementContent') || extractPartialString(toolCall.args, 'new_string');
  }

  const rawName = filename.split('/').pop() || filename;
  const isRunning = toolCall.status === 'running';

  // Extract diff from JSON result (edit tools wrap diff inside { diff: "..." })
  let diff = '';
  if (toolCall.result) {
    try {
      const parsed = JSON.parse(toolCall.result);
      diff = parsed.diff || '';
    } catch {
      if (isDiffContent(toolCall.result)) diff = toolCall.result;
    }
  }

  const hasDiff = diff && isDiffContent(diff);

  // Build a preview from args while the tool is running
  const hasArgsPreview = !hasDiff && (oldStr || newStr || edits.length > 0);
  let liveDiffStr = '';

  if (hasArgsPreview) {
    const pairs = edits.length > 0 ? edits : [{ old_string: oldStr, new_string: newStr }];

    // Construct a synthetic unified diff so InlineDiff can render it nicely
    // We start with a fake header to trick InlineDiff into parsing it
    liveDiffStr = `--- a/${rawName || 'file'}\n+++ b/${rawName || 'file'}\n`;

    pairs.forEach((pair, idx) => {
      // Add a fake chunk header for each edit
      liveDiffStr += `@@ -0,0 +0,0 @@\n`;
      pair.old_string.split('\\n').forEach(l => { if (l !== '') liveDiffStr += `-${l}\n`; });
      pair.new_string.split('\\n').forEach(l => { if (l !== '') liveDiffStr += `+${l}\n`; });
    });
  }
  // ── Filename typewriter ──
  const editNameDone = useRef(toolCall.status === 'completed' || toolCall.status === 'failed');
  const [typedEditName, setTypedEditName] = useState(editNameDone.current ? rawName : '');
  const editNameRef = useRef(rawName);
  editNameRef.current = rawName;
  const editAnimatedRef = useRef(editNameDone.current);

  useEffect(() => {
    if (editNameDone.current || editAnimatedRef.current || !rawName) return;
    const t = setTimeout(() => {
      const name = editNameRef.current;
      let i = 0;
      setTypedEditName('');
      const speed = Math.max(15, Math.min(40, 300 / name.length));
      const iv = setInterval(() => {
        i++;
        setTypedEditName(name.slice(0, i));
        if (i >= name.length) { clearInterval(iv); editAnimatedRef.current = true; setTypedEditName(editNameRef.current); }
      }, speed);
    }, 200);
    return () => clearTimeout(t);
  }, [!!rawName]);

  useEffect(() => {
    if (editAnimatedRef.current || editNameDone.current) setTypedEditName(rawName);
  }, [rawName]);

  const shownEditName = typedEditName || (editNameDone.current ? rawName : '\u00A0');

  return (
    <div className="rounded-xl overflow-hidden border border-border/30 bg-secondary/20">
      <div className="flex items-center gap-2 px-3 py-2 bg-secondary/50 border-b border-border/30">
        {isRunning ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
        ) : (
          <FileCode className="w-3.5 h-3.5 text-muted-foreground" />
        )}
        <span className="text-xs text-muted-foreground font-mono truncate flex-1">{shownEditName || 'file'}</span>
        {explanation && !hasDiff && (
          <span className="text-[10px] text-muted-foreground/60 truncate max-w-[200px]">{explanation}</span>
        )}
        <span className="flex items-center gap-2 flex-shrink-0">
          {hasDiff && (() => {
            const added = (diff.match(/^\+[^+]/gm) || []).length;
            const removed = (diff.match(/^-[^-]/gm) || []).length;
            return (
              <>
                {added > 0 && <span className="text-xs text-green-500">+{added}</span>}
                {removed > 0 && <span className="text-xs text-red-500">-{removed}</span>}
              </>
            );
          })()}
          {!isRunning && sessionId && filename && (
            <button
              onClick={() => {
                const absolutePath = filename.startsWith('/') ? filename : `/workspace/${filename}`;
                window.open(`/api/sandbox/file?sessionId=${sessionId}&path=${encodeURIComponent(absolutePath)}`);
              }}
              className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
              title="Download file"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          )}
        </span>
      </div>
      {hasDiff ? (
        <InlineDiff diff={diff} filename={rawName} defaultExpanded={true} hideHeader />
      ) : hasArgsPreview ? (
        <InlineDiff diff={liveDiffStr} filename={rawName} defaultExpanded={true} hideHeader />
      ) : isRunning ? (
        <div className="p-3 text-xs text-muted-foreground">
          <span>Preparing edit...</span>
        </div>
      ) : toolCall.result ? (
        <div className="p-3 text-xs text-muted-foreground">
          {(() => {
            try { return JSON.parse(toolCall.result).message || 'Edit applied'; } catch { return 'Edit applied'; }
          })()}
        </div>
      ) : null}
    </div>
  );
}

// ── SubagentCard — dropdown like the thinking indicator ──
function SubagentCard({ toolCall, nestedParts, statusText: groupedStatusText, subagentId, allParts, sessionId }: { toolCall: ToolCallInfo; nestedParts: MessagePart[]; statusText?: string; subagentId?: string; allParts?: MessagePart[]; sessionId?: string }) {
  const isRunning = toolCall.status === 'running';
  const isCompleted = toolCall.status === 'completed';
  const isFailed = toolCall.status === 'failed';

  // Always expanded to show tool activity
  const [userToggled, setUserToggled] = useState(false);
  const [isExpanded, setIsExpanded] = useState(isRunning);

  // Auto-collapse when tool finishes
  useEffect(() => {
    if (!userToggled) {
      setIsExpanded(isRunning);
    }
  }, [isRunning, userToggled]);

  const agentKind = toolCall.name?.replace('delegate_to_', '') || 'agent';

  // Extract task from tool call args as a reliable fallback (always available)
  const taskFromArgs = (() => {
    try { return JSON.parse(toolCall.args || '{}').task || ''; }
    catch { return ''; }
  })();

  // Read statusText directly from raw parts — bypasses grouping logic
  // Match by subagentId first (for parallel subagents), fall back to agentName (legacy)
  const liveStatusText = (() => {
    if (allParts) {
      // Try matching by subagentId first (precise match for parallel subagents)
      if (subagentId) {
        for (let i = allParts.length - 1; i >= 0; i--) {
          const p = allParts[i] as any;
          if (p?.type === 'subagent_start' && p.subagentId === subagentId && p.statusText) {
            return p.statusText as string;
          }
        }
      }
      // Fall back to agentName match (legacy messages without subagentId)
      for (let i = allParts.length - 1; i >= 0; i--) {
        const p = allParts[i] as any;
        if (p?.type === 'subagent_start' && p.agentName === agentKind && p.statusText) {
          return p.statusText as string;
        }
      }
    }
    return groupedStatusText;
  })();

  // Extract the last meaningful line from statusText for display
  const derivedLabel = (() => {
    if (liveStatusText) {
      const lines = liveStatusText.split('\n').filter((l: string) => l.trim());
      const lastLine = lines[lines.length - 1]?.trim() || '';
      if (lastLine) return lastLine.length > 200 ? lastLine.slice(0, 197) + '...' : lastLine;
    }
    if (isFailed) {
      const errorMsg = parseErrorResult(toolCall.result || '');
      return errorMsg ? `Failed: ${errorMsg.length > 120 ? errorMsg.slice(0, 117) + '...' : errorMsg}` : 'Subagent failed';
    }
    if (isRunning) return 'Starting...';
    if (isCompleted) return taskFromArgs || 'Completed';
    return taskFromArgs || 'Working...';
  })();

  // ── Typewriter that re-types when label changes ──
  const wasBornDone = useRef(isCompleted || isFailed);
  const [typedLabel, setTypedLabel] = useState(wasBornDone.current ? derivedLabel : '');
  const prevLabelRef = useRef(derivedLabel);
  const typingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Historical: show instantly
    if (wasBornDone.current) { setTypedLabel(derivedLabel); return; }

    // Only animate when label actually changes
    if (derivedLabel === prevLabelRef.current && typedLabel === derivedLabel) return;
    prevLabelRef.current = derivedLabel;

    // Cancel any running typewriter animation
    if (typingIntervalRef.current) {
      clearInterval(typingIntervalRef.current);
      typingIntervalRef.current = null;
    }

    // Debounce: wait for label to settle (tokens streaming fast)
    const debounce = setTimeout(() => {
      const text = derivedLabel;
      let i = 0;
      setTypedLabel('');
      const speed = Math.max(8, Math.min(25, 500 / text.length));
      typingIntervalRef.current = setInterval(() => {
        i++;
        setTypedLabel(text.slice(0, i));
        if (i >= text.length) {
          if (typingIntervalRef.current) clearInterval(typingIntervalRef.current);
          typingIntervalRef.current = null;
        }
      }, speed);
    }, 300);

    return () => {
      clearTimeout(debounce);
      if (typingIntervalRef.current) {
        clearInterval(typingIntervalRef.current);
        typingIntervalRef.current = null;
      }
    };
  }, [derivedLabel]); // eslint-disable-line react-hooks/exhaustive-deps

  const shownLabel = typedLabel || '\u00A0';

  return (
    <div className="flex flex-col my-1">
      {/* Header — clickable to toggle expand */}
      <div
        onClick={() => {
          setUserToggled(true);
          setIsExpanded(!isExpanded);
        }}
        className="inline-flex items-center gap-2 py-0.5 cursor-pointer hover:opacity-80"
      >
        <span className={clsx("text-[13px] text-muted-foreground", isRunning && "animate-shimmer-text")}>
          {shownLabel}
        </span>
      </div>

      {/* Nested content — tool calls rendered in real-time */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-1 ml-1 flex flex-col gap-2">
              {nestedParts.length > 0 ? (
                groupIntoChains(groupSubagentParts(nestedParts.map((part, i) => ({ part, idx: i })))).map((seg, i) =>
                  seg.type === 'chain' ? (
                    <ToolChain key={`sc-${i}`} items={seg.items} />
                  ) : (
                    <MessagePartView key={seg.item.idx} part={seg.item.part} nestedParts={seg.item.nestedParts} statusText={seg.item.statusText} sessionId={sessionId} />
                  )
                )
              ) : isCompleted && toolCall.result ? (
                <div className="text-sm text-muted-foreground/80">
                  <MarkdownRenderer content={toolCall.result} />
                </div>
              ) : null}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── ToolChain — timeline container for consecutive tool calls ──

function ToolChain({ items }: { items: GroupedPart[] }) {
  // Each item is 24px tall (py-0 + min-h-[24px]). Dots are 18px centered in each row.
  // Line connects from center of first dot to center of last dot.
  // With items packed tight, first dot center = 12px, last = (n-1)*24 + 12.
  const count = items.length;

  return (
    <div className="relative" style={{ paddingLeft: '28px' }}>
      {/* Vertical connecting line — only between first and last dot centers */}
      {count > 1 && (
        <div
          className="absolute"
          style={{
            left: '8px',
            top: '12px',
            bottom: '12px',
            width: '2px',
            borderRadius: '1px',
            background: 'color-mix(in srgb, var(--foreground) 12%, transparent)',
          }}
        />
      )}
      {items.map((group) => (
        <ToolChainItem key={group.idx} group={group} />
      ))}
    </div>
  );
}

function ToolChainItem({ group }: { group: GroupedPart }) {
  const part = group.part as any;
  const toolCall: ToolCallInfo = part.toolCall;

  const isRunning = toolCall.status === 'running';
  const isFailed = toolCall.status === 'failed';
  const isCompleted = toolCall.status === 'completed';

  const displayName = getToolDisplayName(toolCall);

  // ── Typewriter for display name ──
  const wasBornDone = useRef(isCompleted || isFailed);
  const hasAnimated = useRef(wasBornDone.current);
  const isTyping = useRef(false);
  const [typedName, setTypedName] = useState(wasBornDone.current ? displayName : '');

  useEffect(() => {
    if (wasBornDone.current || hasAnimated.current) { setTypedName(displayName); return; }
    if (!toolCall.name || isTyping.current) return;
    const debounce = setTimeout(() => {
      const text = displayName;
      let i = 0;
      isTyping.current = true;
      setTypedName('');
      const speed = Math.max(12, Math.min(35, 400 / text.length));
      const interval = setInterval(() => {
        i++;
        setTypedName(text.slice(0, i));
        if (i >= text.length) {
          clearInterval(interval);
          hasAnimated.current = true;
          isTyping.current = false;
        }
      }, speed);
    }, 300);
    return () => clearTimeout(debounce);
  }, [displayName, toolCall.name]);

  const shownName = typedName || (wasBornDone.current ? displayName : '\u00A0');

  const dotContent = isRunning
    ? <Loader2 className="w-2.5 h-2.5 animate-spin text-foreground/60" />
    : isFailed
      ? <X className="w-2.5 h-2.5 text-red-500" />
      : getToolIcon(toolCall.name, 'w-2.5 h-2.5 text-muted-foreground');

  return (
    <div className="relative flex items-center gap-2" style={{ height: '24px' }}>
      {/* Dot — solid bg-background knocks out the line, colored circle on top */}
      <div
        className="absolute flex items-center justify-center rounded-full bg-background"
        style={{ left: '-28px', width: '18px', height: '18px' }}
      >
        <div className={clsx(
          "w-[18px] h-[18px] rounded-full flex items-center justify-center",
          isFailed ? "bg-red-500/15" : isRunning ? "bg-foreground/10" : "bg-foreground/[0.06]",
        )}>
          {dotContent}
        </div>
      </div>

      <span className={clsx(
        "text-[13px] text-muted-foreground truncate",
        isRunning && "animate-shimmer-text"
      )}>
        {shownName}
      </span>
    </div>
  );
}

function ToolCallCard({ toolCall }: { toolCall: ToolCallInfo }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const statusIcon = {
    running: <Loader2 className="w-3.5 h-3.5 animate-spin text-foreground/50" />,
    completed: <Check className="w-3.5 h-3.5 text-green-500" />,
    failed: <X className="w-3.5 h-3.5 text-red-500" />,
  }[toolCall.status];

  const isPreparing = !toolCall.name;
  const displayName = getToolDisplayName(toolCall);
  const toolIcon = isPreparing
    ? <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
    : getToolIcon(toolCall.name, 'w-3.5 h-3.5');

  // ── Determine if this is a fresh tool (born during streaming) vs loaded from history ──
  const isAlreadyDone = toolCall.status === 'completed' || toolCall.status === 'failed';
  const wasBornDoneRef = useRef(isAlreadyDone);

  // ── Typewriter animation — debounce on displayName settling ──
  const hasAnimatedRef = useRef(wasBornDoneRef.current);
  const isTypingRef = useRef(false);
  const [typedName, setTypedName] = useState(wasBornDoneRef.current ? displayName : '');

  useEffect(() => {
    // Historical tools: always instant
    if (wasBornDoneRef.current) { setTypedName(displayName); return; }
    // Already animated: instant sync for future changes
    if (hasAnimatedRef.current) { setTypedName(displayName); return; }
    // Still preparing (no name): wait
    if (isPreparing) return;
    // Currently typing: don't restart
    if (isTypingRef.current) return;

    // Debounce: wait 400ms for displayName to settle (args streaming in)
    const debounce = setTimeout(() => {
      const nameToType = displayName;
      let i = 0;
      isTypingRef.current = true;
      setTypedName('');
      const speed = Math.max(12, Math.min(35, 400 / nameToType.length));
      const interval = setInterval(() => {
        i++;
        setTypedName(nameToType.slice(0, i));
        if (i >= nameToType.length) {
          clearInterval(interval);
          hasAnimatedRef.current = true;
          isTypingRef.current = false;
        }
      }, speed);
    }, 400);

    return () => clearTimeout(debounce);
  }, [displayName, isPreparing]);

  const shownName = typedName || (wasBornDoneRef.current ? displayName : '\u00A0');

  return (
    <motion.div
      initial={wasBornDoneRef.current ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="rounded-xl border border-border/30 overflow-hidden bg-secondary/20"
    >
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        disabled={isPreparing}
        className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${isPreparing ? 'opacity-70 cursor-default' : 'hover:bg-secondary/50'}`}
      >
        <span className="text-muted-foreground shrink-0">{toolIcon}</span>
        <span className="text-xs font-medium flex-1 truncate">{shownName}</span>
        {!isPreparing && statusIcon}
        {!isPreparing && (
          <motion.div
            animate={{ rotate: isExpanded ? 90 : 0 }}
            transition={{ duration: 0.15 }}
          >
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
          </motion.div>
        )}
      </button>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-2 border-t border-border/30">
              <div className="pt-2">
                <div className="text-xs text-muted-foreground mb-1">Arguments</div>
                <pre className="text-xs bg-muted/50 rounded p-2 overflow-x-auto">
                  {formatJSON(toolCall.args)}
                </pre>
              </div>
              {toolCall.result && (() => {
                const errorMsg = parseErrorResult(toolCall.result);
                if (errorMsg) {
                  return (
                    <div className="flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">
                      <X className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
                      <span className="text-xs text-red-400">{errorMsg}</span>
                    </div>
                  );
                }
                return (
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Result</div>
                    {isDiffContent(toolCall.result) ? (
                      <InlineDiff diff={toolCall.result} defaultExpanded={false} />
                    ) : (
                      <pre className="text-xs bg-muted/50 rounded p-2 overflow-x-auto max-h-40">
                        {formatJSON(toolCall.result)}
                      </pre>
                    )}
                  </div>
                );
              })()}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function formatPlanMarkdown(todos: TodoItem[], summary?: string): string {
  const lines: string[] = ['# Plan', ''];

  if (summary) {
    lines.push('## Summary', '', summary, '');
  }

  lines.push('## Tasks', '');

  if (todos.length === 0) {
    lines.push('_No tasks defined yet._');
  } else {
    for (const todo of todos) {
      const checkbox = todo.status === 'completed' ? '[x]' : '[ ]';
      const statusBadge = todo.status === 'in_progress' ? ' [IN PROGRESS]' : '';
      const priorityBadge = todo.priority === 'high' ? ' [HIGH]' : todo.priority === 'low' ? ' [LOW]' : '';
      lines.push(`- ${checkbox} ${todo.content}${statusBadge}${priorityBadge}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

function formatJSON(str: string): string {
  try {
    return JSON.stringify(JSON.parse(str), null, 2);
  } catch {
    return str;
  }
}

/** Detect error JSON in a tool result string and extract a friendly message. */
function parseErrorResult(str: string): string | null {
  if (!str) return null;
  const trimmed = str.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed.error) return typeof parsed.error === 'string' ? parsed.error : JSON.stringify(parsed.error);
    if (parsed.message && (parsed.code || parsed.status)) return parsed.message;
    return null;
  } catch {
    return null;
  }
}

/** Check if a string looks like raw error JSON that shouldn't render as text. */
function isErrorJSON(str: string): boolean {
  const t = str.trim();
  if (!t.startsWith('{')) return false;
  try {
    const p = JSON.parse(t);
    return !!(p.error || p.code || (p.message && p.status));
  } catch {
    return false;
  }
}

// Utility to extract unclosed string values from a streaming JSON string map
function extractPartialString(jsonStr: string, key: string): string {
  if (!jsonStr) return '';
  const regex = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)`);
  const match = jsonStr.match(regex);
  if (match && match[1] !== undefined) {
    try {
      return match[1]
        .replace(/\\n/g, '\n')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\')
        .replace(/\\t/g, '\t')
        .replace(/\\r/g, '\r');
    } catch {
      return match[1];
    }
  }
  return '';
}

function isDiffContent(str: string): boolean {
  // Detect unified diff format
  return (
    (str.includes('--- ') && str.includes('+++ ') && str.includes('@@')) ||
    str.startsWith('diff --git')
  );
}
