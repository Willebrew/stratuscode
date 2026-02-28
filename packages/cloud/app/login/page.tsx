'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { StratusLogo } from '@/components/stratus-logo';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    // If already authenticated, go to chat
    if (!loading && isAuthenticated) {
      router.replace('/chat');
      return;
    }

    // If not authenticated and done loading, redirect to nql-auth
    if (!loading && !isAuthenticated && !redirecting) {
      setRedirecting(true);
      const nqlAuthUrl =
        process.env.NEXT_PUBLIC_NQL_AUTH_URL ||
        'https://auth.neuroquestlabs.ai';
      const ssoCallback = `${window.location.origin}/api/auth/sso`;
      window.location.href = `${nqlAuthUrl}/login?redirect_to=${encodeURIComponent(ssoCallback)}&final=${encodeURIComponent('/chat')}`;
    }
  }, [loading, isAuthenticated, router, redirecting]);

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-[#0a0e14]">
      <div className="flex flex-col items-center gap-4 animate-fade-in-up">
        <div className="w-14 h-14 rounded-2xl bg-foreground flex items-center justify-center shadow-lg shadow-foreground/10">
          <StratusLogo className="w-7 h-7 text-background" />
        </div>
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Redirecting to sign in...</p>
      </div>
    </div>
  );
}
