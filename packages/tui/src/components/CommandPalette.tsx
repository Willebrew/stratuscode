/**
 * CommandPalette Component
 *
 * A modern, floating command palette with fuzzy search, icons, and keyboard shortcuts.
 * Replaces the old CommandMenu with a more polished design.
 */

import React, { useState, useMemo, useEffect } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import { colors } from '../theme/colors';
import { getAllCommands, getCategoryLabel, type Command } from '../commands/registry';

// ============================================
// Icons for commands (ASCII - no emojis)
// ============================================

import { icons } from '../theme/icons';

const CATEGORY_ICONS: Record<Command['category'], string> = {
  session: icons.file,
  mode: icons.code,
  tools: icons.terminal,
  settings: '*',
  help: '?',
};

const COMMAND_ICONS: Record<string, string> = {
  new: '+',
  clear: 'x',
  history: icons.bullet,
  plan: icons.bullet,
  build: icons.code,
  compact: icons.folder,
  search: icons.search,
  reindex: icons.inProgress,
  todos: icons.check,
  revert: '<-',
  lsp: icons.code,
  model: '*',
  theme: '*',
  config: '*',
  help: '?',
  shortcuts: '>',
  about: 'i',
};

// ============================================
// Fuzzy Search
// ============================================

interface ScoredCommand {
  command: Command;
  score: number;
  matchedChars: number[];
}

function fuzzyMatch(query: string, text: string): { score: number; matchedChars: number[] } {
  if (!query) return { score: 1, matchedChars: [] };
  
  const queryLower = query.toLowerCase();
  const textLower = text.toLowerCase();
  const matchedChars: number[] = [];
  
  let queryIndex = 0;
  let score = 0;
  let consecutiveBonus = 0;
  
  for (let i = 0; i < textLower.length && queryIndex < queryLower.length; i++) {
    if (textLower[i] === queryLower[queryIndex]) {
      matchedChars.push(i);
      score += 1 + consecutiveBonus;
      consecutiveBonus += 0.5; // Bonus for consecutive matches
      
      // Bonus for matching at word boundaries
      if (i === 0 || text[i - 1] === ' ' || text[i - 1] === '/') {
        score += 2;
      }
      
      queryIndex++;
    } else {
      consecutiveBonus = 0;
    }
  }
  
  // Only count as match if all query chars were found
  if (queryIndex < queryLower.length) {
    return { score: 0, matchedChars: [] };
  }
  
  // Normalize score by query length
  return { score: score / queryLower.length, matchedChars };
}

function searchCommandsFuzzy(query: string): ScoredCommand[] {
  const commands = getAllCommands();
  
  if (!query) {
    return commands.map(cmd => ({ command: cmd, score: 1, matchedChars: [] }));
  }
  
  const results: ScoredCommand[] = [];
  
  for (const command of commands) {
    // Try matching against name, shortcut, and description
    const nameMatch = fuzzyMatch(query, command.name);
    const shortcutMatch = command.shortcut ? fuzzyMatch(query, command.shortcut) : { score: 0, matchedChars: [] };
    const descMatch = fuzzyMatch(query, command.description);
    
    // Use the best match
    const bestScore = Math.max(
      nameMatch.score * 2, // Boost name matches
      shortcutMatch.score * 1.5, // Boost shortcut matches
      descMatch.score
    );
    
    if (bestScore > 0) {
      results.push({
        command,
        score: bestScore,
        matchedChars: nameMatch.score >= shortcutMatch.score && nameMatch.score >= descMatch.score
          ? nameMatch.matchedChars
          : [],
      });
    }
  }
  
  // Sort by score descending
  return results.sort((a, b) => b.score - a.score);
}

// ============================================
// Highlighted Text Component
// ============================================

function HighlightedText({ text, matchedChars, baseColor, highlightColor }: {
  text: string;
  matchedChars: number[];
  baseColor: string;
  highlightColor: string;
}) {
  if (matchedChars.length === 0) {
    return <Text color={baseColor}>{text}</Text>;
  }
  
  const chars = text.split('');
  const matchSet = new Set(matchedChars);
  
  return (
    <Text>
      {chars.map((char, i) => (
        <Text key={i} color={matchSet.has(i) ? highlightColor : baseColor} bold={matchSet.has(i)}>
          {char}
        </Text>
      ))}
    </Text>
  );
}

// ============================================
// Component
// ============================================

// ============================================
// Inline variant (no border, rendered inside UnifiedInput)
// ============================================

