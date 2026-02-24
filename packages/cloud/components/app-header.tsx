'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';
import {
  GitBranch, GitPullRequest, GitCommitHorizontal,
  ChevronLeft, ChevronDown, Settings, Menu, PanelLeftOpen, LogOut, FolderOpen,
} from 'lucide-react';
import { StratusLogo } from './stratus-logo';
import { useSidebar } from './sidebar-context';
import { WorkspaceBrowser } from './workspace-browser';

interface AppHeaderProps {
  sessionId?: Id<'sessions'> | null;
  onSend?: (message: string) => void;
}

export function AppHeader({ sessionId, onSend }: AppHeaderProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [browserOpen, setBrowserOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { toggle, desktopCollapsed, toggleDesktop, triggerExit } = useSidebar();

  const session = useQuery(
    api.sessions.get,
    sessionId ? { id: sessionId } : 'skip'
  );

  const searchParams = useSearchParams();
  const mode = searchParams.get('mode') || 'select';

  const inSession = !!sessionId;
  const showBack = inSession || mode !== 'select';
  const hasChanges = session?.hasChanges === true;
  const owner = session?.owner ?? '';
  const repo = session?.repo ?? '';
  const branch = session?.branch ?? '';

  // Cache last known model name so it doesn't flicker to empty while switching sessions
  const lastModelRef = useRef<string>('');
  if (session?.model) lastModelRef.current = session.model;
  const displayModel = session?.model ?? (inSession ? lastModelRef.current : '');

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleLogout = async () => {
    triggerExit();
    await fetch('/api/auth/logout', { method: 'POST' });
    // Wait for exit animation to finish
    await new Promise((r) => setTimeout(r, 300));
    router.push('/');
  };

  return (
    <header className="border-b border-border/50 glass sticky top-0 z-40 flex-shrink-0">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
        {/* Left side */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {/* Mobile sidebar toggle */}
          <button
            onClick={toggle}
            className="p-2 -ml-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors lg:hidden flex items-center justify-center"
          >
            <Menu className="w-5 h-5" />
          </button>
          {/* Desktop sidebar toggle (when collapsed) */}
          {desktopCollapsed && (
            <button
              onClick={toggleDesktop}
              className="hidden lg:flex p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors items-center justify-center"
              title="Show sidebar"
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
          )}

          {/* Logo with animated back arrow */}
          <Link
            href="/chat"
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors duration-200 flex-shrink-0"
          >
            <div
              className="overflow-hidden transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]"
              style={{ width: showBack ? 16 : 0, opacity: showBack ? 1 : 0 }}
            >
              <ChevronLeft className="w-4 h-4" />
            </div>
            <div className="w-8 h-8 rounded-xl bg-foreground/10 border border-foreground/[0.08] flex items-center justify-center">
              <StratusLogo className="w-5 h-5 text-foreground" />
            </div>
            {/* Show brand name when not in session, model name when in session */}
            <div className="overflow-hidden transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]" style={{ maxWidth: inSession ? 0 : 200, opacity: inSession ? 0 : 1 }}>
              <span className="font-semibold tracking-tight text-sm whitespace-nowrap">StratusCode</span>
            </div>
          </Link>
          {/* Model name — animates in when entering a session */}
          <div
            className="overflow-hidden transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]"
            style={{ maxWidth: inSession && displayModel ? 200 : 0, opacity: inSession && displayModel ? 1 : 0 }}
          >
            <span className="text-xs text-muted-foreground font-mono whitespace-nowrap">{displayModel}</span>
          </div>

          {/* Session info — fades in */}
          <div
            className="flex items-center gap-2 sm:gap-3 min-w-0 overflow-hidden transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]"
            style={{ opacity: inSession ? 1 : 0, maxWidth: inSession ? 500 : 0 }}
          >
            <div className="h-4 w-px bg-border/50 hidden sm:block flex-shrink-0" />
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
              <span className="text-xs sm:text-sm font-medium truncate">{owner}</span>
              <span className="text-muted-foreground/50">/</span>
              <span className="text-xs sm:text-sm font-medium truncate">{repo}</span>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-secondary text-xs text-muted-foreground flex-shrink-0">
              <GitBranch className="w-3 h-3" />
              <span className="font-medium">{branch}</span>
            </div>
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          {/* Workspace browser — when in a session */}
          {inSession && (
            <button
              onClick={() => setBrowserOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
              title="Browse workspace files"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Files</span>
            </button>
          )}

          {/* Ship It — only in session with changes */}
          {inSession && hasChanges && (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-foreground text-background text-sm font-medium hover:bg-foreground/90 transition-all duration-200 hover:shadow-md"
              >
                <GitPullRequest className="w-4 h-4" />
                <span className="hidden sm:inline">Ship it</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-2 w-52 rounded-xl border border-border/50 bg-background shadow-xl z-50 py-1 overflow-hidden">
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onSend?.('Commit all changes to the working branch with a descriptive commit message.');
                    }}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-secondary/50 transition-colors duration-200 text-left"
                  >
                    <GitCommitHorizontal className="w-4 h-4 text-muted-foreground" />
                    Commit to branch
                  </button>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onSend?.('Commit all changes, push the branch, and open a pull request with a descriptive title and body.');
                    }}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-secondary/50 transition-colors duration-200 text-left"
                  >
                    <GitPullRequest className="w-4 h-4 text-muted-foreground" />
                    Open PR
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Sign Out — only when not in session */}
          {!inSession && (
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-3 py-2 rounded-full text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-all duration-200"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          )}

          {/* Settings — always visible */}
          <Link
            href="/settings"
            className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-all duration-200"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* Workspace file browser panel */}
      {sessionId && (
        <WorkspaceBrowser
          sessionId={sessionId}
          isOpen={browserOpen}
          onClose={() => setBrowserOpen(false)}
        />
      )}
    </header>
  );
}
