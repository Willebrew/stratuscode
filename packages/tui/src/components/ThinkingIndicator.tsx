/**
 * ThinkingIndicator Component
 *
 * Smooth animated indicator for when the model is thinking/reasoning.
 */

import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { colors } from '../theme/colors';

export interface ThinkingIndicatorProps {
  text?: string;
}

const SWEEP_CHARS = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const CODE_COLOR = '#8642EC';

export function ThinkingIndicator({ text }: ThinkingIndicatorProps) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setFrame(prev => (prev + 1) % SWEEP_CHARS.length);
    }, 150);
    return () => clearInterval(interval);
  }, []);

  return (
    <Box>
      <Text color={CODE_COLOR}>{SWEEP_CHARS[frame]} </Text>
      <Text color={colors.textMuted} italic>
        {text ? text.slice(-200) : 'Thinking...'}
      </Text>
    </Box>
  );
}
