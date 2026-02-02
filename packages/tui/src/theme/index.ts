/**
 * Theme Module
 *
 * Exports colors, icons, and styling utilities.
 */

export * from './colors';
export * from './icons';
export * from './borders';

/**
 * Common style presets
 */
export const styles = {
  // Borders
  borderLight: '─',
  borderHeavy: '━',
  borderDouble: '═',
  
  // Spacing
  indent: '  ',
  spacer: ' ',
  
  // Separators
  separator: '─'.repeat(40),
  separatorLight: '·'.repeat(40),
} as const;
