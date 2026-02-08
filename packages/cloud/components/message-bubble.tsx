'use client';

import { useState, useEffect, useRef } from 'react';
import { ChevronRight, Loader2, Check, X, Wrench, HelpCircle, FileCode, Rocket } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { MarkdownRenderer } from './markdown-renderer';
import { InlineDiff } from './inline-diff';
import type { ChatMessage, ToolCallInfo, MessagePart, TodoItem } from '@/hooks/use-chat-stream';

interface MessageBubbleProps {
  message: ChatMessage;
  todos?: TodoItem[];
  onSend?: (message: string) => void;
  onAnswer?: (answer: string) => void;
}

export function MessageBubble({ message, todos, onSend, onAnswer }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="flex justify-end"
      >
        <div className="max-w-[85%] sm:max-w-[70%] rounded-2xl px-4 sm:px-5 py-3 sm:py-3.5 bg-foreground text-background">
          <MarkdownRenderer content={message.content} />
        </div>
      </motion.div>
    );
  }

  // Agent message — render parts in chronological order, no avatar
  // Deduplicate: collect question texts from tool_call parts so we can suppress
  // text parts that just echo the same question the QuestionCard already renders.
  const questionTexts = new Set<string>();
  const seenQuestionKeys = new Set<string>();
  const deduplicatedParts: { part: MessagePart; idx: number }[] = [];

  // First pass: collect question texts from tool calls
  for (const part of message.parts) {
    if (part.type === 'tool_call' && part.toolCall.name === 'question') {
      try {
        const parsed = JSON.parse(part.toolCall.args);
        if (parsed.question) questionTexts.add(parsed.question);
      } catch { /* ignore */ }
    }
  }

  // Second pass: filter out duplicate text parts and duplicate question tool calls
  for (let i = 0; i < message.parts.length; i++) {
    const part = message.parts[i]!;

    // Skip text parts whose content matches a question tool call's question
    if (part.type === 'text' && questionTexts.size > 0) {
      const trimmed = part.content.trim();
      let isDuplicate = false;
      for (const qt of questionTexts) {
        if (trimmed.includes(qt) || qt.includes(trimmed)) {
          isDuplicate = true;
          break;
        }
      }
      if (isDuplicate) continue;
    }

    // Skip duplicate question tool calls (same question text)
    if (part.type === 'tool_call' && (part as any).toolCall?.name === 'question') {
      try {
        const parsed = JSON.parse((part as any).toolCall.args);
        const key = parsed.question || '';
        if (seenQuestionKeys.has(key)) continue;
        seenQuestionKeys.add(key);
      } catch { /* ignore */ }
    }

    deduplicatedParts.push({ part, idx: i });
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      {deduplicatedParts.map(({ part, idx }) => (
        <MessagePartView key={idx} part={part} todos={todos} onSend={onSend} onAnswer={onAnswer} />
      ))}
    </motion.div>
  );
}

