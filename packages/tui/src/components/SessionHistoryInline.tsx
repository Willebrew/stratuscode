/**
 * SessionHistoryInline
 *
 * Inline session history browser rendered inside UnifiedInput.
 */

import React, { useMemo, useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { colors } from '../theme/colors';
import { InlineSheet } from './InlineSheet';

export interface SessionInfo {
  id: string;
  title: string;
  messageCount: number;
  firstMessage?: string;
}

export interface SessionHistoryInlineProps {
  sessions: SessionInfo[];
  onSelect: (sessionId: string) => void;
  onDelete?: (sessionId: string) => void;
  onClose: () => void;
}

const PAGE_SIZE = 10;

export function SessionHistoryInline({ sessions, onSelect, onDelete, onClose }: SessionHistoryInlineProps) {
  const [offset, setOffset] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const total = sessions.length;
  const clampedOffset = Math.max(0, Math.min(offset, Math.max(0, total - PAGE_SIZE)));
  const visible = useMemo(
    () => sessions.slice(clampedOffset, clampedOffset + PAGE_SIZE),
    [sessions, clampedOffset]
  );

  const scroll = (delta: number) => {
    setOffset(o => Math.max(0, Math.min(o + delta, Math.max(0, total - PAGE_SIZE))));
  };

  // Clamp selection when list changes
  useEffect(() => {
    setSelectedIndex(i => Math.min(Math.max(0, total - 1), i));
    setOffset(o => Math.max(0, Math.min(o, Math.max(0, total - PAGE_SIZE))));
  }, [total]);

  useInput((input, key) => {
    if (key.escape) {
      onClose();
      return;
    }

    if (key.upArrow) {
      setSelectedIndex(i => {
        const next = Math.max(0, i - 1);
        if (next < clampedOffset) scroll(-1);
        return next;
      });
      return;
    }
    if (key.downArrow) {
      setSelectedIndex(i => {
        const next = Math.min(total - 1, i + 1);
        if (next >= clampedOffset + PAGE_SIZE) scroll(1);
        return next;
      });
      return;
    }

    const num = parseInt(input, 10);
    if (!Number.isNaN(num) && num >= 1 && num <= Math.min(9, visible.length)) {
      const target = clampedOffset + (num - 1);
      onSelect(sessions[target]!.id);
      return;
    }

    if (input === '+' || key.pageDown) {
      scroll(PAGE_SIZE);
      return;
    }
    if (input === '-' || key.pageUp) {
      scroll(-PAGE_SIZE);
      return;
    }

    if ((input === 'd' || input === 'D') && onDelete) {
      const session = sessions[selectedIndex];
      if (session) onDelete(session.id);
      return;
    }

    if (key.return) {
      const session = sessions[selectedIndex];
      if (session) onSelect(session.id);
    }
  });

  return (
    <InlineSheet
      title="Session History"
      icon="="
      hint={total ? `${selectedIndex + 1}/${total}` : 'No sessions'}
    >
      {visible.length === 0 ? (
        <Text color={colors.textMuted}>No previous sessions</Text>
      ) : visible.map((session, idx) => {
        const globalIndex = clampedOffset + idx;
        const isFocused = globalIndex === selectedIndex;
        const preview = session.firstMessage
          ? `"${session.firstMessage}${session.firstMessage.length >= 50 ? '...' : ''}"`
          : session.title || `Session ${idx + 1}`;
        return (
          <Box key={session.id}>
            <Text color={isFocused ? colors.primary : colors.textDim}>
              {isFocused ? '› ' : '  '}
            </Text>
            <Text color={colors.textDim}>{globalIndex + 1}. </Text>
            <Text color={isFocused ? colors.text : colors.textMuted} bold={isFocused}>
              {preview}
            </Text>
            <Text color={colors.textDim}> ({session.messageCount} msgs)</Text>
          </Box>
        );
      })}

      <Box marginTop={1} justifyContent="space-between">
        <Text color={colors.textDim}>↑↓ move • Enter load • Esc close • {onDelete ? 'D delete • ' : ''}1-9 quick</Text>
        <Text color={colors.textDim}>
          {clampedOffset > 0 ? `↑ ${clampedOffset} above` : ''} {total > clampedOffset + PAGE_SIZE ? `${total - (clampedOffset + PAGE_SIZE)} below ↓` : ''}
        </Text>
      </Box>
    </InlineSheet>
  );
}
