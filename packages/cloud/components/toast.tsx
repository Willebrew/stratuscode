'use client';

import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertCircle, CheckCircle, Info } from 'lucide-react';

type ToastType = 'error' | 'success' | 'info';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

const ICONS: Record<ToastType, typeof AlertCircle> = {
  error: AlertCircle,
  success: CheckCircle,
  info: Info,
};

const COLORS: Record<ToastType, string> = {
  error: 'text-red-400',
  success: 'text-emerald-400',
  info: 'text-zinc-400',
};

const DURATION = 4000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [mounted, setMounted] = useState(false);
  const idRef = useRef(0);

  useEffect(() => { setMounted(true); }, []);

  const addToast = useCallback((message: string, type: ToastType = 'error') => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev.slice(-4), { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, DURATION);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      {mounted && (
        <div className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2 pointer-events-none">
          <AnimatePresence>
            {toasts.map((t) => {
              const Icon = ICONS[t.type];
              return (
                <motion.div
                  key={t.id}
                  initial={{ opacity: 0, y: 12, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.95 }}
                  transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                  className="pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-xl border border-white/[0.08] bg-[#0a0e14] shadow-2xl max-w-sm"
                >
                  <Icon className={`w-4 h-4 flex-shrink-0 ${COLORS[t.type]}`} />
                  <span className="text-sm text-zinc-300 flex-1">{t.message}</span>
                  <button
                    onClick={() => dismiss(t.id)}
                    className="p-0.5 rounded text-zinc-600 hover:text-zinc-300 transition-colors flex-shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </ToastContext.Provider>
  );
}
