/**
 * InlineSheet
 *
 * A bordered panel rendered inside the UnifiedInput box.
 * Used for inline model picker, history, and question prompts.
 */

import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../theme/colors';

export interface InlineSheetProps {
  title: string;
  hint?: string;
  children: React.ReactNode;
  /** Optional accent icon or glyph placed before the title */
  icon?: string;
}

export function InlineSheet({ title, hint, children, icon }: InlineSheetProps) {
  return (
    <Box
      flexDirection="column"
      width="100%"
    >
      <Box justifyContent="space-between" alignItems="center">
        <Box>
          {icon && <Text color={colors.secondary}>{icon} </Text>}
          <Text color={colors.text} bold>{title}</Text>
        </Box>
        {hint && <Text color={colors.textDim}>{hint}</Text>}
      </Box>

      <Box>
        <Text color={colors.border}>{'─'.repeat(48)}</Text>
      </Box>

      <Box flexDirection="column" gap={0}>
        {children}
      </Box>
    </Box>
  );
}
