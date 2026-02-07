import Link from 'next/link';
import { ArrowRight, Zap, FileCode, GitPullRequest, Terminal, Bot, Layers, Sparkles, Check, ArrowUpRight } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background relative noise-texture">
      {/* Navigation — floating pill */}
      <nav className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-4xl">
        <div className="nav-premium rounded-2xl px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link href="/" className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-foreground/[0.04] transition-colors duration-200">
              <div className="w-7 h-7 rounded-lg bg-foreground flex items-center justify-center shadow-sm">
                <Zap className="w-3.5 h-3.5 text-background" />
              </div>
              <span className="font-semibold tracking-tight text-[13px]">StratusCode</span>
            </Link>
            <div className="hidden md:block h-4 w-px bg-border/60 mx-2" />
            <div className="hidden md:flex items-center gap-1">
              <Link href="#features" className="px-3 py-1.5 rounded-lg text-[13px] text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] transition-all duration-200">Features</Link>
              <Link href="#how-it-works" className="px-3 py-1.5 rounded-lg text-[13px] text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] transition-all duration-200">How it works</Link>
              <Link href="https://github.com/stratuscode/stratuscode" className="px-3 py-1.5 rounded-lg text-[13px] text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] transition-all duration-200">GitHub</Link>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/[0.08] border border-emerald-500/[0.12]">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[11px] text-emerald-700 font-medium">Live</span>
            </div>
            <Link href="/login" className="text-[13px] text-muted-foreground hover:text-foreground transition-colors duration-200 px-3 py-1.5 rounded-lg hover:bg-foreground/[0.04]">
              Sign in
            </Link>
            <Link
              href="/get-started"
              className="px-4 py-2 rounded-xl bg-foreground text-background text-[13px] font-medium hover:bg-foreground/90 transition-all duration-200 shadow-sm hover:shadow-md hover:shadow-foreground/5"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      <main className="flex-1 relative z-[2]">
        {/* Hero Section */}
        <section className="relative overflow-hidden vignette">
          {/* Layered background textures */}
          <div className="absolute inset-0 grid-pattern opacity-[0.35]" />
          <div className="absolute inset-0 hero-glow" />
          {/* Decorative orbs */}
          <div className="absolute top-10 -left-40 w-[500px] h-[500px] rounded-full bg-accent/[0.08] blur-[120px]" />
          <div className="absolute bottom-20 -right-32 w-[400px] h-[400px] rounded-full bg-accent/[0.06] blur-[100px]" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] rounded-full bg-accent/[0.04] blur-[150px]" />
          {/* Subtle horizontal line accents */}
          <div className="absolute top-[30%] left-0 right-0 h-px bg-gradient-to-r from-transparent via-border/30 to-transparent" />
          <div className="absolute bottom-[15%] left-0 right-0 h-px bg-gradient-to-r from-transparent via-border/20 to-transparent" />

          <div className="relative max-w-5xl mx-auto px-6 pt-32 pb-8 text-center">
            {/* Intro badge */}
            <div className="inline-flex items-center gap-3 mb-10 animate-fade-in">
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-border/60 bg-background/60 backdrop-blur-md text-xs text-muted-foreground shadow-sm">
                <Sparkles className="w-3.5 h-3.5 text-accent" />
                <span className="font-medium">Introducing StratusCode</span>
                <span className="text-border">|</span>
                <Link href="/get-started" className="text-foreground font-medium hover:underline underline-offset-2">
                  Try now →
                </Link>
              </span>
            </div>

            {/* Main heading */}
            <h1 className="font-serif text-[3.5rem] md:text-[5.5rem] lg:text-[6.5rem] font-normal tracking-tightest leading-[0.95] mb-7 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
              Meet your agentic
              <br />
              <span className="italic">software developer.</span>
            </h1>

            {/* Subtext */}
            <p className="text-muted-foreground text-lg md:text-xl max-w-lg mx-auto mb-12 leading-relaxed animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
              AI agents that plan, execute, and ship features
              — from idea to pull request — in one prompt.
            </p>

            {/* CTA buttons */}
            <div className="flex items-center justify-center gap-4 mb-20 animate-fade-in-up" style={{ animationDelay: '0.25s' }}>
              <Link
                href="/get-started"
                className="group inline-flex items-center gap-2.5 px-7 py-3.5 rounded-full bg-foreground text-background text-sm font-medium hover:bg-foreground/90 transition-all duration-200 hover:shadow-xl hover:shadow-foreground/10 hover:-translate-y-0.5"
              >
                Start building
                <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="https://github.com/stratuscode/stratuscode"
                className="group inline-flex items-center gap-2 px-6 py-3.5 rounded-full border border-border/60 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-foreground/30 hover:bg-secondary/40 transition-all duration-200"
              >
                View on GitHub
                <ArrowUpRight className="w-3.5 h-3.5 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </Link>
            </div>
          </div>

          {/* Terminal / Dark input area — full-width contained */}
          <div className="relative max-w-3xl mx-auto px-6 pb-24 animate-fade-in-up" style={{ animationDelay: '0.35s' }}>
            <div className="dark-input-area">
              {/* Terminal chrome */}
              <div className="relative z-10 flex items-center justify-between mb-5 pb-4 border-b border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
                  <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
                  <div className="w-3 h-3 rounded-full bg-[#28c840]" />
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-400/70 animate-pulse" />
                  <span className="text-[11px] text-white/30 font-mono tracking-wide">stratuscode</span>
                </div>
              </div>

              {/* Prompt */}
              <div className="relative z-10 space-y-4">
                <div className="flex items-start gap-3">
                  <span className="text-emerald-400/70 font-mono text-xs mt-0.5 select-none font-bold">→</span>
                  <p className="text-white/80 text-[15px] leading-relaxed">
                    Build a user authentication system with OAuth, session management, and role-based access control.
                  </p>
                </div>

                {/* Agent response preview */}
                <div className="ml-6 space-y-2.5 pt-2">
                  <div className="flex items-center gap-2">
                    <Bot className="w-3.5 h-3.5 text-white/30" />
                    <span className="text-[13px] text-white/50">Planning implementation...</span>
                  </div>
                  <div className="space-y-1.5 ml-5">
                    <div className="flex items-center gap-2 text-[12px]">
                      <Check className="w-3 h-3 text-emerald-400/60" />
                      <span className="text-white/40">Created <span className="text-white/60 font-mono">lib/auth.ts</span></span>
                    </div>
                    <div className="flex items-center gap-2 text-[12px]">
                      <Check className="w-3 h-3 text-emerald-400/60" />
                      <span className="text-white/40">Created <span className="text-white/60 font-mono">middleware.ts</span></span>
                    </div>
                    <div className="flex items-center gap-2 text-[12px]">
                      <Check className="w-3 h-3 text-emerald-400/60" />
                      <span className="text-white/40">Updated <span className="text-white/60 font-mono">app/api/auth/[...nextauth]/route.ts</span></span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom toolbar */}
              <div className="relative z-10 flex items-center justify-between mt-6 pt-4 border-t border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-white/[0.05] flex items-center justify-center border border-white/[0.04]">
                    <FileCode className="w-3.5 h-3.5 text-white/30" />
                  </div>
                  <div className="w-7 h-7 rounded-lg bg-white/[0.05] flex items-center justify-center border border-white/[0.04]">
                    <Terminal className="w-3.5 h-3.5 text-white/30" />
                  </div>
                  <div className="w-7 h-7 rounded-lg bg-white/[0.05] flex items-center justify-center border border-white/[0.04]">
                    <GitPullRequest className="w-3.5 h-3.5 text-white/30" />
                  </div>
                </div>
                <span className="text-[11px] text-white/20 font-mono">3 files changed · +247 -12</span>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="relative border-t border-border/40 overflow-hidden">
          <div className="absolute inset-0 dot-pattern opacity-[0.4]" />
          <div className="absolute -top-20 right-0 w-[350px] h-[350px] rounded-full bg-accent/[0.04] blur-[100px]" />
          <div className="absolute bottom-0 -left-20 w-[250px] h-[250px] rounded-full bg-accent/[0.03] blur-[80px]" />
          <div className="relative max-w-5xl mx-auto px-6 py-32">
            <div className="text-center mb-20">
              <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground mb-4 font-semibold">How it works</p>
              <h2 className="font-serif text-4xl md:text-5xl font-normal">
                Three steps to shipping.
              </h2>
            </div>

            <div className="grid md:grid-cols-3 gap-5">
              <StepCard
                number="01"
                title="Connect your repo"
                description="Sign in with GitHub and select any repository — or create a new one from scratch."
              />
              <StepCard
                number="02"
                title="Describe your task"
                description="Tell StratusCode what you want to build in plain English. Be as detailed as you like."
              />
              <StepCard
                number="03"
                title="Review & merge"
                description="StratusCode creates a PR with all changes. Review the diff and merge when ready."
              />
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="relative border-t border-border/40 overflow-hidden">
          <div className="absolute inset-0 crosshatch-pattern opacity-[0.15]" />
          <div className="absolute top-1/3 -right-32 w-[400px] h-[400px] rounded-full bg-accent/[0.05] blur-[120px]" />
          <div className="absolute bottom-0 left-1/4 w-[300px] h-[300px] rounded-full bg-accent/[0.04] blur-[100px]" />
          <div className="relative max-w-5xl mx-auto px-6 py-32">
            <div className="grid md:grid-cols-2 gap-16 items-center">
              <div>
                <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground mb-4 font-semibold">Capabilities</p>
                <h2 className="font-serif text-4xl md:text-5xl font-normal mb-6 leading-[1.05]">
                  Built for real
                  <br />
                  <span className="italic">development work.</span>
                </h2>
                <p className="text-muted-foreground text-[15px] leading-relaxed mb-10">
                  StratusCode runs in isolated sandboxes with full access to your codebase. 
                  It reads files, makes edits, runs commands, installs dependencies, and 
                  executes tests — just like a human developer.
                </p>

                <div className="space-y-3 mb-10">
                  <CapabilityRow label="Multi-file edits across your codebase" />
                  <CapabilityRow label="Shell command execution & testing" />
                  <CapabilityRow label="Dependency installation & management" />
                  <CapabilityRow label="Automatic PR creation with diffs" />
                </div>

                <Link
                  href="/get-started"
                  className="group inline-flex items-center gap-3 px-6 py-3.5 rounded-full bg-foreground text-background text-sm font-medium hover:bg-foreground/90 transition-all duration-200 hover:shadow-lg hover:shadow-foreground/5"
                >
                  Start building
                  <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                </Link>
              </div>
              
              <div className="relative">
                {/* Glow behind card */}
                <div className="absolute -inset-4 bg-gradient-to-br from-accent/10 via-transparent to-accent/5 rounded-[2rem] blur-2xl" />
                <div className="relative rounded-2xl border border-border/60 bg-background/80 backdrop-blur-sm p-7 shadow-xl">
                  {/* Window chrome */}
                  <div className="flex items-center gap-2 mb-5 pb-4 border-b border-border/40">
                    <div className="w-3 h-3 rounded-full bg-red-400/70" />
                    <div className="w-3 h-3 rounded-full bg-amber-400/70" />
                    <div className="w-3 h-3 rounded-full bg-green-400/70" />
                    <span className="ml-3 text-[11px] text-muted-foreground/50 font-mono">api/auth/route.ts</span>
                  </div>
                  <div className="space-y-3 font-mono text-[13px] leading-relaxed">
                    <div className="flex gap-3">
                      <span className="text-muted-foreground/40 w-5 text-right select-none text-[11px]">1</span>
                      <span><span className="text-purple-600/80">import</span> <span className="text-foreground/80">{'{'} auth {'}'}</span> <span className="text-purple-600/80">from</span> <span className="text-green-700/80">&apos;@/lib/auth&apos;</span>;</span>
                    </div>
                    <div className="flex gap-3">
                      <span className="text-muted-foreground/40 w-5 text-right select-none text-[11px]">2</span>
                      <span><span className="text-purple-600/80">import</span> <span className="text-foreground/80">{'{'} db {'}'}</span> <span className="text-purple-600/80">from</span> <span className="text-green-700/80">&apos;@/lib/db&apos;</span>;</span>
                    </div>
                    <div className="flex gap-3">
                      <span className="text-muted-foreground/40 w-5 text-right select-none text-[11px]">3</span>
                      <span className="text-foreground/30"> </span>
                    </div>
                    <div className="flex gap-3">
                      <span className="text-muted-foreground/40 w-5 text-right select-none text-[11px]">4</span>
                      <span><span className="text-purple-600/80">export async function</span> <span className="text-blue-600/80">GET</span><span className="text-foreground/70">(req) {'{'}</span></span>
                    </div>
                    <div className="flex gap-3">
                      <span className="text-muted-foreground/40 w-5 text-right select-none text-[11px]">5</span>
                      <span className="pl-4"><span className="text-foreground/70">const session = </span><span className="text-purple-600/80">await</span> <span className="text-blue-600/80">auth</span><span className="text-foreground/70">();</span></span>
                    </div>
                    <div className="flex gap-3 bg-green-500/[0.06] -mx-7 px-7 border-l-2 border-green-500/50">
                      <span className="text-muted-foreground/40 w-5 text-right select-none text-[11px]">6</span>
                      <span className="pl-4 text-foreground/60">const users = <span className="text-purple-600/80">await</span> db.users.findMany();</span>
                    </div>
                    <div className="flex gap-3 bg-green-500/[0.06] -mx-7 px-7 border-l-2 border-green-500/50">
                      <span className="text-muted-foreground/40 w-5 text-right select-none text-[11px]">7</span>
                      <span className="pl-4 text-foreground/60"><span className="text-purple-600/80">return</span> Response.json(users);</span>
                    </div>
                    <div className="flex gap-3">
                      <span className="text-muted-foreground/40 w-5 text-right select-none text-[11px]">8</span>
                      <span className="text-foreground/70">{'}'}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="relative py-32 bg-foreground text-background overflow-hidden">
          {/* Layered textures */}
          <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.6) 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
          <div className="absolute inset-0 opacity-[0.02]" style={{ backgroundImage: 'repeating-linear-gradient(-45deg, transparent, transparent 8px, rgba(255,255,255,0.3) 8px, rgba(255,255,255,0.3) 9px)' }} />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/3 w-[900px] h-[500px] bg-white/[0.03] rounded-full blur-[150px]" />
          <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-white/[0.02] rounded-full blur-[100px] translate-x-1/3 translate-y-1/3" />
          
          <div className="max-w-3xl mx-auto px-6 text-center relative z-10">
            <h2 className="font-serif text-5xl md:text-6xl font-normal mb-6 leading-[1.05]">
              Ready to build faster?
            </h2>
            <p className="text-white/50 text-lg mb-12 max-w-md mx-auto leading-relaxed">
              Connect your GitHub account and start shipping with AI in minutes.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/get-started"
                className="w-full sm:w-auto px-8 py-4 rounded-full bg-background text-foreground font-medium hover:bg-white/90 transition-all duration-200 hover:shadow-2xl hover:shadow-white/10 hover:-translate-y-0.5"
              >
                Get started free
              </Link>
              <Link
                href="https://github.com/stratuscode/stratuscode"
                className="w-full sm:w-auto px-8 py-4 rounded-full border border-white/15 text-white/80 font-medium hover:bg-white/[0.06] hover:border-white/25 transition-all duration-200"
              >
                Documentation
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/40 bg-background relative z-[2]">
        <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-foreground text-background flex items-center justify-center">
              <Zap className="w-3.5 h-3.5" />
            </div>
            <span className="font-medium text-sm">StratusCode</span>
          </div>
          <div className="flex items-center gap-8 text-[13px] text-muted-foreground">
            <Link href="#" className="hover:text-foreground transition-colors duration-200">Privacy</Link>
            <Link href="#" className="hover:text-foreground transition-colors duration-200">Terms</Link>
            <Link href="https://github.com/stratuscode/stratuscode" className="hover:text-foreground transition-colors duration-200">GitHub</Link>
            <span className="opacity-40">© 2024 SAGE</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function CapabilityRow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-5 h-5 rounded-full bg-foreground/[0.06] flex items-center justify-center flex-shrink-0">
        <Check className="w-3 h-3 text-foreground/50" />
      </div>
      <span className="text-sm text-foreground/70">{label}</span>
    </div>
  );
}

function StepCard({ number, title, description }: { number: string; title: string; description: string }) {
  return (
    <div className="group relative p-8 rounded-2xl border border-border/40 bg-background/80 backdrop-blur-sm hover:border-border/80 hover:shadow-xl hover:shadow-black/[0.04] transition-all duration-300 hover:-translate-y-1 overflow-hidden">
      {/* Inner texture */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br from-accent/[0.03] via-transparent to-accent/[0.02]" />
      {/* Corner accent */}
      <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-accent/[0.06] to-transparent rounded-bl-[3rem] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <div className="relative">
        <div className="text-5xl font-serif text-muted-foreground/20 mb-6 group-hover:text-accent/40 transition-colors duration-300">{number}</div>
        <h3 className="font-medium text-base mb-2">{title}</h3>
        <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
      </div>
    </div>
  );
}
