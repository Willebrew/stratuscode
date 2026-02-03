/**
 * PlanActions Component
 *
 * Shows action buttons when a plan is complete.
 * Options: Accept & Build, or Keep Planning.
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { colors, getAgentColor } from '../theme/colors';

export interface PlanActionsProps {
  onAcceptAndBuild: () => void;
  onKeepPlanning: () => void;
}

export function PlanActions({ onAcceptAndBuild, onKeepPlanning }: PlanActionsProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  const options = [
    { label: 'Accept & Build', action: onAcceptAndBuild, key: 'b' },
    { label: 'Keep Planning', action: onKeepPlanning, key: 'p' },
  ];

  useInput((input, key) => {
    // Arrow keys to navigate
    if (key.leftArrow || key.upArrow) {
      setSelectedIndex(i => Math.max(0, i - 1));
      return;
    }
    if (key.rightArrow || key.downArrow) {
      setSelectedIndex(i => Math.min(options.length - 1, i + 1));
      return;
    }
    
    // Enter to select
    if (key.return) {
      const selectedOption = options[selectedIndex];
      if (selectedOption) {
        selectedOption.action();
      }
      return;
    }
    
    // Shortcut keys
    if (input === 'b' || input === 'B') {
      onAcceptAndBuild();
      return;
    }
    if (input === 'p' || input === 'P') {
      onKeepPlanning();
      return;
    }
  });

  return (
    <Box flexDirection="column" marginY={1}>
      <Box marginBottom={1}>
        <Text color={colors.agentPlan} bold>Plan complete. What would you like to do?</Text>
      </Box>
      
      <Box gap={2}>
        {options.map((option, index) => {
          const isSelected = index === selectedIndex;
          const bgColor = isSelected ? colors.agentBuild : undefined;
          const textColor = isSelected ? '#000000' : colors.text;
          
          return (
            <Box key={option.key}>
              <Text
                backgroundColor={bgColor}
                color={textColor}
                bold={isSelected}
              >
                {' '}{option.label} [{option.key.toUpperCase()}]{' '}
              </Text>
            </Box>
          );
        })}
      </Box>
      
      <Box marginTop={1}>
        <Text color={colors.textDim}>Use arrow keys or press [B] / [P] to choose</Text>
      </Box>
    </Box>
  );
}
