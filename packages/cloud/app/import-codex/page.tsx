'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Zap, Upload, CheckCircle, AlertCircle } from 'lucide-react';

export default function ImportCodexPage() {
  const router = useRouter();
  const [configJson, setConfigJson] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleImport = async () => {
    setError('');
    setSuccess(false);
    setIsLoading(true);

    try {
      // Parse the config JSON
      const config = JSON.parse(configJson);

      // Extract Codex tokens from the config
      const codexProvider = config.providers?.['openai-codex'];
      if (!codexProvider || !codexProvider.auth) {
        setError('No Codex tokens found in config. Make sure you have authenticated with Codex in the CLI.');
        setIsLoading(false);
        return;
      }

      const { access, refresh, accountId } = codexProvider.auth;

      if (!access || !refresh) {
        setError('Invalid Codex tokens in config.');
        setIsLoading(false);
        return;
      }

      // Import the tokens
      const res = await fetch('/api/auth/codex/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken: access,
          refreshToken: refresh,
          accountId,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to import tokens');
        setIsLoading(false);
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        router.push('/chat');
      }, 2000);
    } catch (err) {
      if (err instanceof SyntaxError) {
        setError('Invalid JSON. Please paste the entire contents of your ~/.stratuscode/config.json file.');
      } else {
        setError('Failed to import tokens');
      }
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col grid-pattern">
      {/* Nav */}
      <nav className="p-4 border-b border-border bg-background/90 backdrop-blur-sm">
        <Link href="/" className="inline-flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-foreground flex items-center justify-center">
            <Zap className="w-4 h-4 text-background" />
          </div>
          <span className="font-medium">StratusCode</span>
        </Link>
      </nav>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center py-12 px-4">
        <div className="max-w-2xl w-full">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-full bg-foreground flex items-center justify-center mx-auto mb-4">
              <Upload className="w-8 h-8 text-background" />
            </div>
            <h1 className="font-serif text-3xl font-normal mb-2">Import Codex Tokens</h1>
            <p className="text-muted-foreground text-sm">
              Transfer your Codex authentication from the CLI to the web version
            </p>
          </div>

          <div className="bg-background border border-border rounded-2xl p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Paste your CLI config.json contents
              </label>
              <textarea
                value={configJson}
                onChange={(e) => setConfigJson(e.target.value)}
                placeholder='{"providers": {"openai-codex": {...}}}'
                className="w-full h-64 px-4 py-3 rounded-xl border border-border bg-background font-mono text-xs focus:outline-none focus:ring-2 focus:ring-foreground/20 resize-none"
              />
              <p className="text-xs text-muted-foreground mt-2">
                Location: <code className="bg-muted px-1.5 py-0.5 rounded">~/.stratuscode/config.json</code>
              </p>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            {success && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-green-50 border border-green-200">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-green-800">
                  Tokens imported successfully! Redirecting to chat...
                </p>
              </div>
            )}

            <button
              onClick={handleImport}
              disabled={!configJson || isLoading || success}
              className="w-full px-6 py-3 rounded-full bg-foreground text-background font-medium hover:bg-foreground/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Importing...' : 'Import Tokens'}
            </button>
          </div>

          <div className="mt-6 p-4 bg-muted/50 rounded-xl">
            <h3 className="font-medium text-sm mb-2">How to get your config:</h3>
            <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Open Terminal</li>
              <li>Run: <code className="bg-background px-1.5 py-0.5 rounded">cat ~/.stratuscode/config.json</code></li>
              <li>Copy the entire output</li>
              <li>Paste it in the box above</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
