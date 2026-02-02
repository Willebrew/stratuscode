/**
 * ASCII Icons
 *
 * Clean ASCII-based icons for the TUI. No emojis.
 */

export const icons = {
  // Status indicators
  pending: '○',
  inProgress: '◐',
  completed: '●',
  error: '✕',
  warning: '!',
  info: 'i',
  
  // Navigation
  arrowRight: '>',
  arrowLeft: '<',
  arrowUp: '^',
  arrowDown: 'v',
  chevronRight: '›',
  chevronLeft: '‹',
  
  // Actions
  check: '✓',
  cross: '✕',
  plus: '+',
  minus: '-',
  edit: '*',
  delete: 'x',
  
  // UI elements
  bullet: '•',
  dot: '·',
  pipe: '│',
  corner: '└',
  tee: '├',
  horizontal: '─',
  vertical: '│',
  
  // Boxes
  boxTopLeft: '┌',
  boxTopRight: '┐',
  boxBottomLeft: '└',
  boxBottomRight: '┘',
  boxHorizontal: '─',
  boxVertical: '│',
  
  // Progress
  progressEmpty: '░',
  progressFull: '█',
  progressHalf: '▓',
  
  // Misc
  spinner: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
  ellipsis: '...',
  
  // Tool icons
  file: '□',
  folder: '▢',
  search: '◎',
  terminal: '$',
  code: '<>',
  git: '⎇',
  
  // Priority
  priorityHigh: '!!',
  priorityMedium: '!',
  priorityLow: '~',
} as const;

export type IconName = keyof typeof icons;

/**
 * Get an icon by name
 */
export function getIcon(name: IconName): string | string[] {
  return icons[name];
}

/**
 * Get status icon
 */
export function getStatusIcon(status: 'pending' | 'in_progress' | 'completed' | 'error'): string {
  switch (status) {
    case 'pending':
      return icons.pending;
    case 'in_progress':
      return icons.inProgress;
    case 'completed':
      return icons.completed;
    case 'error':
      return icons.error;
  }
}

/**
 * Get priority icon
 */
export function getPriorityIcon(priority: 'low' | 'medium' | 'high'): string {
  switch (priority) {
    case 'low':
      return icons.priorityLow;
    case 'medium':
      return icons.priorityMedium;
    case 'high':
      return icons.priorityHigh;
  }
}

/**
 * Create a simple box around text
 */
export function box(content: string, width?: number): string {
  const lines = content.split('\n');
  const maxWidth = width || Math.max(...lines.map(l => l.length));
  
  const top = icons.boxTopLeft + icons.boxHorizontal.repeat(maxWidth + 2) + icons.boxTopRight;
  const bottom = icons.boxBottomLeft + icons.boxHorizontal.repeat(maxWidth + 2) + icons.boxBottomRight;
  const middle = lines.map(line => 
    icons.boxVertical + ' ' + line.padEnd(maxWidth) + ' ' + icons.boxVertical
  ).join('\n');
  
  return `${top}\n${middle}\n${bottom}`;
}
