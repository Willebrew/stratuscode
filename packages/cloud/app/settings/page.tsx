'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ChevronLeft, LogOut, Moon, Sun, Monitor, Link2, Loader2, Settings, Check, Cpu, Key, X } from 'lucide-react';
import { StratusLogo } from '@/components/stratus-logo';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuth } from '@/contexts/AuthContext';

const ease = [0.4, 0, 0.2, 1] as const;

// ─── Provider & model definitions (mirrors PROVIDER_CONFIGS from providers.ts) ───

interface ModelDef {
  id: string;
  name: string;
  reasoning?: boolean;
  free?: boolean;
  contextWindow?: number;
}

interface ProviderDef {
  id: string;
  label: string;
  models: ModelDef[];
}

const ALL_PROVIDERS: ProviderDef[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    models: [
      { id: 'gpt-5-mini', name: 'GPT-5 Mini', reasoning: true, contextWindow: 128_000 },
      { id: 'o3-mini', name: 'o3-mini', reasoning: true, contextWindow: 128_000 },
    ],
  },
  {
    id: 'openai-codex',
    label: 'OpenAI Codex (ChatGPT Pro)',
    models: [
      { id: 'gpt-5.3-codex', name: 'GPT-5.3 Codex', reasoning: true, contextWindow: 272_000 },
      { id: 'gpt-5.2-codex', name: 'GPT-5.2 Codex', reasoning: true, contextWindow: 272_000 },
      { id: 'gpt-5.1-codex', name: 'GPT-5.1 Codex', reasoning: true, contextWindow: 128_000 },
      { id: 'gpt-5.1-codex-max', name: 'GPT-5.1 Codex Max', reasoning: true, contextWindow: 400_000 },
      { id: 'gpt-5.1-codex-mini', name: 'GPT-5.1 Codex Mini', reasoning: true, contextWindow: 128_000 },
      { id: 'gpt-5-codex', name: 'GPT-5 Codex', reasoning: true, contextWindow: 400_000 },
      { id: 'codex-mini', name: 'Codex Mini', reasoning: true, contextWindow: 200_000 },
    ],
  },
  {
    id: 'opencode-zen',
    label: 'OpenCode Zen (Free)',
    models: [
      { id: 'minimax-m2.5-free', name: 'MiniMax M2.5 Free', free: true, contextWindow: 128_000 },
      { id: 'minimax-m2.1-free', name: 'MiniMax M2.1 Free', free: true, contextWindow: 128_000 },
      { id: 'trinity-large-preview-free', name: 'Trinity Large Preview', free: true, contextWindow: 128_000 },
      { id: 'kimi-k2.5-free', name: 'Kimi K2.5 Free', free: true, contextWindow: 128_000 },
      { id: 'glm-4.7-free', name: 'GLM-4.7 Free', free: true, contextWindow: 128_000 },
      { id: 'big-pickle', name: 'Big Pickle', free: true, contextWindow: 128_000 },
    ],
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    models: [
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', contextWindow: 200_000 },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', contextWindow: 200_000 },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', contextWindow: 200_000 },
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', contextWindow: 200_000 },
    ],
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    models: [
      { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', contextWindow: 200_000 },
      { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', contextWindow: 200_000 },
      { id: 'google/gemini-2.5-pro-preview', name: 'Gemini 2.5 Pro', contextWindow: 1_000_000 },
      { id: 'google/gemini-2.5-flash-preview', name: 'Gemini 2.5 Flash', contextWindow: 1_000_000 },
      { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1', reasoning: true, contextWindow: 128_000 },
      { id: 'deepseek/deepseek-chat-v3', name: 'DeepSeek V3', contextWindow: 128_000 },
      { id: 'openai/gpt-4o', name: 'GPT-4o', contextWindow: 128_000 },
      { id: 'openai/o3-mini', name: 'o3-mini', reasoning: true, contextWindow: 128_000 },
      { id: 'meta-llama/llama-4-maverick', name: 'Llama 4 Maverick', contextWindow: 128_000 },
      { id: 'moonshotai/kimi-k2', name: 'Kimi K2', contextWindow: 128_000 },
    ],
  },
];

function formatContext(tokens?: number): string {
  if (!tokens) return '';
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(0)}M`;
  return `${(tokens / 1_000).toFixed(0)}K`;
}

export default function SettingsPage() {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [linkingCodex, setLinkingCodex] = useState(false);
  const [codexError, setCodexError] = useState('');
  const [deviceCode, setDeviceCode] = useState<{ userCode: string; verificationUrl: string; deviceAuthId: string; interval: number } | null>(null);
  const saveCodexAuth = useMutation(api.codex_auth.save);
  const { user } = useAuth();
  const [selectedModel, setSelectedModel] = useState<string>('gpt-5.3-codex');
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set());

  // API Keys state
  const userId = user?.id ?? '';
  const configuredKeys = useQuery(api.user_api_keys.getConfigured, userId ? { userId } : 'skip');
  const saveApiKey = useMutation(api.user_api_keys.save);
  const removeApiKey = useMutation(api.user_api_keys.remove);
  const [apiKeyInputs, setApiKeyInputs] = useState<Record<string, string>>({});
  const [customBaseUrl, setCustomBaseUrl] = useState('');
  const [savingProvider, setSavingProvider] = useState<string | null>(null);
  const [removingProvider, setRemovingProvider] = useState<string | null>(null);

  const API_KEY_PROVIDERS = [
    { id: 'openai', label: 'OpenAI', placeholder: 'sk-...' },
    { id: 'anthropic', label: 'Anthropic', placeholder: 'sk-ant-...' },
    { id: 'openrouter', label: 'OpenRouter', placeholder: 'sk-or-...' },
    { id: 'custom', label: 'Custom (OpenAI-compatible)', placeholder: 'API key' },
  ] as const;

  const isProviderConfigured = (providerId: string) =>
    configuredKeys?.some((k) => k.provider === providerId) ?? false;

  const handleSaveApiKey = async (providerId: string) => {
    const key = apiKeyInputs[providerId]?.trim();
    if (!key || !userId) return;
    setSavingProvider(providerId);
    try {
      await saveApiKey({
        userId,
        provider: providerId,
        apiKey: key,
        baseUrl: providerId === 'custom' ? customBaseUrl.trim() || undefined : undefined,
      });
      setApiKeyInputs((prev) => ({ ...prev, [providerId]: '' }));
      if (providerId === 'custom') setCustomBaseUrl('');
    } finally {
      setSavingProvider(null);
    }
  };

  const handleRemoveApiKey = async (providerId: string) => {
    if (!userId) return;
    setRemovingProvider(providerId);
    try {
      await removeApiKey({ userId, provider: providerId });
    } finally {
      setRemovingProvider(null);
    }
  };

  // Load saved model preference on mount
  useEffect(() => {
    const saved = localStorage.getItem('stratuscode_default_model');
    if (saved) {
      setSelectedModel(saved);
      // Auto-expand the provider containing the saved model
      for (const p of ALL_PROVIDERS) {
        if (p.models.some(m => m.id === saved)) {
          setExpandedProviders(new Set([p.id]));
          break;
        }
      }
    }
  }, []);

  const handleSelectModel = (modelId: string) => {
    setSelectedModel(modelId);
    localStorage.setItem('stratuscode_default_model', modelId);
  };

  const toggleProvider = (providerId: string) => {
    setExpandedProviders(prev => {
      const next = new Set(prev);
      if (next.has(providerId)) {
        next.delete(providerId);
      } else {
        next.add(providerId);
      }
      return next;
    });
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      const nqlAuthUrl = process.env.NEXT_PUBLIC_NQL_AUTH_URL || 'https://auth.neuroquestlabs.ai';
      window.location.href = `${nqlAuthUrl}/api/auth/logout?redirect=${encodeURIComponent(window.location.origin)}`;
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
            <button
              onClick={() => router.back()}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors duration-200 flex-shrink-0"
            >
              <ChevronLeft className="w-4 h-4" />
              <div className="w-8 h-8 rounded-lg bg-foreground flex items-center justify-center">
                <StratusLogo className="w-4 h-4 text-background" />
              </div>
              <span className="font-semibold tracking-tight text-sm">StratusCode</span>
            </button>
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
              {/* Model & Provider Picker */}
              <div className="rounded-xl border border-border/50 bg-background p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Cpu className="w-4 h-4 text-muted-foreground" />
                  <div className="text-sm font-medium">Model & Provider</div>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  Select the default model for new sessions.
                </p>
                <div className="space-y-1">
                  {ALL_PROVIDERS.map((provider) => {
                    const isExpanded = expandedProviders.has(provider.id);
                    const hasSelectedModel = provider.models.some(m => m.id === selectedModel);
                    const selectedModelName = provider.models.find(m => m.id === selectedModel)?.name;

                    return (
                      <div key={provider.id} className="rounded-lg border border-border/30 overflow-hidden">
                        {/* Provider header */}
                        <button
                          onClick={() => toggleProvider(provider.id)}
                          className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-secondary/30 transition-colors"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs font-medium text-foreground truncate">{provider.label}</span>
                            {hasSelectedModel && !isExpanded && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium truncate">
                                {selectedModelName}
                              </span>
                            )}
                          </div>
                          <svg
                            className={`w-3.5 h-3.5 text-muted-foreground transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
                            fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                          </svg>
                        </button>

                        {/* Models list */}
                        {isExpanded && (
                          <div className="border-t border-border/30">
                            {provider.models.map((model) => {
                              const isSelected = model.id === selectedModel;
                              return (
                                <button
                                  key={model.id}
                                  onClick={() => handleSelectModel(model.id)}
                                  className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
                                    isSelected
                                      ? 'bg-primary/10 text-foreground'
                                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary/30'
                                  }`}
                                >
                                  <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center flex-shrink-0 ${
                                    isSelected ? 'border-primary bg-primary' : 'border-border'
                                  }`}>
                                    {isSelected && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                                  </div>
                                  <span className="text-xs flex-1 truncate">{model.name}</span>
                                  <div className="flex items-center gap-1.5 flex-shrink-0">
                                    {model.free && (
                                      <span className="text-[10px] px-1 py-0.5 rounded bg-green-500/10 text-green-500 font-medium">
                                        free
                                      </span>
                                    )}
                                    {model.reasoning && (
                                      <span className="text-[10px] px-1 py-0.5 rounded bg-blue-500/10 text-blue-400 font-medium">
                                        reasoning
                                      </span>
                                    )}
                                    {model.contextWindow && (
                                      <span className="text-[10px] text-muted-foreground/60 font-mono">
                                        {formatContext(model.contextWindow)}
                                      </span>
                                    )}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* API Keys */}
              <div className="rounded-xl border border-border/50 bg-background p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Key className="w-4 h-4 text-muted-foreground" />
                  <div className="text-sm font-medium">API Keys</div>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  Add your own API keys to use paid models. Free models (Zen) work without a key.
                </p>
                <div className="space-y-3">
                  {API_KEY_PROVIDERS.map((provider) => {
                    const configured = isProviderConfigured(provider.id);
                    const isSaving = savingProvider === provider.id;
                    const isRemoving = removingProvider === provider.id;
                    return (
                      <div key={provider.id} className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-foreground">{provider.label}</span>
                          <div className="flex items-center gap-1.5">
                            {configured ? (
                              <>
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                <span className="text-[10px] text-green-500 font-medium">Configured</span>
                              </>
                            ) : (
                              <>
                                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
                                <span className="text-[10px] text-muted-foreground">Not set</span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-1.5">
                          <input
                            type="password"
                            placeholder={configured ? '••••••••' : provider.placeholder}
                            value={apiKeyInputs[provider.id] || ''}
                            onChange={(e) => setApiKeyInputs((prev) => ({ ...prev, [provider.id]: e.target.value }))}
                            className="flex-1 rounded-lg border border-border/50 bg-secondary/30 px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-foreground/20 transition-colors"
                          />
                          <button
                            onClick={() => handleSaveApiKey(provider.id)}
                            disabled={!apiKeyInputs[provider.id]?.trim() || isSaving}
                            className="px-3 py-1.5 rounded-lg border border-border/50 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}
                          </button>
                          {configured && (
                            <button
                              onClick={() => handleRemoveApiKey(provider.id)}
                              disabled={isRemoving}
                              className="px-1.5 py-1.5 rounded-lg border border-border/50 text-muted-foreground hover:text-red-500 hover:border-red-500/30 transition-colors disabled:opacity-30"
                              title="Remove key"
                            >
                              {isRemoving ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                            </button>
                          )}
                        </div>
                        {provider.id === 'custom' && (
                          <input
                            type="text"
                            placeholder="Base URL (e.g. http://localhost:8080/v1)"
                            value={customBaseUrl}
                            onChange={(e) => setCustomBaseUrl(e.target.value)}
                            className="w-full rounded-lg border border-border/50 bg-secondary/30 px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-foreground/20 transition-colors"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

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
                              // Save tokens to Convex DB so the agent action can access them
                              if (result.tokens) {
                                try {
                                  await saveCodexAuth({
                                    userId: user?.id ?? 'anonymous',
                                    accessToken: result.tokens.accessToken,
                                    refreshToken: result.tokens.refreshToken,
                                    accountId: result.tokens.accountId,
                                    expiresAt: result.tokens.expiresAt,
                                  });
                                } catch { /* best effort — cookies are primary store */ }
                              }
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

