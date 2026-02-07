'use client';

import { useState } from 'react';
import { X, GitPullRequest, ExternalLink, Loader2 } from 'lucide-react';

interface PRModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (title: string, body: string) => Promise<void>;
  diffSummary?: string;
  prResult?: { prUrl: string; prNumber: number } | null;
}

export function PRModal({
  isOpen,
  onClose,
  onSubmit,
  diffSummary,
  prResult,
}: PRModalProps) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);
    try {
      await onSubmit(title, body);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background rounded-2xl shadow-2xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto border border-border/50">
        <div className="flex items-center justify-between p-5 border-b border-border/50">
          <div className="flex items-center gap-2">
            <GitPullRequest className="w-5 h-5 text-primary" />
            <h2 className="font-medium">
              {prResult ? 'Pull Request Created' : 'Create Pull Request'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-secondary transition-colors duration-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {prResult ? (
          <div className="p-6 text-center">
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
              <GitPullRequest className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <h3 className="text-lg font-medium mb-2">PR #{prResult.prNumber} Created</h3>
            <p className="text-muted-foreground text-sm mb-4">
              Your changes have been pushed and a pull request has been created.
            </p>
            <a
              href={prResult.prUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
            >
              View on GitHub
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-4 space-y-4">
            {diffSummary && (
              <div>
                <label className="block text-sm font-medium mb-2">Changes</label>
                <pre className="text-xs bg-muted rounded-lg p-3 overflow-x-auto max-h-32">
                  {diffSummary}
                </pre>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-2">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Add feature X"
                className="w-full px-4 py-3 rounded-xl border border-border/50 bg-background focus:outline-none focus:ring-2 focus:ring-foreground/10 focus:border-foreground/20 text-sm transition-all duration-200"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Description (optional)
              </label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Describe your changes..."
                rows={4}
                className="w-full px-4 py-3 rounded-xl border border-border/50 bg-background focus:outline-none focus:ring-2 focus:ring-foreground/10 focus:border-foreground/20 text-sm resize-none transition-all duration-200"
              />
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 rounded-full border border-border/50 hover:bg-secondary transition-all duration-200 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!title.trim() || isSubmitting}
                className="flex-1 py-3 rounded-full bg-foreground text-background hover:bg-foreground/90 transition-all duration-200 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create PR'
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
