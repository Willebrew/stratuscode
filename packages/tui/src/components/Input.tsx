/**
 * Input Component
 *
 * Text input for chat messages with slash command support.
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { CommandMenu } from './CommandMenu';
import { findCommand, type Command } from '../commands/registry';
import { colors } from '../theme/colors';

// ============================================
// Types
// ============================================

export interface InputProps {
  onSubmit: (text: string) => void;
  onCommand?: (command: Command) => void;
  disabled?: boolean;
  placeholder?: string;
}

// ============================================
// Component
// ============================================

export function Input({ onSubmit, onCommand, disabled = false, placeholder }: InputProps) {
  const [value, setValue] = useState('');
  const [showCommandMenu, setShowCommandMenu] = useState(false);

  const isSlashCommand = value.startsWith('/');
  const commandQuery = isSlashCommand ? value.slice(1) : '';

  // Track if command was just executed to prevent double-firing
  const [commandExecuted, setCommandExecuted] = React.useState(false);

  useInput((input, key) => {
    if (disabled) return;
    
    // Skip if command was just executed (prevents double-firing)
    if (commandExecuted) {
      setCommandExecuted(false);
      return;
    }

    // Close command menu on escape
    if (key.escape && showCommandMenu) {
      setShowCommandMenu(false);
      setValue('');
      return;
    }

    if (key.return) {
      // If command menu is shown, let the CommandMenu handle Enter
      // Don't process Enter here to avoid double-execution
      if (showCommandMenu && isSlashCommand) {
        return;
      }
      
      // Just "/" alone - don't send it
      if (value === '/') {
        return;
      }
      
      // Regular message (non-slash-command)
      if (value.trim() && !isSlashCommand) {
        onSubmit(value);
        setValue('');
        setShowCommandMenu(false);
      }
      return;
    }

    if (key.backspace || key.delete) {
      setValue(prev => {
        const newVal = prev.slice(0, -1);
        setShowCommandMenu(newVal.startsWith('/'));
        return newVal;
      });
      return;
    }

    // Regular character input
    if (input && !key.ctrl && !key.meta) {
      setValue(prev => {
        const newVal = prev + input;
        // Show command menu when typing /
        if (newVal === '/' || newVal.startsWith('/')) {
          setShowCommandMenu(true);
        }
        return newVal;
      });
    }
  });

  return (
    <Box flexDirection="column">
      {/* Command menu */}
      {showCommandMenu && isSlashCommand && (
        <CommandMenu
          query={commandQuery}
          onSelect={(cmd) => {
            if (onCommand) onCommand(cmd);
            setValue('');
            setShowCommandMenu(false);
          }}
          onClose={() => {
            setShowCommandMenu(false);
            setValue('');
          }}
        />
      )}
      
      {/* Input line */}
      <Box paddingX={1}>
        <Text color={colors.primary} bold>
          {'> '}
        </Text>
        {value ? (
          <Text color={isSlashCommand ? colors.secondary : colors.text}>{value}</Text>
        ) : (
          <Text color={colors.textDim}>{placeholder || 'Type a message...'}</Text>
        )}
        {!disabled && <Text color={colors.primary}>|</Text>}
      </Box>
    </Box>
  );
}
