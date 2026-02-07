'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface CreateRepoOptions {
  name: string;
  description?: string;
  isPrivate?: boolean;
}

interface CreateRepoResult {
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  url: string;
}

export function useCreateRepo() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createRepo = useCallback(async (options: CreateRepoOptions): Promise<CreateRepoResult | null> => {
    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch('/api/repos/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: options.name,
          description: options.description || '',
          private: options.isPrivate ?? true,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create repository');
      }

      return data as CreateRepoResult;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createAndNavigate = useCallback(async (options: CreateRepoOptions) => {
    const result = await createRepo(options);
    if (result) {
      router.push(`/chat/new?owner=${result.owner}&repo=${result.name}&branch=${result.defaultBranch}`);
    }
    return result;
  }, [createRepo, router]);

  const reset = useCallback(() => {
    setError(null);
    setIsLoading(false);
  }, []);

  return {
    createRepo,
    createAndNavigate,
    isLoading,
    error,
    reset,
  };
}
