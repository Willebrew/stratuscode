import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { isAuthenticated } from '@/lib/simple-auth';
import { ChatPageRouter } from './chat-page-router';

export const dynamic = 'force-dynamic';

export default async function ChatPage() {
  const authenticated = await isAuthenticated();

  if (!authenticated) {
    redirect('/login');
  }

  return (
    <Suspense>
      <ChatPageRouter />
    </Suspense>
  );
}
