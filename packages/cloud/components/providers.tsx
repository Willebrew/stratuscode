'use client';

import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { useMemo } from 'react';
import { ToastProvider } from './toast';

let cachedClient: ConvexReactClient | null = null;

function getConvexUrl(): string | null {
  const envUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!envUrl) return null;
  // When accessing remotely (not localhost), rewrite the Convex URL
  // to use the browser's hostname so WebSocket connections reach the server.
  if (typeof window !== 'undefined') {
    const browserHost = window.location.hostname;
    if (browserHost && browserHost !== 'localhost' && browserHost !== '127.0.0.1') {
      try {
        const parsed = new URL(envUrl);
        parsed.hostname = browserHost;
        return parsed.toString().replace(/\/$/, '');
      } catch {}
    }
  }
  return envUrl;
}

function getConvexClient(): ConvexReactClient | null {
  if (cachedClient) return cachedClient;
  const url = getConvexUrl();
  if (!url) return null;
  cachedClient = new ConvexReactClient(url);
  return cachedClient;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const convex = useMemo(() => getConvexClient(), []);

  if (!convex) return <ToastProvider>{children}</ToastProvider>;

  return (
    <ConvexProvider client={convex}>
      <ToastProvider>{children}</ToastProvider>
    </ConvexProvider>
  );
}
