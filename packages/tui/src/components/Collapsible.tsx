/**
 * Collapsible Component
 *
 * A reusable collapsible/accordion component with smooth expand/collapse.
 * Toggle with keyboard (Enter/Space) or mouse click.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { Box, Text, useInput, useStdin, useStdout } from 'ink';
import { colors } from '../theme/colors';

// ============================================
// Types
// ============================================

export interface CollapsibleProps {
  /** Header content or render function */
  header: React.ReactNode | ((isOpen: boolean) => React.ReactNode);
  /** Body content (shown when expanded) */
  children: React.ReactNode;
  /** Initially expanded state */
  defaultOpen?: boolean;
  /** Controlled open state */
  open?: boolean;
  /** Callback when toggled */
  onToggle?: (isOpen: boolean) => void;
  /** Whether this collapsible is focused (for keyboard control) */
  isFocused?: boolean;
  /** Border style */
  borderStyle?: 'single' | 'round' | 'double' | 'none';
  /** Border color */
  borderColor?: string;
  /** Show expand/collapse indicator */
  showIndicator?: boolean;
}

// ============================================
// Component
// ============================================

export function Collapsible({
  header,
  children,
  defaultOpen = false,
  open: controlledOpen,
  onToggle,
  isFocused = false,
  borderStyle = 'single',
  borderColor,
  showIndicator = true,
}: CollapsibleProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  
  // Use controlled or uncontrolled state
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  
  const toggle = useCallback(() => {
    const newState = !isOpen;
    if (controlledOpen === undefined) {
      setInternalOpen(newState);
    }
    onToggle?.(newState);
  }, [isOpen, controlledOpen, onToggle]);
  
  // Handle keyboard input - toggle on Enter or Space ONLY when focused
  useInput((input, key) => {
    if (!isFocused) return;
    if (key.return || input === ' ') {
      toggle();
    }
  });
  
  const resolvedBorderColor = borderColor || (isFocused ? colors.primary : colors.border);
  const indicator = isOpen ? '▼' : '▶';
  
  // Render header
  const headerContent = typeof header === 'function' ? header(isOpen) : header;
  
  return (
    <Box
      flexDirection="column"
      borderStyle={borderStyle === 'none' ? undefined : borderStyle}
      borderColor={resolvedBorderColor}
    >
      {/* Header row */}
      <Box paddingX={1}>
        {showIndicator && (
          <Text color={isFocused ? colors.primary : colors.textDim}>{indicator} </Text>
        )}
        {headerContent}
      </Box>
      
      {/* Body (when expanded) */}
      {isOpen && (
        <Box flexDirection="column" paddingX={1} paddingTop={0}>
          {children}
        </Box>
      )}
    </Box>
  );
}

// ============================================
// Preset Styles
// ============================================

export interface ToolCardProps {
  icon: string;
  title: string;
  subtitle?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  children?: React.ReactNode;
  defaultOpen?: boolean;
  isFocused?: boolean;
  onToggle?: (isOpen: boolean) => void;
}

const STATUS_ICONS = {
  pending: '○',
  running: '◐',
  completed: '✓',
  failed: '✗',
};

const STATUS_COLORS = {
  pending: colors.textMuted,
  running: colors.warning,
  completed: colors.success,
  failed: colors.error,
};

export function ToolCard({
  icon,
  title,
  subtitle,
  status,
  children,
  defaultOpen = false,
  isFocused = false,
  onToggle,
}: ToolCardProps) {
  const statusIcon = STATUS_ICONS[status];
  const statusColor = STATUS_COLORS[status];
  
  const header = (isOpen: boolean) => (
    <Box justifyContent="space-between" width="100%">
      <Box>
        <Text color={statusColor}>{statusIcon} </Text>
        <Text color={colors.secondary}>{icon} </Text>
        <Text color={isFocused ? colors.primary : colors.text} bold>{title}</Text>
        {subtitle && (
          <Text color={colors.textMuted}> {subtitle}</Text>
        )}
      </Box>
      <Box>
        {status === 'running' && (
          <Text color={colors.warning}>Working...</Text>
        )}
      </Box>
    </Box>
  );
  
  return (
    <Collapsible
      header={header}
      defaultOpen={defaultOpen}
      isFocused={isFocused}
      onToggle={onToggle}
      borderColor={isFocused ? colors.primary : (status === 'failed' ? colors.error : colors.border)}
    >
      {children}
    </Collapsible>
  );
}
