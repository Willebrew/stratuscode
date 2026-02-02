/**
 * MarkdownText Component
 *
 * Renders markdown content with ANSI terminal styling using marked + marked-terminal.
 * Uses dynamic terminal width and handles streaming gracefully.
 */

import React, { useMemo } from 'react';
import { Text, useStdout } from 'ink';
import { Marked } from 'marked';
// @ts-ignore -- no types available
import { markedTerminal } from 'marked-terminal';
import chalk from 'chalk';

const CODE_COLOR = '#8642EC';

export interface MarkdownTextProps {
  content: string;
  width?: number;
}

export const MarkdownText = React.memo(function MarkdownText({ content, width }: MarkdownTextProps) {
  const { stdout } = useStdout();
  const termWidth = width ?? (stdout?.columns ? stdout.columns - 8 : 80);

  const rendered = useMemo(() => {
    if (!content.trim()) return '';
    try {
      // Create renderer per-call with current width
      const renderer = markedTerminal({
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
        width: termWidth,
      });

      const localMarked = new Marked();
      localMarked.use(renderer);

      const result = localMarked.parse(content, { async: false }) as string;
      // Strip trailing newlines that marked adds
      return result.replace(/\n+$/, '');
    } catch {
      return content;
    }
  }, [content, termWidth]);

  if (!rendered) return null;

  return <Text>{rendered}</Text>;
});
