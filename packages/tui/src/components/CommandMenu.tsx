/**
 * Command Menu Component
 *
 * Slash command autocomplete menu shown when user types '/'.
 */

import React, { useState, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { colors } from '../theme/colors';
import { icons } from '../theme/icons';
import { searchCommands, getCategoryLabel, type Command } from '../commands/registry';

interface CommandMenuProps {
  query: string;
  onSelect: (command: Command) => void;
  onClose: () => void;
  maxVisible?: number;
}

export function CommandMenu({ query, onSelect, onClose, maxVisible = 10 }: CommandMenuProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  
  const filteredCommands = useMemo(() => {
    return searchCommands(query);
  }, [query]);
  
  // Calculate visible window with scroll offset
  const visibleStart = scrollOffset;
  const visibleEnd = Math.min(scrollOffset + maxVisible, filteredCommands.length);
  const visibleCommands = filteredCommands.slice(visibleStart, visibleEnd);
  const hasMore = filteredCommands.length > visibleEnd;
  const hasLess = scrollOffset > 0;
  
  useInput((input, key) => {
    if (key.escape) {
      onClose();
      return;
    }
    
    if (key.upArrow) {
      if (selectedIndex > 0) {
        setSelectedIndex(i => i - 1);
      } else if (scrollOffset > 0) {
        // Scroll up
        setScrollOffset(o => o - 1);
      }
      return;
    }
    
    if (key.downArrow) {
      if (selectedIndex < visibleCommands.length - 1) {
        setSelectedIndex(i => i + 1);
      } else if (hasMore) {
        // Scroll down
        setScrollOffset(o => o + 1);
      }
      return;
    }
    
    if (key.return && visibleCommands[selectedIndex]) {
      onSelect(visibleCommands[selectedIndex]);
      return;
    }
  });
  
  // Reset selection and scroll when query changes
  React.useEffect(() => {
    setSelectedIndex(0);
    setScrollOffset(0);
  }, [query]);
  
  if (visibleCommands.length === 0) {
    return (
      <Box
        borderStyle="single"
        borderColor={colors.border}
        paddingX={1}
        flexDirection="column"
      >
        <Text color={colors.textMuted}>No commands found</Text>
      </Box>
    );
  }
  
  // Group by category
  const groupedCommands: Map<string, Command[]> = new Map();
  for (const cmd of visibleCommands) {
    const existing = groupedCommands.get(cmd.category) || [];
    existing.push(cmd);
    groupedCommands.set(cmd.category, existing);
  }
  
  return (
    <Box
      borderStyle="single"
      borderColor={colors.border}
      flexDirection="column"
      paddingX={1}
    >
      <Box marginBottom={1}>
        <Text color={colors.textMuted}>Commands</Text>
        <Text color={colors.textDim}> {icons.dot} </Text>
        <Text color={colors.textDim}>↑↓ navigate</Text>
        <Text color={colors.textDim}> {icons.dot} </Text>
        <Text color={colors.textDim}>Enter select</Text>
        <Text color={colors.textDim}> {icons.dot} </Text>
        <Text color={colors.textDim}>Esc close</Text>
      </Box>
      
      {Array.from(groupedCommands.entries()).map(([category, cmds], groupIndex) => (
        <Box key={category} flexDirection="column" marginBottom={groupIndex < groupedCommands.size - 1 ? 1 : 0}>
          <Text color={colors.textDim} dimColor>
            {getCategoryLabel(category as Command['category'])}
          </Text>
          
          {cmds.map((cmd, cmdIndex) => {
            const globalIndex = visibleCommands.indexOf(cmd);
            const isSelected = globalIndex === selectedIndex;
            
            return (
              <Box key={cmd.name}>
                <Text color={isSelected ? colors.primary : colors.text}>
                  {isSelected ? icons.chevronRight : ' '}
                </Text>
                <Text color={isSelected ? colors.primary : colors.secondary}>
                  /{cmd.name}
                </Text>
                {cmd.shortcut && (
                  <Text color={colors.textDim}> (/{cmd.shortcut})</Text>
                )}
                <Text color={colors.textMuted}> - {cmd.description}</Text>
              </Box>
            );
          })}
        </Box>
      ))}
      
      {/* Scroll indicators */}
      <Box marginTop={1} justifyContent="space-between">
        <Text color={colors.textDim}>
          {hasLess && `${icons.arrowUp} ${scrollOffset} above`}
        </Text>
        <Text color={colors.textMuted}>
          {scrollOffset + 1}-{visibleEnd} of {filteredCommands.length}
        </Text>
        <Text color={colors.textDim}>
          {hasMore && `${filteredCommands.length - visibleEnd} below ${icons.arrowDown}`}
        </Text>
      </Box>
    </Box>
  );
}
