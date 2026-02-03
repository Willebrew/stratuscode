/**
 * ReasoningBlock Component
 *
 * Shows reasoning/thinking with animated indicator while streaming.
 * Collapses when done. Only the active block (isActive=true) listens
 * for Enter to toggle — avoids MaxListenersExceeded with many blocks.
 */

import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { colors } from '../theme/colors';

const CODE_COLOR = '#8642EC';
const SWEEP_CHARS = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export interface ReasoningBlockProps {
  reasoning: string;
  isStreaming: boolean;
  /** Only one reasoning block should be active for keyboard input at a time */
  isActive?: boolean;
  /** Start expanded (for completed blocks that should be visible) */
  defaultExpanded?: boolean;
}

export function ReasoningBlock({ reasoning, isStreaming, isActive = false, defaultExpanded = false }: ReasoningBlockProps) {
  const [frame, setFrame] = useState(0);
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  // Auto-expand while streaming
  useEffect(() => {
    if (isStreaming) {
      setIsExpanded(true);
    }
  }, [isStreaming]);

  // Animate spinner while streaming
  useEffect(() => {
    if (!isStreaming) return;
    const interval = setInterval(() => {
      setFrame(prev => (prev + 1) % SWEEP_CHARS.length);
    }, 300);
    return () => clearInterval(interval);
  }, [isStreaming]);

  // Only register input listener when this block is the active one
  // (prevents MaxListenersExceeded when many blocks exist in history)
  useInput((input, key) => {
    if (key.return) {
      setIsExpanded(prev => !prev);
    }
  }, { isActive: isActive && !isStreaming });

  if (!reasoning) return null;

  // Collapsed view
  if (!isExpanded && !isStreaming) {
    const wordCount = reasoning.split(/\s+/).length;
    return (
      <Box marginLeft={2} marginY={0}>
        <Text color={colors.textDim}>
          ~ Thought ({wordCount} words)
        </Text>
        {isActive && (
          <Text color={colors.textMuted}> - press Enter to expand</Text>
        )}
      </Box>
    );
  }

  // Expanded/streaming view
  const displayText = isStreaming
    ? reasoning.slice(-300)
    : reasoning;

  return (
    <Box flexDirection="column" marginLeft={2} marginY={0}>
      {/* Header */}
      <Box>
        {isStreaming ? (
          <>
            <Text color={CODE_COLOR}>{SWEEP_CHARS[frame]} </Text>
            <Text color={colors.textMuted} italic>Thinking</Text>
          </>
        ) : (
          <>
            <Text color={colors.textDim}>~ Reasoning</Text>
            {isActive && (
              <Text color={colors.textMuted}> - press Enter to collapse</Text>
            )}
          </>
        )}
      </Box>

      {/* Content */}
      <Box
        marginTop={0}
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
