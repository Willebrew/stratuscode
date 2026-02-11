'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ChevronLeft, LogOut, Moon, Sun, Monitor, Link2, Loader2, Settings } from 'lucide-react';
import { StratusLogo } from '@/components/stratus-logo';

const ease = [0.4, 0, 0.2, 1] as const;

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
    <div className="h-dvh flex bg-[#0a0e14]">
      <main className="flex-1 min-w-0 bg-background overflow-hidden rounded-2xl m-2 flex flex-col">
        {/* Header */}
        <header className="border-b border-border/50 glass sticky top-0 z-40 flex-shrink-0">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
            <Link
              href="/chat"
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors duration-200 flex-shrink-0"
            >
              {/* Back arrow — animates in */}
              <motion.div
                className="overflow-hidden"
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 16, opacity: 1 }}
                transition={{ duration: 0.25, ease, delay: 0.15 }}
              >
                <ChevronLeft className="w-4 h-4" />
              </motion.div>
              <div className="w-8 h-8 rounded-lg bg-foreground flex items-center justify-center">
                <StratusLogo className="w-4 h-4 text-background" />
              </div>
              <span className="font-semibold tracking-tight text-sm">StratusCode</span>
            </Link>
            <div className="ml-auto flex items-center gap-2">
              <motion.div
                className="flex items-center justify-center w-8 h-8 rounded-lg bg-secondary text-foreground"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.2, ease, delay: 0.2 }}
              >
                <Settings className="w-4 h-4" />
              </motion.div>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <motion.div
            className="max-w-md mx-auto px-6 py-8 sm:py-12"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease, delay: 0.1 }}
          >
            <div className="flex items-center gap-3 mb-8">
              <h1 className="font-serif text-3xl font-normal">Settings</h1>
            </div>

            <div className="space-y-3">
              {/* Theme */}
              <div className="rounded-xl border border-border/50 bg-background p-4">
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
              <div className="rounded-xl border border-border/50 bg-background p-4">
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
              <div className="rounded-xl border border-border/50 bg-background p-4">
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
              <div className="rounded-xl border border-border/50 bg-background p-4">
                <div className="text-sm font-medium mb-1">About</div>
                <p className="text-xs text-muted-foreground">
                  StratusCode Cloud · Powered by SAGE
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </main>
    </div>
  );
}