interface CommandPaletteInlineProps {
  query: string;
  selectedIndex: number;
  onSelect: (command: Command) => void;
  offset: number;
  onOffsetChange: (next: number) => void;
  pageSize?: number;
}

export function getCommandWindow(query: string, offset: number, pageSize = 12): Command[] {
  const results = searchCommandsFuzzy(query).map(r => r.command);
  const clampedOffset = Math.max(0, Math.min(offset, Math.max(0, results.length - pageSize)));
  return results.slice(clampedOffset, clampedOffset + pageSize);
}

export function getCommandResultCount(query: string): number {
  return searchCommandsFuzzy(query).length;
}

export function getCommandAtIndex(query: string, index: number): Command | null {
  const results = searchCommandsFuzzy(query);
  if (index < 0 || index >= results.length) return null;
  return results[index]!.command;
}

export function CommandPaletteInline({
  query,
  selectedIndex,
  onSelect,
  offset,
  onOffsetChange,
  pageSize = 12,
}: CommandPaletteInlineProps) {
  const results = useMemo(() => searchCommandsFuzzy(query), [query]);
  const total = results.length;
  const clampedOffset = Math.max(0, Math.min(offset, Math.max(0, total - pageSize)));
  if (clampedOffset !== offset) {
    onOffsetChange(clampedOffset);
  }
  const visibleResults = results.slice(clampedOffset, clampedOffset + pageSize);

  // Group results by category (must be before any early return to satisfy hooks rules)
  const groupedResults = useMemo(() => {
    const groups = new Map<Command['category'], ScoredCommand[]>();
    for (const result of visibleResults) {
      const category = result.command.category;
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category)!.push(result);
    }
    return groups;
  }, [visibleResults]);

  if (visibleResults.length === 0) {
    return (
      <Box paddingX={1} paddingY={0}>
        <Text color={colors.textMuted}>No commands found</Text>
      </Box>
    );
  }

  let globalIndex = clampedOffset;

  return (
    <Box flexDirection="column">
      {Array.from(groupedResults.entries()).map(([category, categoryResults]) => (
        <Box key={category} flexDirection="column" paddingX={1}>
          <Box>
            <Text color={colors.textDim} dimColor>
              {CATEGORY_ICONS[category]} {getCategoryLabel(category).toUpperCase()}
            </Text>
          </Box>
          {categoryResults.map((result) => {
            const isSelected = selectedIndex === globalIndex;
            const cmd = result.command;
            const icon = COMMAND_ICONS[cmd.name] || '•';
            globalIndex++;
            return (
              <Box key={cmd.name} justifyContent="space-between">
                <Box>
                  <Text color={isSelected ? colors.primary : colors.textDim}>
                    {isSelected ? '› ' : '  '}
                  </Text>
                  <Text>{icon} </Text>
                  <HighlightedText
                    text={cmd.name}
                    matchedChars={result.matchedChars}
                    baseColor={isSelected ? colors.primary : colors.text}
                    highlightColor={colors.secondary}
                  />
                  <Text color={colors.textMuted}> {cmd.description}</Text>
                </Box>
                <Box>
                  {cmd.shortcut && (
                    <Text color={colors.textDim}>/{cmd.shortcut}</Text>
                  )}
                </Box>
              </Box>
            );
          })}
        </Box>
      ))}
      <Box paddingX={1} justifyContent="space-between">
        <Text color={colors.textDim}>↑↓ navigate • Enter select • Esc close</Text>
        <Text color={colors.textMuted}>
          {selectedIndex + 1}/{total}
        </Text>
      </Box>
      <Box paddingX={1} justifyContent="space-between">
        <Text color={colors.textDim}>{clampedOffset > 0 ? `↑ ${clampedOffset} above` : ' '}</Text>
        <Text color={colors.textDim}>{total > clampedOffset + visibleResults.length ? `${total - (clampedOffset + visibleResults.length)} below ↓` : ' '}</Text>
      </Box>
    </Box>
  );
}

// ============================================
// Standalone variant (original, with border)
// ============================================

interface CommandPaletteProps {
  query: string;
  onSelect: (command: Command) => void;
  onClose: () => void;
  maxVisible?: number;
}

