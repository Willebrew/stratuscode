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

/** Isolated spinner — only this tiny component re-renders on each tick */
const Spinner = React.memo(function Spinner() {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setFrame(f => (f + 1) % SWEEP_CHARS.length), 80);
    return () => clearInterval(id);
  }, []);
  return <Text color={CODE_COLOR}>{SWEEP_CHARS[frame]} </Text>;
});

export function ThinkingIndicator({ text }: ThinkingIndicatorProps) {
  return (
    <Box>
      <Spinner />
      <Text color={colors.textMuted} italic>
        {text ? text.slice(-200) : 'Thinking...'}
      </Text>
    </Box>
  );
}
