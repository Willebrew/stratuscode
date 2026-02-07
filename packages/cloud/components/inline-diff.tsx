'use client';

import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, FileCode } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';

interface InlineDiffProps {
  diff: string;
  filename?: string;
  defaultExpanded?: boolean;
  hideHeader?: boolean;
}

interface DiffLine {
  type: 'added' | 'removed' | 'context' | 'header';
  content: string;
  oldLineNo?: number;
  newLineNo?: number;
}

function parseDiff(raw: string): { filename: string; lines: DiffLine[] } {
  const lines = raw.split('\n');
  const parsed: DiffLine[] = [];
  let filename = '';
  let oldLine = 0;
  let newLine = 0;

  for (const line of lines) {
    if (line.startsWith('--- ')) {
      continue;
    }
    if (line.startsWith('+++ ')) {
      filename = line.slice(4).replace(/^[ab]\//, '');
      continue;
    }
    if (line.startsWith('@@')) {
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)/);
      if (match) {
        oldLine = parseInt(match[1], 10);
        newLine = parseInt(match[2], 10);
        parsed.push({ type: 'header', content: line });
      }
      continue;
    }
    if (line.startsWith('diff ')) {
      continue;
    }
    if (line.startsWith('+')) {
      parsed.push({ type: 'added', content: line.slice(1), newLineNo: newLine++ });
    } else if (line.startsWith('-')) {
      parsed.push({ type: 'removed', content: line.slice(1), oldLineNo: oldLine++ });
    } else if (line.startsWith(' ')) {
      parsed.push({ type: 'context', content: line.slice(1), oldLineNo: oldLine++, newLineNo: newLine++ });
    }
  }

  return { filename, lines: parsed };
}

export function InlineDiff({ diff, filename: filenameProp, defaultExpanded = true, hideHeader = false }: InlineDiffProps) {
  const { filename: parsedFilename, lines } = useMemo(() => parseDiff(diff), [diff]);
  const displayFilename = filenameProp || parsedFilename || 'file';
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const addedCount = lines.filter(l => l.type === 'added').length;
  const removedCount = lines.filter(l => l.type === 'removed').length;

  const diffTable = (
    <div className="overflow-x-auto max-h-96 scrollbar-hide bg-muted/30">
      <table className="w-full border-collapse">
        <tbody>
          {lines.map((line, i) => {
            if (line.type === 'header') {
              return (
                <tr key={i} className="bg-blue-50/50 dark:bg-blue-900/10">
                  <td colSpan={3} className="px-3 py-1 text-blue-600 dark:text-blue-400 text-[11px]">
                    {line.content}
                  </td>
                </tr>
              );
            }

            return (
              <tr
                key={i}
                className={clsx(
                  line.type === 'added' && 'bg-green-50 dark:bg-green-900/15',
                  line.type === 'removed' && 'bg-red-50 dark:bg-red-900/15',
                )}
              >
                <td className="w-10 px-2 py-0 text-right text-muted-foreground/50 select-none border-r border-border/30">
                  {line.oldLineNo ?? ''}
                </td>
                <td className="w-10 px-2 py-0 text-right text-muted-foreground/50 select-none border-r border-border/30">
                  {line.newLineNo ?? ''}
                </td>
                <td className="px-3 py-0 whitespace-pre">
                  <span className={clsx(
                    'inline-block w-4 select-none',
                    line.type === 'added' && 'text-green-600 dark:text-green-400',
                    line.type === 'removed' && 'text-red-500 dark:text-red-400',
                  )}>
                    {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                  </span>
                  {line.content}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  if (hideHeader) {
    return <div className="text-xs font-mono bg-muted/30">{diffTable}</div>;
  }

  return (
    <div className="rounded-xl border border-border/50 overflow-hidden my-2 text-xs font-mono">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-3 py-2.5 bg-secondary/40 hover:bg-secondary/60 transition-colors duration-200 text-left"
      >
        <FileCode className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        <span className="flex-1 truncate text-foreground/80">{displayFilename}</span>
        <span className="flex items-center gap-2 flex-shrink-0">
          {addedCount > 0 && <span className="text-green-600">+{addedCount}</span>}
          {removedCount > 0 && <span className="text-red-500">-{removedCount}</span>}
        </span>
        <motion.div
          animate={{ rotate: isExpanded ? 90 : 0 }}
          transition={{ duration: 0.15 }}
        >
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
        </motion.div>
      </button>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {diffTable}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
