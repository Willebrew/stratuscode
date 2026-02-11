'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import ProjectSelectionPage from './project-selection-page';
import { RepoSelector } from '@/components/repo-selector';
import { NewProjectForm } from '@/components/new-project-form';
import type { RepoInfo } from '@/app/api/repos/route';

export function ChatPageRouter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = searchParams.get('mode') || 'select';

  const handleRepoSelect = (repo: RepoInfo, branch: string) => {
    const params = new URLSearchParams({
      owner: repo.owner,
      repo: repo.name,
      branch,
    });
    router.push(`/chat/new?${params.toString()}`);
  };

  return (
    <div className="h-full flex flex-col relative">
      <div className="absolute inset-0 grid-pattern opacity-30" />

      <main className="relative z-10 flex-1 min-h-0 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={mode}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className={
              mode === 'select'
                ? 'h-full flex items-center justify-center px-6 py-8 overflow-y-auto'
                : mode === 'select-repo'
                  ? 'h-full px-6 pt-8 pb-4'
                  : 'h-full py-12 px-6 overflow-y-auto'
            }
          >
            {mode === 'select' && <ProjectSelectionPage />}
            {mode === 'select-repo' && (
              <RepoSelector onSelect={handleRepoSelect} />
            )}
            {mode === 'new-project' && <NewProjectForm />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
