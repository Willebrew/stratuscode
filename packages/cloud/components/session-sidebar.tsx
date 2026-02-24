'use client';

import { useQuery, useAction } from 'convex/react';
import { api } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';
import { Plus, GitBranch, Loader2, CheckCircle2, Circle, AlertCircle, X, Trash2, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { clsx } from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useRef } from 'react';
import { useSidebar } from './sidebar-context';

interface SessionSidebarProps {
  userId: string;
  currentSessionId?: Id<'sessions'> | null;
  onSelectSession: (sessionId: Id<'sessions'>) => void;
  onNewSession: () => void;
  onClose?: () => void;
  isMobileDrawer?: boolean;
}

function relativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function StatusIndicator({ status }: { status: string }) {
  switch (status) {
    case 'running':
    case 'booting':
      return <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin flex-shrink-0" />;
    case 'completed':
    case 'idle':
      return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />;
    case 'error':
      return <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />;
    default:
      return <Circle className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />;
  }
}

function SessionTitle({ title, isGenerated }: { title: string, isGenerated?: boolean }) {
  const [isTyping, setIsTyping] = useState(false);
  const prevTitle = useRef(title);

  useEffect(() => {
    if (title !== prevTitle.current) {
      if (prevTitle.current === "New Chat" && isGenerated) {
        setIsTyping(true);
      }
      prevTitle.current = title;
    }
  }, [title, isGenerated]);

  if (!isTyping) return <>{title}</>;

  return (
    <motion.span
      initial="hidden"
      animate="visible"
      onAnimationComplete={() => setIsTyping(false)}
      variants={{ visible: { transition: { staggerChildren: 0.03 } } }}
    >
      {title.split("").map((c, i) => (
        <motion.span key={i} variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }}>
          {c}
        </motion.span>
      ))}
    </motion.span>
  );
}

export function SessionSidebar({
  userId,
  currentSessionId,
  onSelectSession,
  onNewSession,
  onClose,
  isMobileDrawer = false,
}: SessionSidebarProps) {
  const sessions = useQuery(api.sessions.list, { userId });
  const deleteSession = useAction(api.session_actions.deleteSession);
  const { desktopCollapsed, toggleDesktop } = useSidebar();
  const [deletingId, setDeletingId] = useState<Id<'sessions'> | null>(null);

  const handleDelete = async (e: React.MouseEvent, sessionId: Id<'sessions'>) => {
    e.stopPropagation();
    if (deletingId) return; // Prevent double clicks

    setDeletingId(sessionId);
    try {
      await deleteSession({ id: sessionId });
      // Navigate back to /chat if we just deleted the session we're viewing
      if (sessionId === currentSessionId) {
        onNewSession();
      }
    } finally {
      // Clear after a small delay so the spinner doesn't flash back to a trash can while animating out
      setTimeout(() => {
        setDeletingId(null);
      }, 300);
    }
  };

  return (
    <div className={clsx(
      'flex flex-col h-full bg-[#0a0e14] pt-[9px]',
      isMobileDrawer ? 'w-full' : 'w-72'
    )}>
      {/* Header — h-14 + pt-2 aligns with main header (m-2 + h-14) */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-white/[0.06]">
        <span className="text-sm font-medium text-zinc-300">Sessions</span>
        <div className="flex items-center gap-1">
          <button
            onClick={onNewSession}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors"
            title="New Session"
          >
            <Plus className="w-4 h-4" />
          </button>
          {!isMobileDrawer && (
            <button
              onClick={toggleDesktop}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors"
              title="Hide sidebar"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          )}
          {isMobileDrawer && onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-1">
        {!sessions ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-4 h-4 text-zinc-500 animate-spin" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-zinc-500">No sessions yet</p>
            <button
              onClick={onNewSession}
              className="mt-3 text-sm text-blue-400 hover:text-blue-300 transition-colors"
            >
              Start a new session
            </button>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {sessions.map((session: any) => {
              const isActive = currentSessionId === session._id;
              return (
                <motion.div
                  key={session._id}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0, marginTop: 0, marginBottom: 0 }}
                  transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                  className={clsx(
                    'group relative',
                    'mx-1 overflow-hidden'
                  )}
                >
                  <button
                    onClick={() => onSelectSession(session._id)}
                    className={clsx(
                      'w-full text-left pl-3 pr-10 py-2.5 rounded-lg transition-colors',
                      'hover:bg-white/[0.04]',
                      'active:bg-white/[0.06]',
                      'min-h-[44px]',
                      isActive && 'bg-white/[0.06]'
                    )}
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <StatusIndicator status={session.status} />
                      <div className="flex-1 min-w-0 overflow-hidden">
                        <span className={clsx(
                          'text-sm font-medium block truncate',
                          isActive ? 'text-white' : 'text-zinc-300'
                        )}>
                          <SessionTitle
                            title={session.title || `${session.owner}/${session.repo}`}
                            isGenerated={session.titleGenerated}
                          />
                        </span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {session.branch && (
                            <>
                              <GitBranch className="w-3 h-3 text-zinc-600 flex-shrink-0" />
                              <span className="text-xs text-zinc-500 truncate">
                                {session.branch}
                              </span>
                              <span className="text-xs text-zinc-600 flex-shrink-0">&middot;</span>
                            </>
                          )}
                          <span className="text-xs text-zinc-600 flex-shrink-0">
                            {relativeTime(session.updatedAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                  {/* Delete button - visible on hover */}
                  <button
                    onClick={(e) => handleDelete(e, session._id)}
                    disabled={deletingId === session._id}
                    className={clsx(
                      'absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md pointer-events-auto',
                      'text-zinc-600 hover:text-red-400 hover:bg-red-500/10',
                      deletingId === session._id
                        ? 'opacity-100 lg:opacity-100 text-red-500 bg-red-500/10'
                        : 'opacity-100 lg:opacity-0 lg:group-hover:opacity-100',
                      'transition-all focus:opacity-100'
                    )}
                    title="Delete session"
                  >
                    {deletingId === session._id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                  </button>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
