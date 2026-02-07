import { redirect } from 'next/navigation';
import { isAuthenticated } from '@/lib/simple-auth';
import { ChatInterface } from './chat-interface';

interface NewChatPageProps {
  searchParams: Promise<{ owner?: string; repo?: string; branch?: string }>;
}

export default async function NewChatPage({ searchParams }: NewChatPageProps) {
  const authenticated = await isAuthenticated();

  if (!authenticated) {
    redirect('/login');
  }

  const params = await searchParams;
  const { owner, repo, branch } = params;

  if (!owner || !repo || !branch) {
    redirect('/chat');
  }

  return (
    <ChatInterface
      owner={owner}
      repo={repo}
      branch={branch}
    />
  );
}
