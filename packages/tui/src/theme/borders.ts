/**
 * Border Styles
 *
 * Consistent border styles for the TUI components.
 */

export const borders = {
  // Standard box drawing characters
  single: {
    topLeft: '┌',
    topRight: '┐',
    bottomLeft: '└',
    bottomRight: '┘',
    horizontal: '─',
    vertical: '│',
    teeRight: '├',
    teeLeft: '┤',
    teeDown: '┬',
    teeUp: '┴',
    cross: '┼',
  },

  // Rounded corners
  round: {
    topLeft: '╭',
    topRight: '╮',
    bottomLeft: '╰',
    bottomRight: '╯',
    horizontal: '─',
    vertical: '│',
    teeRight: '├',
    teeLeft: '┤',
    teeDown: '┬',
    teeUp: '┴',
    cross: '┼',
  },

  // Double lines
  double: {
    topLeft: '╔',
    topRight: '╗',
    bottomLeft: '╚',
    bottomRight: '╝',
    horizontal: '═',
    vertical: '║',
    teeRight: '╠',
    teeLeft: '╣',
    teeDown: '╦',
    teeUp: '╩',
    cross: '╬',
  },

  // Heavy/bold
  heavy: {
    topLeft: '┏',
    topRight: '┓',
    bottomLeft: '┗',
    bottomRight: '┛',
    horizontal: '━',
    vertical: '┃',
    teeRight: '┣',
    teeLeft: '┫',
    teeDown: '┳',
    teeUp: '┻',
    cross: '╋',
  },

  // Dotted
  dotted: {
    topLeft: '·',
    topRight: '·',
    bottomLeft: '·',
    bottomRight: '·',
    horizontal: '·',
    vertical: '·',
    teeRight: '·',
    teeLeft: '·',
    teeDown: '·',
    teeUp: '·',
    cross: '·',
  },
} as const;

export type BorderStyle = keyof typeof borders;

/**
 * Create a horizontal divider line
 */
export function divider(width: number, style: BorderStyle = 'single'): string {
  return borders[style].horizontal.repeat(width);
}

/**
 * Create a box around content
 */
export function createBox(
  content: string[],
  style: BorderStyle = 'single',
  padding: number = 1
): string[] {
  const b = borders[style];
  const maxWidth = Math.max(...content.map(line => line.length));
  const innerWidth = maxWidth + padding * 2;

  const lines: string[] = [];

  // Top border
  lines.push(b.topLeft + b.horizontal.repeat(innerWidth) + b.topRight);

  // Content with padding
  for (const line of content) {
    const paddedLine = ' '.repeat(padding) + line.padEnd(maxWidth) + ' '.repeat(padding);
    lines.push(b.vertical + paddedLine + b.vertical);
  }

  // Bottom border
  lines.push(b.bottomLeft + b.horizontal.repeat(innerWidth) + b.bottomRight);

  return lines;
}

/**
 * Shadow characters for depth effect
 */
export const shadows = {
  bottomRight: '░',
  right: '▒',
  bottom: '▓',
} as const;
