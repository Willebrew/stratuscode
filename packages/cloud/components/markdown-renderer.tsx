'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { useState, useCallback } from 'react';
import { Check, Copy } from 'lucide-react';

// Custom dark theme matching the existing UI
const codeTheme: Record<string, React.CSSProperties> = {
  'pre[class*="language-"]': {
    background: 'transparent',
    color: '#e4e4e7',
    margin: 0,
    padding: 0,
    overflow: 'auto',
    fontSize: '0.8125rem',
    lineHeight: '1.6',
  },
  'code[class*="language-"]': {
    background: 'transparent',
    color: '#e4e4e7',
    fontSize: '0.8125rem',
    lineHeight: '1.6',
    fontFamily: 'var(--font-mono), ui-monospace, monospace',
  },
  comment: { color: '#6b7280' },
  prolog: { color: '#6b7280' },
  doctype: { color: '#6b7280' },
  cdata: { color: '#6b7280' },
  punctuation: { color: '#a8a29e' },
  property: { color: '#93c5fd' },
  tag: { color: '#f87171' },
  boolean: { color: '#c084fc' },
  number: { color: '#c084fc' },
  constant: { color: '#c084fc' },
  symbol: { color: '#c084fc' },
  deleted: { color: '#f87171' },
  selector: { color: '#86efac' },
  'attr-name': { color: '#fcd34d' },
  string: { color: '#86efac' },
  char: { color: '#86efac' },
  builtin: { color: '#93c5fd' },
  inserted: { color: '#86efac' },
  operator: { color: '#a8a29e' },
  entity: { color: '#fcd34d' },
  url: { color: '#93c5fd' },
  'attr-value': { color: '#86efac' },
  keyword: { color: '#f472b6' },
  regex: { color: '#fcd34d' },
  important: { color: '#fcd34d', fontWeight: 'bold' },
  variable: { color: '#f472b6' },
  function: { color: '#93c5fd' },
  'class-name': { color: '#fcd34d' },
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
}

export function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  return (
    <div className={`markdown-body ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          // Code blocks with syntax highlighting
          code({ node, className: codeClassName, children, ...props }) {
            const match = /language-(\w+)/.exec(codeClassName || '');
            const codeString = String(children).replace(/\n$/, '');
            const isInline = !match && !codeString.includes('\n');

            if (isInline) {
              return (
                <code
                  className="px-1.5 py-0.5 rounded-md bg-muted text-[0.8125rem] font-mono"
                  {...props}
                >
                  {children}
                </code>
              );
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
            return (
              <div className="my-3 overflow-x-auto rounded-xl border border-border/30">
                <table className="w-full text-sm border-collapse">
                  {children}
                </table>
              </div>
            );
          },
          thead({ children }) {
            return (
              <thead className="bg-secondary/50 border-b border-border/30">
                {children}
              </thead>
            );
          },
          th({ children }) {
            return (
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                {children}
              </th>
            );
          },
          td({ children }) {
            return (
              <td className="px-3 py-2 text-sm border-t border-border/20">
                {children}
              </td>
            );
          },

          // Links
          a({ href, children }) {
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
            return (
              <blockquote className="my-3 pl-4 border-l-2 border-border/50 text-muted-foreground italic">
                {children}
              </blockquote>
            );
          },

          // Headings
          h1({ children }) {
            return <h1 className="text-xl font-semibold mt-5 mb-2">{children}</h1>;
          },
          h2({ children }) {
            return <h2 className="text-lg font-semibold mt-4 mb-2">{children}</h2>;
          },
          h3({ children }) {
            return <h3 className="text-base font-semibold mt-3 mb-1.5">{children}</h3>;
          },

          // Lists
          ul({ children }) {
            return <ul className="my-2 ml-4 list-disc space-y-1 marker:text-muted-foreground">{children}</ul>;
          },
          ol({ children }) {
            return <ol className="my-2 ml-4 list-decimal space-y-1 marker:text-muted-foreground">{children}</ol>;
          },
          li({ children }) {
            return <li className="text-sm leading-relaxed pl-1">{children}</li>;
          },

          // Paragraphs
          p({ children }) {
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
        {content}
      </ReactMarkdown>
    </div>
  );
}
