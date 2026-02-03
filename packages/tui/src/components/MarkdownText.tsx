/**
 * MarkdownText Component
 *
 * Renders markdown content with ANSI terminal styling using marked + marked-terminal.
 * Color scheme inspired by OpenCode's TUI theme for a polished look.
 */

import React, { useMemo } from 'react';
import { Text, useStdout } from 'ink';
import { Marked } from 'marked';
// @ts-ignore -- no types available
import { markedTerminal } from 'marked-terminal';
import { Chalk } from 'chalk';

// Force color level 3 (truecolor) — chalk's auto-detection fails in Ink's
// piped stdout, but Ink renders ANSI just fine via its own output.
const chalk = new Chalk({ level: 3 });

// OpenCode-inspired color palette
const PURPLE = '#9d7cd8';   // headings
const GREEN = '#7fd88f';    // code
const ORANGE = '#f5a742';   // bold/strong
const YELLOW = '#e5c07b';   // italic/emphasis, blockquotes
const CYAN = '#56b6c2';     // links
const MUTED = '#808080';    // hr, dim elements
const TEXT = '#e0e0e0';     // normal text (bright enough to be readable)


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
      const renderer = markedTerminal({
        // Headings
        firstHeading: chalk.bold.hex(PURPLE).underline,
        heading: chalk.bold.hex(PURPLE),
        // Code
        code: chalk.hex(GREEN),
        codespan: chalk.hex(GREEN),
        // Text styling
        strong: chalk.bold.hex(ORANGE),
        em: chalk.italic.hex(YELLOW),
        del: chalk.dim.strikethrough,
        // Links
        link: chalk.hex(CYAN),
        href: chalk.hex(CYAN).underline,
        // Lists & blocks — use identity to avoid stripping inner bold/em styles
        listitem: (s: string) => s,
        blockquote: chalk.italic.hex(YELLOW),
        // Layout — identity preserves inner ANSI codes (bold, color, etc.)
        paragraph: (s: string) => s,
        table: (s: string) => s,
        // Horizontal rule
        hr: chalk.hex(MUTED),
        // Options
        reflowText: true,
        showSectionPrefix: false,
        tab: 2,
        emoji: false,
        width: termWidth,
      });

      const localMarked = new Marked();
      localMarked.use(renderer);

      let result = localMarked.parse(content, { async: false }) as string;

      // marked v17 breaks inline formatting inside list items (marked-terminal
      // requires marked <16). Post-process any remaining raw markdown syntax
      // that wasn't converted to ANSI by marked-terminal.
      result = result.replace(/\*\*(.+?)\*\*/g, (_m, text) => chalk.bold.hex(ORANGE)(text));
      result = result.replace(/`([^`]+)`/g, (_m, text) => chalk.hex(GREEN)(text));

      // Replace asterisk bullets with styled bullet character.
      // marked-terminal hardcodes '* ' as the bullet prefix (outside any ANSI styling).
      const styledBullet = chalk.hex(TEXT)('•');
      result = result.replace(/^(\s*)\* /gm, `$1${styledBullet} `);
      // Strip trailing newlines that marked adds
      return result.replace(/\n+$/, '');
    } catch {
      return content;
    }
  }, [content, termWidth]);

  if (!rendered) return null;

  return <Text>{rendered}</Text>;
});
