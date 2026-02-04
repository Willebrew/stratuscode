/**
 * QuestionPromptInline
 *
 * Inline question prompt displayed inside UnifiedInput.
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { colors } from '../theme/colors';
import { InlineSheet } from './InlineSheet';

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

export interface QuestionPromptInlineProps {
  question: Question;
  onAnswer: (selectedOptions: string[]) => void;
  onSkip: () => void;
}

export function QuestionPromptInline({ question, onAnswer, onSkip }: QuestionPromptInlineProps) {
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [customInput, setCustomInput] = useState('');
  const [isTypingCustom, setIsTypingCustom] = useState(false);

  const options = question.options;
  const totalOptions = options.length + (question.allowCustom ? 1 : 0);

  useInput((input, key) => {
    if (isTypingCustom) {
      if (key.escape) {
        setIsTypingCustom(false);
        setCustomInput('');
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

    if (key.escape) {
      onSkip();
      return;
    }

    if (key.upArrow) {
      setFocusedIndex(i => Math.max(0, i - 1));
      return;
    }
    if (key.downArrow) {
      setFocusedIndex(i => Math.min(totalOptions - 1, i + 1));
      return;
    }

    const num = parseInt(input, 10);
    if (!Number.isNaN(num) && num >= 1 && num <= options.length) {
      onAnswer([options[num - 1]!.label]);
      return;
    }

    if (input === ' ' && question.allowMultiple) {
      if (focusedIndex < options.length) {
        setSelectedIndices(prev => {
          const next = new Set(prev);
          if (next.has(focusedIndex)) {
            next.delete(focusedIndex);
          } else {
            next.add(focusedIndex);
          }
          return next;
        });
      } else if (question.allowCustom) {
        setIsTypingCustom(true);
      }
      return;
    }

    if (key.return) {
      if (focusedIndex === options.length && question.allowCustom) {
        setIsTypingCustom(true);
        return;
      }
      if (question.allowMultiple && selectedIndices.size > 0) {
        const selected = Array.from(selectedIndices)
          .filter(i => i < options.length)
          .map(i => options[i]!.label);
        onAnswer(selected);
        return;
      }
      if (focusedIndex < options.length) {
        onAnswer([options[focusedIndex]!.label]);
      }
      return;
    }
  });

  const isCustomFocused = question.allowCustom && focusedIndex === options.length;

  return (
    <InlineSheet
      title={question.header || 'Question'}
      icon="?"
      hint="↑↓ move • Enter select • Esc skip"
    >
      <Box marginBottom={1}>
        <Text color={colors.text}>{question.question}</Text>
      </Box>

      {options.map((option, index) => {
        const isFocused = index === focusedIndex && !isTypingCustom;
        const isSelected = selectedIndices.has(index);
        const number = index + 1;

        return (
          <Box key={index}>
            <Text color={colors.textDim}>{number}. </Text>
            <Text color={isFocused ? colors.primary : isSelected ? colors.success : colors.text}>
              {isFocused ? '› ' : '  '}
              {isSelected ? '[x] ' : '[ ] '}
              {option.label}
            </Text>
            {option.description && (
              <Text color={colors.textDim}> - {option.description}</Text>
            )}
          </Box>
        );
      })}

      {question.allowCustom && (
        <Box
          borderStyle="round"
          borderColor={isCustomFocused || isTypingCustom ? colors.primary : colors.border}
          marginTop={1}
          paddingX={1}
        >
          <Text color={colors.secondary}>{'> '}</Text>
          {isTypingCustom ? (
            <>
              <Text color={colors.text}>{customInput}</Text>
              <Text color={colors.primary}>▎</Text>
            </>
          ) : isCustomFocused ? (
            <Text color={colors.textMuted}>Type custom answer... (Enter)</Text>
          ) : (
            <Text color={colors.textDim}>Or type your own answer...</Text>
          )}
        </Box>
      )}

      <Box marginTop={1}>
        <Text color={colors.textDim}>
          {question.allowMultiple
            ? 'Space toggle • Enter submit • Esc skip'
            : 'Enter select • Esc skip'}
        </Text>
      </Box>
    </InlineSheet>
  );
}

