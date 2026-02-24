'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { AnimatedStratusLogo } from './animated-stratus-logo';
import { MarkdownRenderer } from './markdown-renderer';

interface AgentThinkingIndicatorProps {
  messageId: string;
  label?: string;
  reasoning?: string;
  className?: string;
  isCompleted?: boolean;
  seconds?: number;
}

/**
 * Wave text — letters ripple up/down with staggered timing.
 */
export function WaveText({ text }: { text: string }) {
  return (
    <span className="inline-flex">
      {text.split('').map((char, i) => (
        <span
          key={i}
          className="inline-block"
          style={{
            animation: `waveChar 1.8s ease-in-out infinite`,
            animationDelay: `${i * 0.06}s`,
          }}
        >
          {char === ' ' ? '\u00A0' : char}
        </span>
      ))}
      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes waveChar {
          0%, 100% { transform: translateY(0); opacity: 0.55; }
          25% { transform: translateY(-2.5px); opacity: 1; }
          50% { transform: translateY(0); opacity: 0.55; }
          75% { transform: translateY(1.5px); opacity: 0.45; }
        }
      `}} />
    </span>
  );
}

export function AgentThinkingIndicator({
  messageId,
  label = 'Thinking',
  reasoning,
  className,
  isCompleted = false,
  seconds = 0,
}: AgentThinkingIndicatorProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const hasReasoning = reasoning && reasoning.trim().length > 0;

  if (isCompleted && seconds < 1 && !hasReasoning) {
    return null;
  }

  return (
    <div className={clsx('flex flex-col', className)}>
      <div
        onClick={() => hasReasoning && setIsExpanded(!isExpanded)}
        className={clsx(
          "inline-flex items-center relative min-h-[24px] py-0.5",
          hasReasoning && "cursor-pointer hover:opacity-80"
        )}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {isCompleted ? (
            <motion.div
              key="completed"
              initial={{ opacity: 0, filter: 'blur(4px)', scale: 0.95 }}
              animate={{ opacity: 1, filter: 'blur(0px)', scale: 1 }}
              exit={{ opacity: 0, filter: 'blur(4px)', scale: 1.05 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="text-[13px] text-muted-foreground flex items-center h-full"
            >
              Thought for {seconds}s
            </motion.div>
          ) : (
            <motion.div
              key="thinking"
              initial={{ opacity: 0, filter: 'blur(4px)', scale: 0.95 }}
              animate={{ opacity: 1, filter: 'blur(0px)', scale: 1 }}
              exit={{ opacity: 0, filter: 'blur(4px)', scale: 1.05 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="inline-flex items-center gap-2 h-full"
            >
              <AnimatedStratusLogo mode="thinking" size={20} />
              <span className="text-[13px] text-muted-foreground inline-flex items-center gap-1.5">
                <WaveText text={label} />
                <span className="font-mono text-[11px] tabular-nums opacity-60">
                  {seconds}s
                </span>
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {isExpanded && hasReasoning && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-1.5 mb-2 rounded-lg bg-secondary/40 border border-border/20 px-3 py-2.5">
              <div className="text-[12px] text-muted-foreground/50 leading-relaxed max-h-60 overflow-y-auto scrollbar-hide">
                <MarkdownRenderer content={reasoning} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
