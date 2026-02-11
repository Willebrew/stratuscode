'use client';

import { createContext, useContext, useState, useCallback } from 'react';

interface SidebarContextValue {
  isOpen: boolean;
  toggle: () => void;
  close: () => void;
  desktopCollapsed: boolean;
  toggleDesktop: () => void;
}

const SidebarContext = createContext<SidebarContextValue>({
  isOpen: false,
  toggle: () => {},
  close: () => {},
  desktopCollapsed: false,
  toggleDesktop: () => {},
});

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggleDesktop = useCallback(() => setDesktopCollapsed((v) => !v), []);

  return (
    <SidebarContext.Provider value={{ isOpen, toggle, close, desktopCollapsed, toggleDesktop }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  return useContext(SidebarContext);
}
