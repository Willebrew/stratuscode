'use client';

import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useAuth } from '@/contexts/AuthContext';

export interface GitHubAuthStatus {
  connected: boolean;
  login?: string;
}

export function useGitHubAuth(): GitHubAuthStatus | undefined {
  const { user } = useAuth();
  const status = useQuery(
    api.github_auth.getStatus,
    user?.id ? { userId: user.id } : 'skip'
  );
  return status;
}
