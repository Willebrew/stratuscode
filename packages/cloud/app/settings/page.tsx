'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Zap, LogOut, Moon, Sun, Monitor, Link2, Loader2 } from 'lucide-react';

export default function SettingsPage() {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [linkingCodex, setLinkingCodex] = useState(false);
  const [codexError, setCodexError] = useState('');
  const [deviceCode, setDeviceCode] = useState<{ userCode: string; verificationUrl: string; deviceAuthId: string; interval: number } | null>(null);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
    } catch {
      setSigningOut(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col relative noise-texture">
      <div className="absolute inset-0 grid-pattern opacity-[0.3]" />
      <div className="absolute inset-0 hero-glow" />

      <nav className="relative z-10 px-6 py-5">
        <Link
          href="/chat"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors duration-200"
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </Link>
      </nav>

      <div className="relative z-10 flex-1 flex items-start justify-center pt-12 sm:pt-20">
        <div className="max-w-md w-full mx-6">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-foreground flex items-center justify-center shadow-sm">
              <Zap className="w-5 h-5 text-background" />
            </div>
            <h1 className="font-serif text-3xl font-normal">Settings</h1>
          </div>

          <div className="space-y-3">
            {/* Theme */}
            <div className="rounded-xl border border-border/50 bg-background/80 backdrop-blur-sm p-4">
              <div className="text-sm font-medium mb-1">Appearance</div>
              <p className="text-xs text-muted-foreground mb-3">Choose your preferred theme.</p>
              <div className="flex rounded-lg overflow-hidden border border-border/50">
                {[
                  { label: 'Light', icon: Sun },
                  { label: 'System', icon: Monitor },
                  { label: 'Dark', icon: Moon },
                ].map(({ label, icon: Icon }) => (
                  <button
                    key={label}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Account */}
            <div className="rounded-xl border border-border/50 bg-background/80 backdrop-blur-sm p-4">
              <div className="text-sm font-medium mb-1">Account</div>
              <p className="text-xs text-muted-foreground mb-3">Manage your session.</p>
              <button
                onClick={handleSignOut}
                disabled={signingOut}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border/50 text-sm text-muted-foreground hover:text-red-500 hover:border-red-500/30 transition-colors disabled:opacity-50"
              >
                <LogOut className="w-3.5 h-3.5" />
                {signingOut ? 'Signing out...' : 'Sign out'}
              </button>
            </div>

            {/* Codex Integration */}
            <div className="rounded-xl border border-border/50 bg-background/80 backdrop-blur-sm p-4">
              <div className="text-sm font-medium mb-1">Codex Integration</div>
              <p className="text-xs text-muted-foreground mb-3">Connect your OpenAI Codex account for enhanced capabilities.</p>
              {deviceCode ? (
                <div className="space-y-3">
                  <div className="rounded-lg border border-border/50 bg-secondary/30 p-3 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Enter this code at OpenAI:</p>
                    <p className="text-lg font-mono font-bold tracking-widest">{deviceCode.userCode}</p>
                  </div>
                  <a
                    href={deviceCode.verificationUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border/50 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors w-full justify-center"
                  >
                    <Link2 className="w-3.5 h-3.5" />
                    Open OpenAI Login
                  </a>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Waiting for authorization...
                  </div>
                </div>
              ) : (
                <button
                  onClick={async () => {
                    setLinkingCodex(true);
                    setCodexError('');
                    try {
                      const res = await fetch('/api/auth/codex/initiate', { method: 'POST' });
                      if (!res.ok) throw new Error('Failed to initiate');
                      const data = await res.json();
                      setDeviceCode(data);
                      window.open(data.verificationUrl, '_blank');

                      // Poll for completion
                      const pollInterval = (data.interval || 5) * 1000 + 3000;
                      const poll = async () => {
                        try {
                          const pollRes = await fetch('/api/auth/codex/poll', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ deviceAuthId: data.deviceAuthId, userCode: data.userCode }),
                          });
                          const result = await pollRes.json();
                          if (result.status === 'success') {
                            setDeviceCode(null);
                            setLinkingCodex(false);
                            router.push('/chat?codex_success=true');
                            return;
                          }
                          if (result.status === 'pending') {
                            setTimeout(poll, pollInterval);
                            return;
                          }
                          throw new Error(result.error || 'Authorization failed');
                        } catch (e) {
                          setCodexError(e instanceof Error ? e.message : 'Authorization failed. Try again.');
                          setDeviceCode(null);
                          setLinkingCodex(false);
                        }
                      };
                      setTimeout(poll, pollInterval);
                    } catch {
                      setCodexError('Failed to start authorization. Try again.');
                      setLinkingCodex(false);
                    }
                  }}
                  disabled={linkingCodex}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border/50 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors disabled:opacity-50"
                >
                  {linkingCodex ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Link2 className="w-3.5 h-3.5" />
                  )}
                  {linkingCodex ? 'Connecting...' : 'Link Codex Account'}
                </button>
              )}
              {codexError && (
                <p className="text-xs text-red-500 mt-2">{codexError}</p>
              )}
            </div>

            {/* About */}
            <div className="rounded-xl border border-border/50 bg-background/80 backdrop-blur-sm p-4">
              <div className="text-sm font-medium mb-1">About</div>
              <p className="text-xs text-muted-foreground">
                StratusCode Cloud · Powered by SAGE
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
