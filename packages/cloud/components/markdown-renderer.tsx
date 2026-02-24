'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useState, useCallback, memo, useEffect, useRef } from 'react';
import { Check, Copy } from 'lucide-react';
import clsx from 'clsx';

// Register only the languages we actually need (~50KB instead of ~500KB)
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';
import tsx from 'react-syntax-highlighter/dist/esm/languages/prism/tsx';
import jsx from 'react-syntax-highlighter/dist/esm/languages/prism/jsx';
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python';
import rust from 'react-syntax-highlighter/dist/esm/languages/prism/rust';
import go from 'react-syntax-highlighter/dist/esm/languages/prism/go';
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash';
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json';
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css';
import html from 'react-syntax-highlighter/dist/esm/languages/prism/markup';
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql';
import yaml from 'react-syntax-highlighter/dist/esm/languages/prism/yaml';
import toml from 'react-syntax-highlighter/dist/esm/languages/prism/toml';
import diff from 'react-syntax-highlighter/dist/esm/languages/prism/diff';
import markdown from 'react-syntax-highlighter/dist/esm/languages/prism/markdown';

SyntaxHighlighter.registerLanguage('typescript', typescript);
SyntaxHighlighter.registerLanguage('ts', typescript);
SyntaxHighlighter.registerLanguage('javascript', javascript);
SyntaxHighlighter.registerLanguage('js', javascript);
SyntaxHighlighter.registerLanguage('tsx', tsx);
SyntaxHighlighter.registerLanguage('jsx', jsx);
SyntaxHighlighter.registerLanguage('python', python);
SyntaxHighlighter.registerLanguage('py', python);
SyntaxHighlighter.registerLanguage('rust', rust);
SyntaxHighlighter.registerLanguage('go', go);
SyntaxHighlighter.registerLanguage('bash', bash);
SyntaxHighlighter.registerLanguage('sh', bash);
SyntaxHighlighter.registerLanguage('shell', bash);
SyntaxHighlighter.registerLanguage('zsh', bash);
SyntaxHighlighter.registerLanguage('json', json);
SyntaxHighlighter.registerLanguage('css', css);
SyntaxHighlighter.registerLanguage('html', html);
SyntaxHighlighter.registerLanguage('xml', html);
SyntaxHighlighter.registerLanguage('sql', sql);
SyntaxHighlighter.registerLanguage('yaml', yaml);
SyntaxHighlighter.registerLanguage('yml', yaml);
SyntaxHighlighter.registerLanguage('toml', toml);
SyntaxHighlighter.registerLanguage('diff', diff);
SyntaxHighlighter.registerLanguage('markdown', markdown);
SyntaxHighlighter.registerLanguage('md', markdown);

// One Dark theme with transparent background to match our container
const codeTheme: Record<string, React.CSSProperties> = {
  ...oneDark,
  'pre[class*="language-"]': {
    ...(oneDark['pre[class*="language-"]'] as React.CSSProperties),
    background: 'transparent',
    margin: 0,
    padding: 0,
    overflow: 'auto',
    fontSize: '0.8125rem',
    lineHeight: '1.6',
  },
  'code[class*="language-"]': {
    ...(oneDark['code[class*="language-"]'] as React.CSSProperties),
    background: 'transparent',
    fontSize: '0.8125rem',
    lineHeight: '1.6',
    fontFamily: 'var(--font-mono), ui-monospace, monospace',
  },
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 text-[11px] text-white/40 hover:text-white/70 transition-colors"
    >
      {copied ? (
        <>
          <Check className="w-3 h-3" />
          <span>Copied</span>
        </>
      ) : (
        <>
          <Copy className="w-3 h-3" />
          <span>Copy</span>
        </>
      )}
    </button>
  );
}

interface MarkdownRendererProps {
  content: string;
  className?: string;
  isStreaming?: boolean;
  isInline?: boolean;
}

function useSmoothStreaming(content: string, isStreaming: boolean) {
  const [displayed, setDisplayed] = useState(content);
  const contentRef = useRef(content);
  contentRef.current = content;

  useEffect(() => {
    if (!isStreaming) {
      setDisplayed(content);
      return;
    }

    let rafId: number;
    let lastTime = performance.now();

    const advance = (time: number) => {
      // Calculate how much time passed, though we advance per frame regardless
      lastTime = time;

      setDisplayed(prev => {
        const target = contentRef.current;
        if (prev === target) return prev;

        // If for some reason the target got smaller (e.g. reset), snap to it
        if (target.length < prev.length) return target;

        const diff = target.length - prev.length;
        // The more we fall behind, the faster we type to catch up gracefully.
        // Base chunk is 1 char per frame (60fps = 60 chars / sec).
        const chunk = Math.max(1, Math.ceil(diff / 8));

        return target.substring(0, prev.length + chunk);
      });

      rafId = requestAnimationFrame(advance);
    };

    rafId = requestAnimationFrame(advance);
    return () => cancelAnimationFrame(rafId);
  }, [isStreaming, content]); // re-trigger only if streaming toggles or initial content is huge

  return isStreaming ? displayed : content;
}

