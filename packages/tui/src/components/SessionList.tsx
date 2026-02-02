/**
 * Session List Component
 *
 * Collapsible sidebar showing session history.
 */

import React from 'react';
import { Box, Text, useInput } from 'ink';
import type { Session } from '@stratuscode/shared';

// ============================================
// Types
// ============================================

export interface SessionListProps {
  sessions: Session[];
  currentSessionId: string;
  visible: boolean;
  onSelectSession: (sessionId: string) => void;
  onClose: () => void;
}

// ============================================
// Component
// ============================================

export function SessionList({
  sessions,
  currentSessionId,
  visible,
  onSelectSession,
  onClose,
}: SessionListProps) {
  const [selectedIndex, setSelectedIndex] = React.useState(0);

  // Find current session index
  React.useEffect(() => {
    const index = sessions.findIndex(s => s.id === currentSessionId);
    if (index >= 0) {
      setSelectedIndex(index);
    }
  }, [currentSessionId, sessions]);

  useInput((input, key) => {
    if (!visible) return;

    // Close with Escape or q
    if (input === 'q' || key.escape) {
      onClose();
      return;
    }

    // Navigation
    if (key.upArrow || input === 'k') {
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : sessions.length - 1));
    } else if (key.downArrow || input === 'j') {
      setSelectedIndex(prev => (prev < sessions.length - 1 ? prev + 1 : 0));
    }

    // Select with Enter or number key
    if (key.return) {
      const session = sessions[selectedIndex];
      if (session) {
        onSelectSession(session.id);
        onClose();
      }
    }

    // Quick select with number keys (1-9)
    const num = parseInt(input, 10);
    if (num >= 1 && num <= 9 && num <= sessions.length) {
      const session = sessions[num - 1];
      if (session) {
        onSelectSession(session.id);
        onClose();
      }
    }
  });

  if (!visible) {
    return null;
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="blue"
      width={40}
      paddingX={1}
    >
      <Box marginBottom={1}>
        <Text bold color="blue">📋 Sessions</Text>
        <Text dimColor> (q to close)</Text>
      </Box>

      {sessions.length === 0 ? (
        <Text dimColor>No sessions yet</Text>
      ) : (
        sessions.slice(0, 9).map((session, index) => {
          const isSelected = index === selectedIndex;
          const isCurrent = session.id === currentSessionId;

          return (
            <Box key={session.id}>
              <Text color={isSelected ? 'cyan' : undefined}>
                {isSelected ? '▸ ' : '  '}
                <Text dimColor>{index + 1}.</Text>{' '}
                <Text bold={isCurrent}>
                  {truncateTitle(session.title, 28)}
                </Text>
                {isCurrent && <Text color="green"> ●</Text>}
              </Text>
            </Box>
          );
        })
      )}

      {sessions.length > 9 && (
        <Box marginTop={1}>
          <Text dimColor>+{sessions.length - 9} more...</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>↑↓/jk: navigate • Enter: select • 1-9: quick select</Text>
      </Box>
    </Box>
  );
}

/**
 * Truncate a title to fit the sidebar
 */
function truncateTitle(title: string, maxLength: number): string {
  if (title.length <= maxLength) {
    return title;
  }
  return title.slice(0, maxLength - 3) + '...';
}