export function CommandPalette({ query, onSelect, onClose, maxVisible = 12 }: CommandPaletteProps) {
  const { stdout } = useStdout();
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  const results = useMemo(() => searchCommandsFuzzy(query), [query]);
  const visibleResults = results.slice(0, maxVisible);
  
  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);
  
  useInput((input, key) => {
    if (key.escape) {
      onClose();
      return;
    }
    
    if (key.upArrow) {
      setSelectedIndex(i => Math.max(0, i - 1));
      return;
    }
    
    if (key.downArrow) {
      setSelectedIndex(i => Math.min(visibleResults.length - 1, i + 1));
      return;
    }
    
    const selectedResult = visibleResults[selectedIndex];
    if (key.return && selectedResult) {
      onSelect(selectedResult.command);
      return;
    }
    
    // Number keys for quick select (1-9)
    const num = parseInt(input, 10);
    if (num >= 1 && num <= Math.min(9, visibleResults.length)) {
      const quickResult = visibleResults[num - 1];
      if (quickResult) {
        onSelect(quickResult.command);
      }
      return;
    }
  });
  
  // Group results by category for display
  const groupedResults = useMemo(() => {
    const groups = new Map<Command['category'], ScoredCommand[]>();
    
    for (const result of visibleResults) {
      const category = result.command.category;
      if (!groups.has(category)) {
        groups.set(category, []);
      }
      groups.get(category)!.push(result);
    }
    
    return groups;
  }, [visibleResults]);
  
  // Calculate box width based on terminal
  const terminalWidth = stdout?.columns ?? 80;
  const boxWidth = Math.min(60, terminalWidth - 4);
  
  if (visibleResults.length === 0) {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={colors.border}
        paddingX={1}
        width={boxWidth}
      >
        <Box paddingY={0}>
          <Text color={colors.primary}>{icons.search} </Text>
          <Text color={colors.textDim}>/{query}</Text>
        </Box>
        <Box borderStyle="single" borderTop borderBottom={false} borderLeft={false} borderRight={false} borderColor={colors.border} />
        <Box paddingY={0}>
          <Text color={colors.textMuted}>No commands found</Text>
        </Box>
      </Box>
    );
  }
  
  let globalIndex = 0;
  
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={colors.primary}
      width={boxWidth}
    >
      {/* Search header */}
      <Box paddingX={1} paddingY={0}>
        <Text color={colors.primary}>{icons.search} </Text>
        <Text color={query ? colors.text : colors.textDim}>
          {query ? `/${query}` : 'Search commands...'}
        </Text>
      </Box>
      
      {/* Divider */}
      <Box paddingX={1}>
        <Text color={colors.border}>{'─'.repeat(boxWidth - 4)}</Text>
      </Box>
      
      {/* Commands grouped by category */}
      {Array.from(groupedResults.entries()).map(([category, categoryResults]) => (
        <Box key={category} flexDirection="column" paddingX={1}>
          {/* Category header */}
          <Box>
            <Text color={colors.textDim} dimColor>
              {CATEGORY_ICONS[category]} {getCategoryLabel(category).toUpperCase()}
            </Text>
          </Box>
          
          {/* Commands in category */}
          {categoryResults.map((result) => {
            const isSelected = globalIndex === selectedIndex;
            const cmd = result.command;
            const icon = COMMAND_ICONS[cmd.name] || '•';
            const currentIndex = globalIndex;
            globalIndex++;
            
            return (
              <Box key={cmd.name} justifyContent="space-between">
                <Box>
                  <Text color={isSelected ? colors.primary : colors.textDim}>
                    {isSelected ? '› ' : '  '}
                  </Text>
                  <Text>{icon} </Text>
                  <HighlightedText
                    text={cmd.name}
                    matchedChars={result.matchedChars}
                    baseColor={isSelected ? colors.primary : colors.text}
                    highlightColor={colors.secondary}
                  />
                  <Text color={colors.textMuted}> {cmd.description}</Text>
                </Box>
                <Box>
                  {cmd.shortcut && (
                    <Text color={colors.textDim}>/{cmd.shortcut}</Text>
                  )}
                </Box>
              </Box>
            );
          })}
        </Box>
      ))}
      
      {/* Footer with hints */}
      <Box paddingX={1}>
        <Text color={colors.border}>{'─'.repeat(boxWidth - 4)}</Text>
      </Box>
      <Box paddingX={1} justifyContent="space-between">
        <Text color={colors.textDim}>↑↓ navigate • Enter select • Esc close</Text>
        <Text color={colors.textMuted}>
          {selectedIndex + 1}/{visibleResults.length}
          {results.length > maxVisible && ` (${results.length} total)`}
        </Text>
      </Box>
    </Box>
  );
}
