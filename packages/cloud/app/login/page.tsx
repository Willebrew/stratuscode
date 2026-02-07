'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Zap, ArrowRight, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Login failed');
        return;
      }

      router.push('/chat');
    } catch {
      setError('Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col relative noise-texture">
      <div className="absolute inset-0 grid-pattern opacity-[0.3]" />
      <div className="absolute inset-0 hero-glow" />
      <div className="absolute top-0 -right-32 w-[400px] h-[400px] rounded-full bg-accent/[0.06] blur-[120px]" />
      <div className="absolute bottom-0 -left-20 w-[300px] h-[300px] rounded-full bg-accent/[0.05] blur-[80px]" />

      <nav className="relative z-10 px-6 py-5">
        <Link href="/" className="inline-flex items-center gap-2.5 hover:opacity-80 transition-opacity duration-200">
          <div className="w-8 h-8 rounded-lg bg-foreground flex items-center justify-center shadow-sm">
            <Zap className="w-4 h-4 text-background" />
          </div>
          <span className="font-semibold tracking-tight text-sm">StratusCode</span>
        </Link>
      </nav>

      <div className="relative z-10 flex-1 flex items-center justify-center">
        <div className="max-w-sm w-full mx-6 animate-fade-in-up">
          <div className="text-center mb-10">
            <div className="w-14 h-14 rounded-2xl bg-foreground flex items-center justify-center mx-auto mb-8 shadow-lg shadow-foreground/10">
              <Zap className="w-7 h-7 text-background" />
            </div>
            <h1 className="font-serif text-4xl font-normal mb-3">Welcome back</h1>
            <p className="text-muted-foreground text-sm">
              Enter your password to continue.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full px-5 py-4 rounded-2xl border border-border/50 bg-background/80 backdrop-blur-sm text-center text-sm focus:outline-none focus:ring-2 focus:ring-foreground/10 focus:border-foreground/20 transition-all duration-200 shadow-sm"
              autoFocus
            />
            
            {error && (
              <p className="text-red-500 text-sm text-center">{error}</p>
            )}

            <button
              type="submit"
              disabled={!password || isLoading}
              className="group w-full flex items-center justify-center gap-3 px-6 py-4 rounded-full bg-foreground text-background font-medium hover:bg-foreground/90 transition-all duration-200 disabled:opacity-40 hover:shadow-lg hover:shadow-foreground/5 hover:-translate-y-0.5"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  Continue
                  <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      <div className="relative z-10 px-6 py-6 text-center">
        <p className="text-xs text-muted-foreground/60">
          Powered by SAGE
        </p>
      </div>
    </div>
  );
}
