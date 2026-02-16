'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Sparkles, AlertCircle } from 'lucide-react';

export function NewProjectForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/repos/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          private: isPrivate,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create repository');
      }

      // Navigate to the new chat session
      router.push(`/chat/new?owner=${data.owner}&repo=${data.name}&branch=${data.defaultBranch}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto w-full">
      <div className="mb-8">
        <h1 className="font-serif text-3xl md:text-4xl font-normal mb-3">Create new project</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          We'll create a new GitHub repository and set up your environment.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-8"
      >
        <div className="space-y-6">
          <div className="space-y-2">
            <label htmlFor="name" className="text-sm font-medium text-foreground ml-1">
              Project Name
            </label>
            <div className="relative group">
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., my-awesome-app"
                className="w-full px-5 py-3.5 rounded-2xl border border-border/50 bg-background transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-foreground/10 focus:border-foreground/20 placeholder:text-muted-foreground/50 text-base"
                required
                autoFocus
              />
            </div>
            <p className="text-xs text-muted-foreground ml-1">
              This will be your repository name on GitHub.
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="description" className="text-sm font-medium text-foreground ml-1">
              Description <span className="text-muted-foreground font-normal">(Optional)</span>
            </label>
            <div className="relative group">
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What are you building?"
                className="w-full px-5 py-3.5 rounded-2xl border border-border/50 bg-background transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-foreground/10 focus:border-foreground/20 placeholder:text-muted-foreground/50 min-h-[100px] resize-none text-base"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 p-4 rounded-2xl border border-border/50 bg-secondary/20">
            <div className={`w-10 h-6 rounded-full p-1 transition-colors cursor-pointer ${isPrivate ? 'bg-foreground' : 'bg-muted'}`}
                 onClick={() => setIsPrivate(!isPrivate)}>
              <div className={`w-4 h-4 rounded-full bg-background shadow-sm transition-transform ${isPrivate ? 'translate-x-4' : ''}`} />
            </div>
            <div className="flex-1">
              <div className="font-medium text-sm">Private Repository</div>
              <div className="text-xs text-muted-foreground">Only you can see this repository</div>
            </div>
          </div>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/10 flex items-center gap-3 text-red-600 text-sm animate-fade-in">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            {error}
          </div>
        )}

        <div className="pt-4">
          <button
            type="submit"
            disabled={!name || isLoading}
            className="w-full flex items-center justify-center gap-2 px-8 py-4 rounded-full bg-foreground text-background font-medium hover:bg-foreground/90 transition-all duration-200 hover:shadow-lg hover:shadow-foreground/5 disabled:opacity-50 disabled:hover:shadow-none"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Creating Repository...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                Create Project
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
