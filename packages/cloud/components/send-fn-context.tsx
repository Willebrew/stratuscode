'use client';

import { createContext, useContext, useState, useCallback } from 'react';

interface SendFnContextValue {
  sendFn: ((msg: string) => void) | null;
  registerSendFn: (fn: ((msg: string) => void) | null) => void;
}

const SendFnContext = createContext<SendFnContextValue>({
  sendFn: null,
  registerSendFn: () => {},
});

export function SendFnProvider({ children }: { children: React.ReactNode }) {
  const [sendFn, setSendFn] = useState<((msg: string) => void) | null>(null);

  const registerSendFn = useCallback((fn: ((msg: string) => void) | null) => {
    setSendFn(() => fn);
  }, []);

  return (
    <SendFnContext.Provider value={{ sendFn, registerSendFn }}>
      {children}
    </SendFnContext.Provider>
  );
}

export function useSendFn() {
  return useContext(SendFnContext);
}
