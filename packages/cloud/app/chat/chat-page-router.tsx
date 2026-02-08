'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LogOut } from 'lucide-react';
import { StratusLogo } from '@/components/stratus-logo';
import ProjectSelectionPage from './project-selection-page';
import { RepoSelector } from '@/components/repo-selector';
import { NewProjectForm } from '@/components/new-project-form';
import type { RepoInfo } from '@/app/api/repos/route';

interface ChatPageRouterProps {
  mode: string;
}

export function ChatPageRouter({ mode }: ChatPageRouterProps) {
  const router = useRouter();

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

  // Project selection screen (default)
  if (mode === 'select') {
    return (
      <div className="min-h-dvh flex flex-col relative">
        <div className="absolute inset-0 grid-pattern opacity-30" />
        <nav className="relative z-10 border-b border-border/50 glass sticky top-0">
          <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-foreground flex items-center justify-center">
                <StratusLogo className="w-4 h-4 text-background" />
              </div>
              <span className="font-semibold tracking-tight text-sm">StratusCode</span>
            </Link>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-3 py-2 rounded-full text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-all duration-200"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </nav>
        <main className="relative z-10 flex-1 flex items-center justify-center py-12">
          <ProjectSelectionPage />
        </main>
      </div>
    );
  }

  // Existing repo selector
  if (mode === 'select-repo') {
    return (
      <div className="min-h-dvh flex flex-col relative">
        <div className="absolute inset-0 grid-pattern opacity-30" />
        <nav className="relative z-10 border-b border-border/50 glass sticky top-0">
          <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-foreground flex items-center justify-center">
                <StratusLogo className="w-4 h-4 text-background" />
              </div>
              <span className="font-semibold tracking-tight text-sm">StratusCode</span>
            </Link>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-3 py-2 rounded-full text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-all duration-200"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </nav>
        <main className="relative z-10 flex-1 flex items-center justify-center py-12">
          <RepoSelector onSelect={handleRepoSelect} />
        </main>
      </div>
    );
  }

  // New project form
  if (mode === 'new-project') {
    return (
      <div className="min-h-dvh flex flex-col relative">
        <div className="absolute inset-0 grid-pattern opacity-30" />
        <nav className="relative z-10 border-b border-border/50 glass sticky top-0">
          <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-foreground flex items-center justify-center">
                <StratusLogo className="w-4 h-4 text-background" />
              </div>
              <span className="font-semibold tracking-tight text-sm">StratusCode</span>
            </Link>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-3 py-2 rounded-full text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-all duration-200"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </nav>
        <main className="relative z-10 flex-1 flex items-center justify-center py-12 px-6">
          <NewProjectForm />
        </main>
      </div>
    );
  }

  // Fallback to selection
  return (
    <div className="min-h-dvh flex items-center justify-center">
      <p className="text-muted-foreground">Unknown mode. Redirecting...</p>
    </div>
  );
}
