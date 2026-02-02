/**
 * Permission Prompt Component
 *
 * Interactive prompt for permission requests.
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

// ============================================
// Types
// ============================================

export interface PermissionPromptProps {
  tool: string;
  prompt: string;
  onDecision: (decision: PermissionDecision) => void;
}

export type PermissionDecision = 'allow' | 'deny' | 'always' | 'never';

// ============================================
// Component
// ============================================

export function PermissionPrompt({ tool, prompt, onDecision }: PermissionPromptProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const options: Array<{ key: string; label: string; decision: PermissionDecision }> = [
    { key: 'y', label: 'Yes', decision: 'allow' },
    { key: 'n', label: 'No', decision: 'deny' },
    { key: 'a', label: 'Always (this session)', decision: 'always' },
    { key: 'v', label: 'Never (this session)', decision: 'never' },
  ];

  useInput((input, key) => {
    // Handle direct key presses
    const option = options.find(o => o.key === input.toLowerCase());
    if (option) {
      onDecision(option.decision);
      return;
    }

    // Handle arrow navigation
    if (key.upArrow) {
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : options.length - 1));
    } else if (key.downArrow) {
      setSelectedIndex(prev => (prev < options.length - 1 ? prev + 1 : 0));
    } else if (key.return) {
      const selected = options[selectedIndex];
      if (selected) {
        onDecision(selected.decision);
      }
    }
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1}>
      <Box marginBottom={1}>
        <Text bold color="yellow">⚠️ Permission Required</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        {prompt.split('\n').map((line, i) => (
          <Text key={i}>{line}</Text>
        ))}
      </Box>

      <Box flexDirection="column">
        {options.map((option, index) => (
          <Box key={option.key}>
            <Text color={index === selectedIndex ? 'cyan' : undefined}>
              {index === selectedIndex ? '▸ ' : '  '}
              [{option.key.toUpperCase()}] {option.label}
            </Text>
          </Box>
        ))}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Press key or Enter to select</Text>
      </Box>
    </Box>
  );
}
