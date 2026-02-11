import { redirect } from 'next/navigation';
import { isAuthenticated } from '@/lib/simple-auth';
import { ChatInterface } from '../new/chat-interface';

interface SessionPageProps {
  params: Promise<{ sessionId: string }>;
}

export default async function SessionPage({ params }: SessionPageProps) {
  const authenticated = await isAuthenticated();
  if (!authenticated) {
    redirect('/login');
  }

  const { sessionId } = await params;
  return <ChatInterface sessionId={sessionId} />;
}