function MessagePartView({ part, todos, onSend, onAnswer }: { part: MessagePart; todos?: TodoItem[]; onSend?: (msg: string) => void; onAnswer?: (answer: string) => void }) {
  switch (part.type) {
    case 'reasoning':
      // Reasoning is hidden from UI per user preference
      return null;
    case 'text':
      return <MarkdownRenderer content={part.content} />;
    case 'tool_call':
      if (part.toolCall.name === 'question') {
        return <QuestionCard toolCall={part.toolCall} onAnswer={onAnswer} />;
      }
      if (part.toolCall.name === 'plan_exit') {
        return <PlanApprovalCard toolCall={part.toolCall} todos={todos} onAnswer={onAnswer} />;
      }
      if (part.toolCall.name === 'write_to_file') {
        return <FileWriteCard toolCall={part.toolCall} />;
      }
      if (part.toolCall.name === 'edit' || part.toolCall.name === 'multi_edit') {
        return <EditCard toolCall={part.toolCall} />;
      }
      return (
        <div className="mb-2">
          <ToolCallCard toolCall={part.toolCall} />
        </div>
      );
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
    <div className="my-3 rounded-2xl border border-border/50 bg-secondary/20 p-4 sm:p-5">
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
                className={`inline-block px-3 py-2 sm:py-1.5 rounded-full border text-xs font-medium transition-colors ${
                  isSelected
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
    <div className="my-3 rounded-2xl border border-primary/20 bg-primary/[0.03] p-4 sm:p-5">
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
          <div className={`inline-flex items-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-full text-xs font-medium ${
            wasApproved || selectedAnswer?.includes('Approve')
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

function FileWriteCard({ toolCall }: { toolCall: ToolCallInfo }) {
  let filename = '';
  let code = '';

  try {
    const parsed = JSON.parse(toolCall.args);
    filename = parsed.TargetFile || parsed.target_file || '';
    code = parsed.CodeContent || parsed.code_content || '';
  } catch { /* ignore */ }

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

  return (
    <div className="my-2 rounded-xl overflow-hidden border border-border/30 bg-secondary/20">
      <div className="flex items-center gap-2 px-3 py-2 bg-secondary/50 border-b border-border/30">
        {isRunning || !doneRevealing ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
        ) : (
          <FileCode className="w-3.5 h-3.5 text-muted-foreground" />
        )}
        <span className="text-xs text-muted-foreground font-mono truncate">{displayName || 'file'}</span>
        {hasDiff && (() => {
          const added = (toolCall.result!.match(/^\+[^+]/gm) || []).length;
          return added > 0 ? <span className="ml-auto text-xs text-green-500">+{added}</span> : null;
        })()}
      </div>
      {hasDiff ? (
        <InlineDiff diff={toolCall.result!} filename={displayName} defaultExpanded={true} hideHeader />
      ) : visibleCode ? (
        <div className="overflow-x-auto max-h-80 scrollbar-hide bg-muted/30">
          <pre className="p-3 text-xs font-mono text-foreground/90 leading-relaxed whitespace-pre">{visibleCode}{!doneRevealing && <span className="animate-pulse">|</span>}</pre>
        </div>
      ) : isRunning ? (
        <div className="p-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>Writing file...</span>
        </div>
      ) : null}
    </div>
  );
}

function EditCard({ toolCall }: { toolCall: ToolCallInfo }) {
  let filename = '';
  let explanation = '';
  let oldStr = '';
  let newStr = '';
  let edits: Array<{ old_string: string; new_string: string }> = [];
  try {
    const parsed = JSON.parse(toolCall.args);
    filename = parsed.file_path || '';
    explanation = parsed.explanation || '';
    oldStr = parsed.old_string || '';
    newStr = parsed.new_string || '';
    if (parsed.edits) edits = parsed.edits;
  } catch { /* ignore */ }

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
  const previewLines: Array<{ type: 'remove' | 'add' | 'context'; text: string }> = [];
  if (hasArgsPreview) {
    const pairs = edits.length > 0 ? edits : [{ old_string: oldStr, new_string: newStr }];
    pairs.forEach((pair, idx) => {
      if (idx > 0) previewLines.push({ type: 'context', text: '...' });
      pair.old_string.split('\n').forEach(l => previewLines.push({ type: 'remove', text: l }));
      pair.new_string.split('\n').forEach(l => previewLines.push({ type: 'add', text: l }));
    });
  }

  return (
    <div className="my-2 rounded-xl overflow-hidden border border-border/30 bg-secondary/20">
      <div className="flex items-center gap-2 px-3 py-2 bg-secondary/50 border-b border-border/30">
        {isRunning ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
        ) : (
          <FileCode className="w-3.5 h-3.5 text-muted-foreground" />
        )}
        <span className="text-xs text-muted-foreground font-mono truncate flex-1">{rawName || 'file'}</span>
        {explanation && !hasDiff && (
          <span className="text-[10px] text-muted-foreground/60 truncate max-w-[200px]">{explanation}</span>
        )}
        {hasDiff && (() => {
          const added = (diff.match(/^\+[^+]/gm) || []).length;
          const removed = (diff.match(/^-[^-]/gm) || []).length;
          return (
            <span className="flex items-center gap-2 flex-shrink-0">
              {added > 0 && <span className="text-xs text-green-500">+{added}</span>}
              {removed > 0 && <span className="text-xs text-red-500">-{removed}</span>}
            </span>
          );
        })()}
      </div>
      {hasDiff ? (
        <InlineDiff diff={diff} filename={rawName} defaultExpanded={true} hideHeader />
      ) : hasArgsPreview ? (
        <div className="overflow-x-auto max-h-64 scrollbar-hide">
          <pre className="p-3 text-xs font-mono leading-relaxed whitespace-pre">
            {previewLines.map((line, i) => (
              <div
                key={i}
                className={
                  line.type === 'remove' ? 'text-red-400/80 bg-red-500/5' :
                  line.type === 'add' ? 'text-green-400/80 bg-green-500/5' :
                  'text-muted-foreground/50'
                }
              >
                <span className="inline-block w-4 text-right mr-2 select-none opacity-50">
                  {line.type === 'remove' ? '-' : line.type === 'add' ? '+' : ' '}
                </span>
                {line.text}
              </div>
            ))}
            {isRunning && <span className="animate-pulse text-muted-foreground">|</span>}
          </pre>
        </div>
      ) : isRunning ? (
        <div className="p-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>Editing file...</span>
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

function ToolCallCard({ toolCall }: { toolCall: ToolCallInfo }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const statusIcon = {
    running: <Loader2 className="w-3.5 h-3.5 animate-spin text-foreground/50" />,
    completed: <Check className="w-3.5 h-3.5 text-green-500" />,
    failed: <X className="w-3.5 h-3.5 text-red-500" />,
  }[toolCall.status];

  return (
    <div className="rounded-xl border border-border/30 overflow-hidden bg-secondary/20">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-secondary/50 transition-colors"
      >
        <Wrench className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs font-medium flex-1 truncate">{toolCall.name}</span>
        {statusIcon}
        <motion.div
          animate={{ rotate: isExpanded ? 90 : 0 }}
          transition={{ duration: 0.15 }}
        >
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
        </motion.div>
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
              {toolCall.result && (
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
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
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

function isDiffContent(str: string): boolean {
  // Detect unified diff format
  return (
    (str.includes('--- ') && str.includes('+++ ') && str.includes('@@')) ||
    str.startsWith('diff --git')
  );
}
