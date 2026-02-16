'use client';

import { useParams } from 'next/navigation';
import { ChatInterface } from '../new/chat-interface';

export default function SessionPage() {
  const { sessionId } = useParams();
  if (!sessionId) return null;
  return <ChatInterface sessionId={sessionId as string} />;
}
