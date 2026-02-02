/**
 * StatusBar Component
 *
 * Shows current status, model, and token usage.
 */

import React from 'react';
import { Box, Text } from 'ink';
import { colors, getAgentColor } from '../theme/colors';

// Purple color matching splash screen
const CODE_COLOR = '#8642EC';

// ============================================
// Types
// ============================================

export interface StatusBarProps {
  agent: string;
  model: string;
  tokens: { input: number; output: number };
  isLoading: boolean;
}

// ============================================
// Component
// ============================================

export function StatusBar({ agent, model, tokens, isLoading }: StatusBarProps) {
  return (
    <Box
      borderStyle="round"
      borderColor={colors.border}
      paddingX={2}
      justifyContent="space-between"
    >
      {/* Left: Agent and status */}
      <Box>
        <Text color="white" bold>Stratus</Text>
        <Text color={CODE_COLOR} bold>Code</Text>
        <Text color={colors.textDim}> • </Text>
        <Text color={getAgentColor(agent)} bold>
          {agent.toUpperCase()}
        </Text>
        <Text color={colors.textDim}> • </Text>
        <Text color={colors.textMuted}>{model}</Text>
        {isLoading && (
          <>
            <Text color={colors.textDim}> • </Text>
            <Text color={colors.secondary}>Working...</Text>
          </>
        )}
      </Box>

      {/* Right: Tokens */}
      <Box>
        <Text color={colors.textDim}>Tokens </Text>
        <Text color={colors.text}>{formatNumber(tokens.input)}</Text>
        <Text color={colors.textDim}> in / </Text>
        <Text color={colors.text}>{formatNumber(tokens.output)}</Text>
        <Text color={colors.textDim}> out</Text>
      </Box>
    </Box>
  );
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}
