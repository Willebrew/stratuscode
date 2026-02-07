'use client';

import { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronRight, Brain } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';

interface ReasoningBubbleProps {
  reasoning: string;
  isStreaming?: boolean;
  startTime?: number;
}

export function ReasoningBubble({ reasoning, isStreaming, startTime }: ReasoningBubbleProps) {
  const [isExpanded, setIsExpanded] = useState(isStreaming ?? false);
  const [elapsed, setElapsed] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const timerStart = useRef(startTime ?? Date.now());

  // Auto-expand while streaming, auto-collapse when done
  useEffect(() => {
    if (isStreaming) {
      setIsExpanded(true);
    }
  }, [isStreaming]);

  // Track elapsed time while streaming
  useEffect(() => {
    if (!isStreaming) {
      // Final elapsed
      setElapsed(Math.round((Date.now() - timerStart.current) / 1000));
      return;
    }

    const interval = setInterval(() => {
      setElapsed(Math.round((Date.now() - timerStart.current) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [isStreaming]);

  // Auto-scroll while streaming
  useEffect(() => {
    if (isStreaming && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [reasoning, isStreaming]);

  const summaryText = isStreaming
    ? `Thinking... ${elapsed}s`
    : `Reasoned for ${elapsed}s`;

  return (
    <div className="mb-3">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={clsx(
          'flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs transition-all duration-200',
          isStreaming
            ? 'text-foreground/70 bg-secondary/80'
            : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
        )}
      >
        <div className="relative">
          <Brain className="w-3.5 h-3.5" />
          {isStreaming && (
            <motion.div
              className="absolute inset-0 rounded-full border border-foreground/30"
              animate={{ scale: [1, 1.6, 1], opacity: [0.5, 0, 0.5] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
            />
          )}
        </div>
        <span>{summaryText}</span>
        {!isStreaming && (
          isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />
        )}
      </button>

      <AnimatePresence initial={false}>
        {isExpanded && reasoning && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div
              ref={scrollRef}
              className={clsx(
                'mt-2 pl-3 border-l-2 text-xs leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto',
                isStreaming
                  ? 'border-foreground/20 text-foreground/60'
                  : 'border-muted-foreground/20 text-muted-foreground'
              )}
            >
              {reasoning}
              {isStreaming && (
                <motion.span
                  className="inline-block w-1.5 h-3.5 bg-foreground/40 ml-0.5 align-middle"
                  animate={{ opacity: [1, 0] }}
                  transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut' }}
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
