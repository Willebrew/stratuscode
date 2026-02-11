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
            className="fixed inset-0 bg-black/60 z-40 md:hidden"
            onClick={close}
          />
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.1}
            onDragEnd={(_, info) => {
              if (info.offset.x < -80 || info.velocity.x < -500) {
                close();
              }
            }}
            className="fixed inset-y-0 left-0 w-72 z-50 md:hidden"
          >
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
