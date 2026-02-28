'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { CreateSession } from './create-session';

export function NewChatContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const owner = searchParams.get('owner');
  const repo = searchParams.get('repo');
  const branch = searchParams.get('branch');

  useEffect(() => {
    if (!owner || !repo || !branch) {
      router.replace('/chat');
    }
  }, [owner, repo, branch, router]);

  if (!owner || !repo || !branch) {
    return null;
  }

  return <CreateSession owner={owner} repo={repo} branch={branch} />;
}
