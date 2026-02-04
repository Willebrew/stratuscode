/**
 * InputBar Component
 *
 * Combined input box and status bar in one seamless rounded box.
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Input } from './Input';
import { colors, getAgentColor } from '../theme/colors';
import type { Command } from '../commands/registry';

const CODE_COLOR = '#7C3AED';

export interface InputBarProps {
  agent: string;
  model: string;
  tokens: { input: number; output: number };
  isLoading: boolean;
  onSubmit: (text: string) => void;
  onCommand?: (command: Command) => void;
  disabled?: boolean;
  placeholder?: string;
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

export function InputBar({
  agent,
  model,
  tokens,
  isLoading,
  onSubmit,
  onCommand,
  disabled,
  placeholder,
}: InputBarProps) {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={colors.primary}
    >
      {/* Input row */}
      <Box paddingX={1}>
        <Input
          onSubmit={onSubmit}
          onCommand={onCommand}
          disabled={disabled || isLoading}
          placeholder={placeholder || (isLoading ? 'Processing...' : 'Type a message... (/ for commands)')}
        />
      </Box>

      {/* Divider */}
      <Box paddingX={1}>
        <Text color={colors.border}>{'─'.repeat(100)}</Text>
      </Box>

      {/* Status row */}
      <Box paddingX={2} justifyContent="space-between">
        {/* Left: Branding and agent */}
        <Box>
          <Text color="white" bold>Stratus</Text>
          <Text color={CODE_COLOR} bold>Code</Text>
          <Text color={colors.textDim}> • </Text>
          <Text color={getAgentColor(agent)} bold>{agent.toUpperCase()}</Text>
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
    </Box>
  );
}
