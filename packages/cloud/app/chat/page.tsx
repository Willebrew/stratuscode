'use client';

import { Suspense } from 'react';
import { ChatPageRouter } from './chat-page-router';
import ProtectedRoute from '@/components/ProtectedRoute';

export default function ChatPage() {
  return (
    <ProtectedRoute>
      <Suspense>
        <ChatPageRouter />
      </Suspense>
    </ProtectedRoute>
  );
}
