'use client';

import { useState, useEffect, useCallback } from 'react';
import type { RepoInfo } from '@/app/api/repos/route';

export interface UseReposReturn {
  repos: RepoInfo[];
  isLoading: boolean;
  error: string | null;
  search: string;
  setSearch: (search: string) => void;
  refresh: () => Promise<void>;
}

export function useRepos(): UseReposReturn {
  const [repos, setRepos] = useState<RepoInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const fetchRepos = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);

      const response = await fetch(`/api/repos?${params.toString()}`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch repositories');
      }

      const data = await response.json();
      setRepos(data.repos);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch repositories');
    } finally {
      setIsLoading(false);
    }
  }, [search]);

  useEffect(() => {
    fetchRepos();
  }, [fetchRepos]);

  return {
    repos,
    isLoading,
    error,
    search,
    setSearch,
    refresh: fetchRepos,
  };
}

export interface UseBranchesReturn {
  branches: { name: string; protected: boolean }[];
  isLoading: boolean;
  error: string | null;
}

export function useBranches(owner: string, repo: string): UseBranchesReturn {
  const [branches, setBranches] = useState<{ name: string; protected: boolean }[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!owner || !repo) {
      setBranches([]);
      return;
    }

    const fetchBranches = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/repos/${owner}/${repo}/branches`);
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to fetch branches');
        }

        const data = await response.json();
        setBranches(data.branches);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch branches');
      } finally {
        setIsLoading(false);
      }
    };

    fetchBranches();
  }, [owner, repo]);

  return { branches, isLoading, error };
}
