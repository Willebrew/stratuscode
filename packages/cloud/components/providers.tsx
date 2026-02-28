'use client';

import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { useMemo } from 'react';
import { ToastProvider } from './toast';
import { AuthProvider } from '@/contexts/AuthContext';

let cachedClient: ConvexReactClient | null = null;

function getConvexClient(): ConvexReactClient | null {
  if (cachedClient) return cachedClient;
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) return null;
  cachedClient = new ConvexReactClient(url);
  return cachedClient;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const convex = useMemo(() => getConvexClient(), []);

  if (!convex) {
    return (
      <AuthProvider>
        <ToastProvider>{children}</ToastProvider>
      </AuthProvider>
    );
  }

  return (
    <AuthProvider>
      <ConvexProvider client={convex}>
        <ToastProvider>{children}</ToastProvider>
      </ConvexProvider>
    </AuthProvider>
  );
}
