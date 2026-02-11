'use client';

import { useQuery, useMutation } from 'convex/react';
import { api } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';
import { Plus, GitBranch, Loader2, CheckCircle2, Circle, AlertCircle, X, Trash2, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { clsx } from 'clsx';
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

export function SessionSidebar({
  userId,
  currentSessionId,
  onSelectSession,
  onNewSession,
  onClose,
  isMobileDrawer = false,
}: SessionSidebarProps) {
  const sessions = useQuery(api.sessions.list, { userId });
  const removeSession = useMutation(api.sessions.remove);
  const { desktopCollapsed, toggleDesktop } = useSidebar();

  const handleDelete = async (e: React.MouseEvent, sessionId: Id<'sessions'>) => {
    e.stopPropagation();
    await removeSession({ id: sessionId });
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
          sessions.map((session: any) => {
            const isActive = currentSessionId === session._id;
            return (
              <div
                key={session._id}
                className={clsx(
                  'group relative',
                  'mx-1'
                )}
              >
                <button
                  onClick={() => onSelectSession(session._id)}
                  className={clsx(
                    'w-full text-left px-3 py-2.5 rounded-lg transition-colors',
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
                        {session.title || `${session.owner}/${session.repo}`}
                      </span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <GitBranch className="w-3 h-3 text-zinc-600 flex-shrink-0" />
                        <span className="text-xs text-zinc-500 truncate">
                          {session.branch}
                        </span>
                        <span className="text-xs text-zinc-600 flex-shrink-0">
                          &middot; {relativeTime(session.updatedAt)}
                        </span>
                      </div>
                      {session.lastMessage && (
                        <p className="text-xs text-zinc-500 mt-1 truncate">
                          {session.lastMessage}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
                {/* Delete button - visible on hover */}
                <button
                  onClick={(e) => handleDelete(e, session._id)}
                  className={clsx(
                    'absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md',
                    'text-zinc-600 hover:text-red-400 hover:bg-red-500/10',
                    'opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-all',
                    'focus:opacity-100'
                  )}
                  title="Delete session"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
