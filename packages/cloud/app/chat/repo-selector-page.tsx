'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { RepoSelector } from '@/components/repo-selector';
import { LogOut } from 'lucide-react';
import { StratusLogo } from '@/components/stratus-logo';
import type { RepoInfo } from '@/app/api/repos/route';

export function RepoSelectorPage() {
  const router = useRouter();

  const handleSelect = (repo: RepoInfo, branch: string) => {
    const params = new URLSearchParams({
      owner: repo.owner,
      repo: repo.name,
      branch,
    });
    router.push(`/chat/new?${params.toString()}`);
  };

  return (
    <div className="min-h-dvh flex flex-col grid-pattern">
      <nav className="border-b border-border bg-background/90 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-foreground flex items-center justify-center">
              <StratusLogo className="w-4 h-4 text-background" />
            </div>
            <span className="font-medium">StratusCode</span>
          </Link>
          <button
            onClick={async () => {
              await fetch('/api/auth/logout', { method: 'POST' });
              router.push('/');
            }}
            className="flex items-center gap-2 px-3 py-2 rounded-full text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </nav>

      <main className="flex-1 flex items-center justify-center py-12">
        <RepoSelector onSelect={handleSelect} />
      </main>
    </div>
  );
}
