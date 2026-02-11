'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useSidebar } from './sidebar-context';

interface MobileDrawerProps {
  children: React.ReactNode;
}

export function MobileDrawer({ children }: MobileDrawerProps) {
  const { isOpen, close } = useSidebar();

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/60 z-40 lg:hidden"
            onClick={close}
          />
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            drag="x"
            dragConstraints={{ left: -288, right: 0 }}
            dragElastic={0}
            onDragEnd={(_, info) => {
              if (info.offset.x < -80 || info.velocity.x < -500) {
                close();
              }
            }}
            className="fixed inset-y-0 left-0 w-72 z-50 lg:hidden will-change-transform"
          >
            <div className="h-full overflow-hidden">
              {children}
            </div>
            {/* Inverted corners on right edge — concave curves matching main content rounding */}
            <div
              className="absolute top-2 -right-4 w-4 h-4 pointer-events-none"
              style={{ background: 'radial-gradient(circle at 100% 100%, transparent 16px, #0a0e14 16px)' }}
            />
            <div
              className="absolute bottom-2 -right-4 w-4 h-4 pointer-events-none"
              style={{ background: 'radial-gradient(circle at 100% 0, transparent 16px, #0a0e14 16px)' }}
            />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
