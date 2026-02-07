'use client';

import { useEffect, useState } from 'react';
import { Loader2, Check, Server } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';

export type SandboxState = 'idle' | 'initializing' | 'cloning' | 'ready';

interface SandboxStatusProps {
  status: SandboxState;
}

const STATUS_LABELS: Record<SandboxState, string> = {
  idle: '',
  initializing: 'Setting up the environment...',
  cloning: 'Cloning repository...',
  ready: 'Environment ready',
};

export function SandboxStatus({ status }: SandboxStatusProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (status !== 'idle') {
      setVisible(true);
    }
    if (status === 'ready') {
      const timer = setTimeout(() => setVisible(false), 2500);
      return () => clearTimeout(timer);
    }
  }, [status]);

  return (
    <AnimatePresence>
      {visible && status !== 'idle' && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3 }}
          className="flex items-center justify-center py-4"
        >
          <div className={clsx(
            'inline-flex items-center gap-2.5 px-4 py-2 rounded-full text-xs',
            status === 'ready'
              ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
              : 'bg-secondary text-muted-foreground'
          )}>
            {status === 'ready' ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            )}
            <span>{STATUS_LABELS[status]}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
