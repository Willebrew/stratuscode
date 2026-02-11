'use client';

import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';

interface CreateSessionProps {
  owner: string;
  repo: string;
  branch: string;
}

export function CreateSession({ owner, repo, branch }: CreateSessionProps) {
  const createSession = useMutation(api.sessions.create);
  const router = useRouter();
  const createdRef = useRef(false);

  useEffect(() => {
    if (createdRef.current) return;
    createdRef.current = true;

    // Use saved model preference from settings (if any)
    const savedModel = typeof window !== 'undefined'
      ? localStorage.getItem('stratuscode_default_model') || undefined
      : undefined;

    createSession({
      userId: 'owner',
      owner,
      repo,
      branch,
      model: savedModel,
    }).then((sessionId) => {
      router.replace(`/chat/${sessionId}`);
    });
  }, [createSession, owner, repo, branch, router]);

  return (
    <div className="h-dvh flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Creating session...</p>
      </div>
    </div>
  );
}
