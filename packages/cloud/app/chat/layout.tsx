'use client';

import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { SessionSidebar } from '@/components/session-sidebar';
import { MobileDrawer } from '@/components/mobile-drawer';
import { AppHeader } from '@/components/app-header';
import { SidebarProvider, useSidebar } from '@/components/sidebar-context';
import { SendFnProvider, useSendFn } from '@/components/send-fn-context';
import type { Id } from '@/convex/_generated/dataModel';

const ease = [0.4, 0, 0.2, 1] as const;

function ChatLayoutInner({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const router = useRouter();
  const { close, desktopCollapsed, isExiting } = useSidebar();
  const { sendFn } = useSendFn();
  const sessionId = params.sessionId as Id<'sessions'> | undefined;

  const handleSelectSession = (id: Id<'sessions'>) => {
    router.push(`/chat/${id}`);
    // Delay close so navigation starts before sidebar unmounts
    setTimeout(close, 50);
  };

  const handleNewSession = () => {
    router.push('/chat');
    setTimeout(close, 50);
  };

  return (
    <motion.div
      className="h-dvh flex bg-[#0a0e14]"
      initial={{ opacity: 0 }}
      animate={{ opacity: isExiting ? 0 : 1 }}
      transition={{ duration: 0.3, ease }}
    >
      {/* Desktop sidebar */}
      <motion.div
        className={`hidden md:block flex-shrink-0 overflow-hidden ${
          desktopCollapsed ? 'w-0' : 'w-72'
        }`}
        initial={{ x: -288, opacity: 0 }}
        animate={{
          x: isExiting ? -288 : 0,
          opacity: isExiting ? 0 : 1,
        }}
        transition={{ duration: 0.35, ease }}
        style={{ transition: desktopCollapsed !== undefined ? 'width 200ms cubic-bezier(0.4,0,0.2,1)' : undefined }}
      >
        <SessionSidebar
          userId="owner"
          currentSessionId={sessionId ?? null}
          onSelectSession={handleSelectSession}
          onNewSession={handleNewSession}
        />
      </motion.div>

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
      <motion.main
        className={`flex-1 min-w-0 bg-background overflow-hidden rounded-2xl m-2 ${desktopCollapsed ? '' : 'md:ml-0'} flex flex-col`}
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{
          opacity: isExiting ? 0 : 1,
          scale: isExiting ? 0.97 : 1,
        }}
        transition={{ duration: 0.3, ease, delay: isExiting ? 0 : 0.05 }}
        style={{ transition: `margin 200ms cubic-bezier(0.4,0,0.2,1)` }}
      >
        {/* Persistent header — never unmounts */}
        <AppHeader
          sessionId={sessionId ?? null}
          onSend={sendFn ?? undefined}
        />
        <div className="flex-1 min-h-0 overflow-hidden">
          {children}
        </div>
      </motion.main>
    </motion.div>
  );
}

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <SendFnProvider>
        <ChatLayoutInner>{children}</ChatLayoutInner>
      </SendFnProvider>
    </SidebarProvider>
  );
}