export const MarkdownRenderer = memo(function MarkdownRenderer({ content, className = '', isStreaming = false, isInline = false }: MarkdownRendererProps) {
  const displayedContent = useSmoothStreaming(content, isStreaming);

  return (
    <div className={clsx("markdown-body", isInline && "inline whitespace-nowrap overflow-hidden text-ellipsis w-full", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          // Code blocks with syntax highlighting
          code({ node, className: codeClassName, children, ...props }) {
            const match = /language-(\w+)/.exec(codeClassName || '');
            const codeString = String(children).replace(/\n$/, '');
            const isInlineCode = !match && !codeString.includes('\n');

            if (isInlineCode) {
              return (
                <code
                  className={clsx("px-1.5 py-0.5 rounded-md bg-muted text-[0.8125rem] font-mono", isInline && "bg-transparent text-inherit px-0")}
                  {...props}
                >
                  {isInline ? `\`${children}\`` : children}
                </code>
              );
            }

            if (isInline) {
              return <span className="text-muted-foreground mr-1 truncate">[Code]</span>;
            }

            const language = match ? match[1] : 'text';

            return (
              <div className="my-3 rounded-xl overflow-hidden border border-border/30 bg-[#0e0e0d]">
                <div className="flex items-center justify-between px-3 py-2 bg-white/[0.03] border-b border-white/[0.06]">
                  <span className="text-[11px] text-white/30 font-mono">{language}</span>
                  <CopyButton text={codeString} />
                </div>
                <div className="overflow-x-auto p-3">
                  <SyntaxHighlighter
                    style={codeTheme}
                    language={language}
                    PreTag="div"
                    customStyle={{ background: 'transparent', padding: 0, margin: 0 }}
                  >
                    {codeString}
                  </SyntaxHighlighter>
                </div>
              </div>
            );
          },

          // Pre wrapper — just pass through, code component handles everything
          pre({ children }) {
            return <>{children}</>;
          },

          // Tables
          table({ children }) {
            if (isInline) return <span className="mr-1 text-muted-foreground">[Table]</span>;
            return (
              <div className="my-3 overflow-x-auto rounded-xl border border-border/30">
                <table className="w-full text-sm border-collapse">
                  {children}
                </table>
              </div>
            );
          },
          thead({ children }) {
            if (isInline) return <>{children}</>;
            return (
              <thead className="bg-secondary/50 border-b border-border/30">
                {children}
              </thead>
            );
          },
          th({ children }) {
            if (isInline) return <span className="mr-1">{children}</span>;
            return (
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                {children}
              </th>
            );
          },
          td({ children }) {
            if (isInline) return <span className="mr-1">{children}</span>;
            return (
              <td className="px-3 py-2 text-sm border-t border-border/20">
                {children}
              </td>
            );
          },

          // Links
          a({ href, children }) {
            if (isInline) return <span className="text-inherit">{children}</span>;
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 underline underline-offset-2 decoration-blue-400/30 hover:decoration-blue-300/50 transition-colors"
              >
                {children}
              </a>
            );
          },

          // Block quotes
          blockquote({ children }) {
            if (isInline) return <span className="italic mr-1">{children}</span>;
            return (
              <blockquote className="my-3 pl-4 border-l-2 border-border/50 text-muted-foreground italic">
                {children}
              </blockquote>
            );
          },

          // Headings
          h1({ children }) {
            if (isInline) return <strong className="mr-1 font-semibold">{children}</strong>;
            return <h1 className="text-xl font-semibold mt-5 mb-2">{children}</h1>;
          },
          h2({ children }) {
            if (isInline) return <strong className="mr-1 font-semibold">{children}</strong>;
            return <h2 className="text-lg font-semibold mt-4 mb-2">{children}</h2>;
          },
          h3({ children }) {
            if (isInline) return <strong className="mr-1 font-semibold">{children}</strong>;
            return <h3 className="text-base font-semibold mt-3 mb-1.5">{children}</h3>;
          },

          // Lists
          ul({ children }) {
            if (isInline) return <span className="mr-1">{children}</span>;
            return <ul className="my-2 ml-4 list-disc space-y-1 marker:text-muted-foreground">{children}</ul>;
          },
          ol({ children }) {
            if (isInline) return <span className="mr-1">{children}</span>;
            return <ol className="my-2 ml-4 list-decimal space-y-1 marker:text-muted-foreground">{children}</ol>;
          },
          li({ children }) {
            if (isInline) return <span className="mr-1">&bull; {children}</span>;
            return <li className="text-sm leading-relaxed pl-1">{children}</li>;
          },

          // Paragraphs
          p({ children }) {
            if (isInline) return <span className="mr-1">{children}</span>;
            return <p className="my-2 text-sm leading-relaxed">{children}</p>;
          },

          // Horizontal rule
          hr() {
            return <hr className="my-4 border-border/30" />;
          },

          // Strong / emphasis
          strong({ children }) {
            return <strong className="font-semibold">{children}</strong>;
          },
          em({ children }) {
            return <em className="italic">{children}</em>;
          },
        }}
      >
        {displayedContent}
      </ReactMarkdown>
    </div>
  );
});
