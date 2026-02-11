'use client';

import { useParams, useRouter } from 'next/navigation';
import { SessionSidebar } from '@/components/session-sidebar';
import { MobileDrawer } from '@/components/mobile-drawer';
import { SidebarProvider, useSidebar } from '@/components/sidebar-context';
import type { Id } from '@/convex/_generated/dataModel';

function ChatLayoutInner({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const router = useRouter();
  const { close, desktopCollapsed } = useSidebar();
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
    <div className="h-dvh flex bg-[#0a0e14]">
      {/* Desktop sidebar */}
      <div
        className={`hidden md:block flex-shrink-0 transition-[width] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] overflow-hidden ${
          desktopCollapsed ? 'w-0' : 'w-72'
        }`}
      >
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
      <main className={`flex-1 min-w-0 bg-background overflow-hidden transition-[border-radius] duration-200 ${desktopCollapsed ? '' : 'md:rounded-tl-2xl md:rounded-bl-2xl'}`}>
        {children}
      </main>
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
