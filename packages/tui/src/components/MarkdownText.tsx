/**
 * MarkdownText Component
 *
 * Renders markdown content with ANSI terminal styling using marked + marked-terminal.
 * Produces styled headings, bold, italic, code blocks, lists, etc.
 */

import React, { useMemo } from 'react';
import { Text } from 'ink';
import { marked } from 'marked';
import { markedTerminal } from 'marked-terminal';
import chalk from 'chalk';

const CODE_COLOR = '#8642EC';

// Configure marked with terminal renderer once
const terminalRenderer = markedTerminal({
  // Headings
  firstHeading: chalk.bold.white.underline,
  heading: chalk.bold.white,
  // Code
  code: chalk.hex(CODE_COLOR),
  codespan: chalk.hex(CODE_COLOR),
  // Text styling
  strong: chalk.bold,
  em: chalk.italic,
  del: chalk.dim.strikethrough,
  // Links
  link: chalk.cyan,
  href: chalk.cyan.underline,
  // Lists & blocks
  listitem: chalk.reset,
  blockquote: chalk.gray.italic,
  // Layout
  paragraph: chalk.reset,
  table: chalk.reset,
  // Options
  reflowText: true,
  showSectionPrefix: false,
  tab: 2,
  emoji: false,
  width: 96,
});

marked.use(terminalRenderer);

export interface MarkdownTextProps {
  content: string;
  width?: number;
}

export const MarkdownText = React.memo(function MarkdownText({ content }: MarkdownTextProps) {
  const rendered = useMemo(() => {
    if (!content.trim()) return '';
    try {
      const result = marked.parse(content, { async: false }) as string;
      // Strip trailing newlines that marked adds
      return result.replace(/\n+$/, '');
    } catch {
      // Fallback to raw content if parsing fails
      return content;
    }
  }, [content]);

  if (!rendered) return null;

  return <Text>{rendered}</Text>;
});
