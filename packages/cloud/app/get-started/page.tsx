import Link from 'next/link';
import { ArrowLeft, Mail } from 'lucide-react';
import { StratusLogo } from '@/components/stratus-logo';

export default function GetStartedPage() {
  return (
    <div className="min-h-dvh flex flex-col relative noise-texture">
      <div className="absolute inset-0 grid-pattern opacity-[0.3]" />
      <div className="absolute inset-0 hero-glow" />
      <div className="absolute top-20 -left-32 w-[400px] h-[400px] rounded-full bg-accent/[0.07] blur-[120px]" />
      <div className="absolute bottom-10 -right-20 w-[300px] h-[300px] rounded-full bg-accent/[0.05] blur-[80px]" />

      <nav className="relative z-10 px-6 py-5">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors duration-200">
          <ArrowLeft className="w-4 h-4" />
          Back
        </Link>
      </nav>

      <div className="relative z-10 flex-1 flex items-center justify-center">
        <div className="max-w-md w-full mx-6 text-center animate-fade-in-up">
          <div className="w-14 h-14 rounded-2xl bg-foreground flex items-center justify-center mx-auto mb-8 shadow-lg shadow-foreground/10">
            <StratusLogo className="w-7 h-7 text-background" />
          </div>

          <h1 className="font-serif text-4xl font-normal mb-3">Get Early Access</h1>
          <p className="text-muted-foreground text-sm leading-relaxed mb-10">
            StratusCode Cloud is currently in private alpha. To get access,
            reach out to the Stratus team.
          </p>

          <a
            href="mailto:team@stratuscode.dev"
            className="group inline-flex items-center gap-2 px-6 py-4 rounded-full bg-foreground text-background font-medium hover:bg-foreground/90 transition-all duration-200 hover:shadow-lg hover:shadow-foreground/5 hover:-translate-y-0.5"
          >
            <Mail className="w-4 h-4" />
            Contact the Team
          </a>

          <p className="text-xs text-muted-foreground mt-8">
            Already have access?{' '}
            <Link href="/login" className="underline underline-offset-2 hover:text-foreground transition-colors duration-200">
              Sign in
            </Link>
          </p>
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
