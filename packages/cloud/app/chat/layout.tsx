'use client';

import { useParams, useRouter } from 'next/navigation';
import { SessionSidebar } from '@/components/session-sidebar';
import { MobileDrawer } from '@/components/mobile-drawer';
import { SidebarProvider, useSidebar } from '@/components/sidebar-context';
import type { Id } from '@/convex/_generated/dataModel';

function ChatLayoutInner({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const router = useRouter();
  const { close } = useSidebar();

  const sessionId = params.sessionId as Id<'sessions'> | undefined;

  const handleSelectSession = (id: Id<'sessions'>) => {
    close();
    router.push(`/chat/${id}`);
  };

  const handleNewSession = () => {
    close();
    router.push('/chat');
  };

  return (
    <div className="h-dvh flex">
      {/* Desktop sidebar */}
      <div className="hidden md:block flex-shrink-0">
        <SessionSidebar
          userId="owner"
          currentSessionId={sessionId ?? null}
          onSelectSession={handleSelectSession}
          onNewSession={handleNewSession}
        />
      </div>

      {/* Mobile drawer */}
      <MobileDrawer>
        <SessionSidebar
          userId="owner"
          currentSessionId={sessionId ?? null}
          onSelectSession={handleSelectSession}
          onNewSession={handleNewSession}
          onClose={close}
          isMobileDrawer
        />
      </MobileDrawer>

      {/* Main content */}
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <ChatLayoutInner>{children}</ChatLayoutInner>
    </SidebarProvider>
  );
}
