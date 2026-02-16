'use client';

import { useRouter } from 'next/navigation';
import { ArrowRight, Plus, Github } from 'lucide-react';

export default function ProjectSelectionPage() {
  const router = useRouter();

  const handleSelectExisting = () => {
    router.push('/chat?mode=select-repo');
  };

  const handleCreateNew = () => {
    router.push('/chat?mode=new-project');
  };

  return (
    <div className="max-w-5xl w-full px-6">
      <div className="text-center mb-8 md:mb-16 animate-fade-in-up">
        <h1 className="font-serif text-3xl md:text-5xl font-normal mb-3 md:mb-4">
          What would you like to build?
        </h1>
        <p className="text-muted-foreground text-base md:text-lg font-light max-w-xl mx-auto leading-relaxed">
          Start a new project from scratch or continue working on an existing repository.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4 md:gap-6 max-w-4xl mx-auto">
        {/* Existing Repo Card */}
        <button
          onClick={handleSelectExisting}
          className="group relative flex flex-col items-start p-6 md:p-10 rounded-2xl border border-border/50 bg-background text-left transition-all duration-300 hover:border-border hover:shadow-lg hover:shadow-black/[0.03] hover:-translate-y-0.5 opacity-0 animate-fade-in-up"
          style={{ animationDelay: '0.1s' }}
        >
          <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-secondary flex items-center justify-center mb-4 md:mb-8 group-hover:scale-105 transition-transform duration-300">
            <Github className="w-5 h-5 md:w-6 md:h-6 text-foreground" />
          </div>
          <h2 className="text-lg md:text-xl font-medium mb-1.5 md:mb-2">
            Select Existing Repo
          </h2>
          <p className="text-muted-foreground text-sm leading-relaxed mb-4 md:mb-8">
            Connect to one of your GitHub repositories and start building features or fixing bugs.
          </p>
          <div className="mt-auto flex items-center gap-2 text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors duration-200">
            Choose repository <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          </div>
        </button>

        {/* New Project Card */}
        <button
          onClick={handleCreateNew}
          className="group relative flex flex-col items-start p-6 md:p-10 rounded-2xl border border-border/50 bg-background text-left transition-all duration-300 hover:border-border hover:shadow-lg hover:shadow-black/[0.03] hover:-translate-y-0.5 opacity-0 animate-fade-in-up"
          style={{ animationDelay: '0.2s' }}
        >
          <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-foreground flex items-center justify-center mb-4 md:mb-8 group-hover:scale-105 transition-transform duration-300">
            <Plus className="w-5 h-5 md:w-6 md:h-6 text-background" />
          </div>
          <h2 className="text-lg md:text-xl font-medium mb-1.5 md:mb-2">
            Create New Project
          </h2>
          <p className="text-muted-foreground text-sm leading-relaxed mb-4 md:mb-8">
            Start fresh. We&apos;ll create a new GitHub repository and set up the initial project structure.
          </p>
          <div className="mt-auto flex items-center gap-2 text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors duration-200">
            Start building <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          </div>
        </button>
      </div>
    </div>
  );
}
