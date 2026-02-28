import { Suspense } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { NewChatContent } from './new-chat-content';

export const dynamic = 'force-dynamic';

export default function NewChatPage() {
  return (
    <ProtectedRoute>
      <Suspense>
        <NewChatContent />
      </Suspense>
    </ProtectedRoute>
  );
}
