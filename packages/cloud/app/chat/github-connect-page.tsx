'use client';

import { Github } from 'lucide-react';

export default function GitHubConnectPage() {
  const handleConnect = () => {
    window.location.href = '/api/auth/github/connect';
  };

  return (
    <div className="max-w-lg w-full px-6">
      <div className="text-center mb-8 md:mb-12 animate-fade-in-up">
        <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-6">
          <Github className="w-8 h-8 text-foreground" />
        </div>
        <h1 className="font-serif text-3xl md:text-4xl font-normal mb-3 md:mb-4">
          Connect GitHub
        </h1>
        <p className="text-muted-foreground text-base md:text-lg font-light max-w-md mx-auto leading-relaxed">
          StratusCode needs access to your GitHub account to list, create, and manage repositories on your behalf.
        </p>
      </div>

      <div className="flex justify-center animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
        <button
          onClick={handleConnect}
          className="flex items-center gap-3 px-8 py-4 rounded-xl bg-foreground text-background font-medium text-base transition-all duration-200 hover:opacity-90 hover:-translate-y-0.5 hover:shadow-lg"
        >
          <Github className="w-5 h-5" />
          Authorize GitHub Access
        </button>
      </div>

      <p className="text-center text-muted-foreground/60 text-xs mt-6 max-w-sm mx-auto leading-relaxed animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
        We request <code className="text-muted-foreground/80">repo</code> and <code className="text-muted-foreground/80">read:user</code> scopes.
        You can disconnect at any time from settings.
      </p>
    </div>
  );
}
