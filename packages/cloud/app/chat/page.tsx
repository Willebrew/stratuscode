import { redirect } from 'next/navigation';
import { isAuthenticated } from '@/lib/simple-auth';
import { ChatPageRouter } from './chat-page-router';

interface ChatPageProps {
  searchParams: Promise<{ mode?: string }>;
}

export default async function ChatPage({ searchParams }: ChatPageProps) {
  const authenticated = await isAuthenticated();

  if (!authenticated) {
    redirect('/login');
  }

  const params = await searchParams;
  const mode = params.mode || 'select';

  return <ChatPageRouter mode={mode} />;
}
