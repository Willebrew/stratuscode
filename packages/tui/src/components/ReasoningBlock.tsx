/**
 * ReasoningBlock Component
 *
 * Shows reasoning/thinking with animated indicator while streaming.
 * Collapses when done, can be expanded by pressing Enter.
 */

import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { colors } from '../theme/colors';

const CODE_COLOR = '#8642EC';
const SWEEP_CHARS = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export interface ReasoningBlockProps {
  reasoning: string;
  isStreaming: boolean;
  isFocused?: boolean;
}

export function ReasoningBlock({ reasoning, isStreaming, isFocused = false }: ReasoningBlockProps) {
  const [frame, setFrame] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);

  // Auto-expand while streaming, collapse when done
  useEffect(() => {
    if (isStreaming) {
      setIsExpanded(true);
    } else {
      // Collapse after streaming stops
      const timer = setTimeout(() => setIsExpanded(false), 500);
      return () => clearTimeout(timer);
    }
  }, [isStreaming]);

  // Animate spinner while streaming
  useEffect(() => {
    if (!isStreaming) return;
    const interval = setInterval(() => {
      setFrame(prev => (prev + 1) % SWEEP_CHARS.length);
    }, 150);
    return () => clearInterval(interval);
  }, [isStreaming]);

  // Handle keyboard input to toggle expand/collapse
  useInput((input, key) => {
    if (isFocused && key.return && !isStreaming) {
      setIsExpanded(prev => !prev);
    }
  });

  if (!reasoning) return null;

  // Collapsed view - just shows "Thought for X seconds" or similar
  if (!isExpanded && !isStreaming) {
    const wordCount = reasoning.split(/\s+/).length;
    return (
      <Box marginLeft={2} marginY={1}>
        <Text color={colors.textDim}>
          ~ Thought ({wordCount} words)
        </Text>
        <Text color={colors.textMuted}> - press Enter to expand</Text>
      </Box>
    );
  }

  // Expanded/streaming view
  const displayText = isStreaming 
    ? reasoning.slice(-300) // Show last 300 chars while streaming
    : reasoning;

  return (
    <Box flexDirection="column" marginLeft={2} marginY={1}>
      {/* Header */}
      <Box>
        {isStreaming ? (
          <>
            <Text color={CODE_COLOR}>{SWEEP_CHARS[frame]} </Text>
            <Text color={colors.textMuted} italic>Thinking...</Text>
          </>
        ) : (
          <>
            <Text color={colors.textDim}>~ Reasoning</Text>
            <Text color={colors.textMuted}> - press Enter to collapse</Text>
          </>
        )}
      </Box>

      {/* Content */}
      <Box 
        marginTop={1}
        paddingLeft={2}
        borderStyle="single"
        borderColor={colors.border}
        borderLeft
        borderTop={false}
        borderRight={false}
        borderBottom={false}
      >
        <Text color={colors.textDim} italic wrap="wrap">
          {displayText}
          {isStreaming && reasoning.length > 300 && '...'}
        </Text>
      </Box>
    </Box>
  );
}
