'use client';

import { useState } from 'react';
import { Search, Lock, Globe, GitBranch, Loader2, ChevronRight, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useRepos, useBranches } from '@/hooks/use-repos';
import type { RepoInfo } from '@/app/api/repos/route';

interface RepoSelectorProps {
  onSelect: (repo: RepoInfo, branch: string) => void;
}

function BranchList({ owner, name, defaultBranch, onBranchSelect }: {
  owner: string;
  name: string;
  defaultBranch: string;
  onBranchSelect: (branch: string) => void;
}) {
  const { branches, isLoading } = useBranches(owner, name);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-3 px-2 text-muted-foreground">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        <span className="text-xs">Loading branches...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2 py-3 px-2">
      {branches.map((branch) => (
        <button
          key={branch.name}
          onClick={(e) => {
            e.stopPropagation();
            onBranchSelect(branch.name);
          }}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
            branch.name === defaultBranch
              ? 'bg-foreground text-background'
              : 'bg-secondary text-muted-foreground hover:bg-foreground/10 hover:text-foreground'
          }`}
        >
          <GitBranch className="w-3 h-3" />
          {branch.name}
          {branch.protected && <Lock className="w-2.5 h-2.5 opacity-60" />}
        </button>
      ))}
    </div>
  );
}

export function RepoSelector({ onSelect }: RepoSelectorProps) {
  const router = useRouter();
  const { repos, isLoading, error, search, setSearch } = useRepos();
  const [expandedRepoId, setExpandedRepoId] = useState<number | null>(null);

  const handleRepoClick = (repo: RepoInfo) => {
    setExpandedRepoId(expandedRepoId === repo.id ? null : repo.id);
  };

  const handleBranchSelect = (repo: RepoInfo, branch: string) => {
    onSelect(repo, branch);
  };

  return (
    <div className="max-w-2xl mx-auto w-full px-6">
      <div className="mb-8 animate-fade-in-up">
        <button
          onClick={() => router.push('/chat')}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors mb-6 flex items-center gap-1"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to selection
        </button>
        
        <h1 className="font-serif text-3xl md:text-4xl font-normal mb-2">Select a repository</h1>
        <p className="text-muted-foreground text-sm">
          Choose a repository, then pick a branch to start your session.
        </p>
      </div>

      {/* Search */}
      <div className="relative mb-6 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search repositories..."
          className="w-full pl-11 pr-4 py-3.5 rounded-2xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-foreground/10 focus:border-foreground/20 text-base transition-all duration-200"
        />
      </div>

      {/* Repo list */}
      <div className="border border-border/50 rounded-2xl overflow-hidden bg-background animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="text-center py-20 text-red-500 text-sm">{error}</div>
        ) : repos.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground text-sm">
            No repositories found
          </div>
        ) : (
          <div className="max-h-[32rem] overflow-y-auto divide-y divide-border/50">
            {repos.map((repo) => {
              const isExpanded = expandedRepoId === repo.id;
              return (
                <div key={repo.id}>
                  <button
                    onClick={() => handleRepoClick(repo)}
                    className={`w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-secondary/30 transition-all duration-200 ${
                      isExpanded ? 'bg-secondary/20' : ''
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-200 ${
                      isExpanded ? 'bg-foreground' : 'bg-secondary'
                    }`}>
                      {repo.private ? (
                        <Lock className={`w-4 h-4 transition-colors duration-200 ${isExpanded ? 'text-background' : 'text-muted-foreground'}`} />
                      ) : (
                        <Globe className={`w-4 h-4 transition-colors duration-200 ${isExpanded ? 'text-background' : 'text-muted-foreground'}`} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{repo.fullName}</div>
                      {repo.description && (
                        <div className="text-xs text-muted-foreground truncate mt-1">
                          {repo.description}
                        </div>
                      )}
                    </div>
                    {repo.language && (
                      <span className="text-xs px-2.5 py-1 rounded-full bg-secondary text-muted-foreground flex-shrink-0 font-medium">
                        {repo.language}
                      </span>
                    )}
                    <motion.div
                      animate={{ rotate: isExpanded ? 90 : 0 }}
                      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                    >
                      <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    </motion.div>
                  </button>

                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                        className="overflow-hidden"
                      >
                        <div className="px-5 pb-4 border-t border-border/30 bg-secondary/10">
                          <div className="flex items-center gap-1.5 pt-3 pb-1 text-xs text-muted-foreground font-medium">
                            <GitBranch className="w-3 h-3" />
                            <span>Select a branch</span>
                          </div>
                          <BranchList
                            owner={repo.owner}
                            name={repo.name}
                            defaultBranch={repo.defaultBranch}
                            onBranchSelect={(branch) => handleBranchSelect(repo, branch)}
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
