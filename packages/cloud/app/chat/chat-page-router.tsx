'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LogOut, PanelLeftOpen, Menu, ChevronLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { StratusLogo } from '@/components/stratus-logo';
import { useSidebar } from '@/components/sidebar-context';
import ProjectSelectionPage from './project-selection-page';
import { RepoSelector } from '@/components/repo-selector';
import { NewProjectForm } from '@/components/new-project-form';
import type { RepoInfo } from '@/app/api/repos/route';

interface ChatPageRouterProps {
  mode: string;
}

export function ChatPageRouter({ mode }: ChatPageRouterProps) {
  const router = useRouter();
  const { desktopCollapsed, toggleDesktop, toggle } = useSidebar();

  const handleRepoSelect = (repo: RepoInfo, branch: string) => {
    const params = new URLSearchParams({
      owner: repo.owner,
      repo: repo.name,
      branch,
    });
    router.push(`/chat/new?${params.toString()}`);
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
  };

  const showBack = mode !== 'select';

  return (
    <div className="h-full flex flex-col relative">
      <div className="absolute inset-0 grid-pattern opacity-30" />

      {/* Shared nav — same height/position for all modes */}
      <nav className="relative z-10 border-b border-border/50 glass sticky top-0 flex-shrink-0">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={toggle}
              className="p-2 -ml-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors md:hidden flex items-center justify-center"
            >
              <Menu className="w-5 h-5" />
            </button>
            {desktopCollapsed && (
              <button
                onClick={toggleDesktop}
                className="hidden md:flex p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors items-center justify-center"
                title="Show sidebar"
              >
                <PanelLeftOpen className="w-4 h-4" />
              </button>
            )}
            <Link href={showBack ? '/chat' : '/'} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors duration-200 flex-shrink-0">
              {showBack && <ChevronLeft className="w-4 h-4" />}
              <div className="w-8 h-8 rounded-lg bg-foreground flex items-center justify-center">
                <StratusLogo className="w-4 h-4 text-background" />
              </div>
              <span className="font-semibold tracking-tight text-sm">StratusCode</span>
            </Link>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-2 rounded-full text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-all duration-200"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </nav>

      {/* Content — animated transitions */}
      <main className="relative z-10 flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          {mode === 'select' && (
            <motion.div
              key="select"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
              className="flex-1 flex items-center justify-center py-12 min-h-full"
            >
              <ProjectSelectionPage />
            </motion.div>
          )}

          {mode === 'select-repo' && (
            <motion.div
              key="select-repo"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
              className="flex-1 flex items-center justify-center py-12 min-h-full"
            >
              <RepoSelector onSelect={handleRepoSelect} />
            </motion.div>
          )}

          {mode === 'new-project' && (
            <motion.div
              key="new-project"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
              className="flex-1 flex items-center justify-center py-12 px-6 min-h-full"
            >
              <NewProjectForm />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
