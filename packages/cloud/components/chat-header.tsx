'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { GitBranch, GitPullRequest, GitCommitHorizontal, ChevronLeft, ChevronDown, Settings, Menu } from 'lucide-react';
import { StratusLogo } from './stratus-logo';
import { useSidebar } from './sidebar-context';

interface ChatHeaderProps {
  owner: string;
  repo: string;
  branch: string;
  sessionId: string | null;
  hasChanges?: boolean;
  onSend?: (message: string) => void;
}

export function ChatHeader({
  owner,
  repo,
  branch,
  sessionId,
  hasChanges,
  onSend,
}: ChatHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { toggle } = useSidebar();

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <header className="border-b border-border/50 glass sticky top-0 z-40">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          {/* Mobile sidebar toggle */}
          <button
            onClick={toggle}
            className="p-2 -ml-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors md:hidden min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <Menu className="w-5 h-5" />
          </button>
          <Link
            href="/chat"
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors duration-200 flex-shrink-0"
          >
            <ChevronLeft className="w-4 h-4 hidden md:block" />
            <div className="w-7 h-7 rounded-lg bg-foreground flex items-center justify-center">
              <StratusLogo className="w-3.5 h-3.5 text-background" />
            </div>
          </Link>
          <div className="h-4 w-px bg-border/50 hidden sm:block" />
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

        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          {sessionId && hasChanges && (
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
          {sessionId && !hasChanges && (
            <div className="text-xs text-muted-foreground/60 hidden sm:block">
              No changes yet
            </div>
          )}
          <Link
            href="/settings"
            className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-all duration-200"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </header>
  );
}
