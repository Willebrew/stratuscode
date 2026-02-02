/**
 * Question Dialog Component
 *
 * Interactive dialog for answering questions from the question tool.
 * Designed to expand from the input area with a clean, integrated look.
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { colors } from '../theme/colors';

// ============================================
// Types
// ============================================

export interface QuestionOption {
  label: string;
  description?: string;
}

export interface Question {
  id: string;
  question: string;
  header?: string;
  options: QuestionOption[];
  allowMultiple?: boolean;
  allowCustom?: boolean;
}

export interface QuestionDialogProps {
  question: Question;
  onAnswer: (selectedOptions: string[]) => void;
  onSkip: () => void;
}

// ============================================
// Component
// ============================================

export function QuestionDialog({ question, onAnswer, onSkip }: QuestionDialogProps) {
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [customInput, setCustomInput] = useState('');
  const [isTypingCustom, setIsTypingCustom] = useState(false);

  const options = question.options;
  // Custom input is always at the bottom (last option)
  const totalOptions = options.length + 1; // Always include custom input option

  useInput((input, key) => {
    // If typing custom answer, handle text input
    if (isTypingCustom) {
      if (key.escape) {
        setIsTypingCustom(false);
        return;
      }
      if (key.return && customInput.trim()) {
        onAnswer([customInput.trim()]);
        return;
      }
      if (key.backspace || key.delete) {
        setCustomInput(prev => prev.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setCustomInput(prev => prev + input);
      }
      return;
    }

    // Navigation
    if (key.upArrow) {
      setFocusedIndex(i => Math.max(0, i - 1));
      return;
    }
    if (key.downArrow) {
      setFocusedIndex(i => Math.min(totalOptions - 1, i + 1));
      return;
    }

    // Skip with Escape
    if (key.escape) {
      onSkip();
      return;
    }

    // Number keys for quick select (1-9)
    const num = parseInt(input, 10);
    if (num >= 1 && num <= options.length) {
      onAnswer([options[num - 1]!.label]);
      return;
    }

    // Space to toggle selection (multi-select mode)
    if (input === ' ') {
      // If on custom input option, start typing
      if (focusedIndex === options.length) {
        setIsTypingCustom(true);
        return;
      }

      if (question.allowMultiple) {
        setSelectedIndices(prev => {
          const next = new Set(prev);
          if (next.has(focusedIndex)) {
            next.delete(focusedIndex);
          } else {
            next.add(focusedIndex);
          }
          return next;
        });
      } else {
        setSelectedIndices(new Set([focusedIndex]));
      }
      return;
    }

    // Enter to submit
    if (key.return) {
      // If on custom input, start typing mode
      if (focusedIndex === options.length) {
        setIsTypingCustom(true);
        return;
      }

      if (selectedIndices.size > 0) {
        const selected = Array.from(selectedIndices)
          .filter(i => i < options.length)
          .map(i => options[i]!.label);
        onAnswer(selected);
      } else if (focusedIndex < options.length) {
        onAnswer([options[focusedIndex]!.label]);
      }
      return;
    }
  });

  const isCustomFocused = focusedIndex === options.length;

  return (
    <Box flexDirection="column">
      {/* Question header */}
      <Box paddingX={1} marginBottom={1}>
        <Text color={colors.warning} bold>? </Text>
        {question.header && (
          <Text color={colors.textMuted}>{question.header}: </Text>
        )}
        <Text color={colors.text} bold>{question.question}</Text>
      </Box>

      {/* Options list */}
      <Box flexDirection="column" paddingX={1}>
        {options.map((option, index) => {
          const isFocused = index === focusedIndex && !isTypingCustom;
          const isSelected = selectedIndices.has(index);
          const number = index + 1;
          
          return (
            <Box key={index}>
              <Text color={colors.textDim}>{number}. </Text>
              <Text color={isFocused ? colors.primary : isSelected ? colors.success : colors.text}>
                {isFocused ? '> ' : '  '}
                {isSelected ? '[x] ' : '[ ] '}
                {option.label}
              </Text>
              {option.description && (
                <Text color={colors.textDim}> - {option.description}</Text>
              )}
            </Box>
          );
        })}
      </Box>

      {/* Custom input - integrated at bottom like an expanded input box */}
      <Box 
        borderStyle="round" 
        borderColor={isCustomFocused || isTypingCustom ? colors.primary : colors.border}
        marginTop={1}
        paddingX={1}
      >
        <Text color={colors.success}>{'> '}</Text>
        {isTypingCustom ? (
          <>
            <Text color={colors.text}>{customInput}</Text>
            <Text color={colors.primary}>|</Text>
          </>
        ) : isCustomFocused ? (
          <Text color={colors.textMuted}>Type custom answer... (Enter to start typing)</Text>
        ) : (
          <Text color={colors.textDim}>Or type your own answer...</Text>
        )}
      </Box>

      {/* Keyboard hints */}
      <Box paddingX={1} marginTop={1}>
        <Text color={colors.textDim}>
          {isTypingCustom 
            ? 'Enter submit | Esc cancel'
            : question.allowMultiple
              ? '1-9 quick select | Space toggle | Enter submit | Esc skip'
              : '1-9 quick select | Enter select | Esc skip'
          }
        </Text>
      </Box>
    </Box>
  );
}
