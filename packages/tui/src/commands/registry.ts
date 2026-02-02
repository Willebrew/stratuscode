/**
 * Command Registry
 *
 * Slash commands for the TUI.
 */

export interface Command {
  name: string;
  shortcut?: string;
  description: string;
  category: 'session' | 'mode' | 'tools' | 'settings' | 'help';
  action: string;
  args?: string[];
}

/**
 * All available slash commands
 */
export const commands: Command[] = [
  // Session commands
  {
    name: 'new',
    shortcut: 'n',
    description: 'Start a new session',
    category: 'session',
    action: 'session:new',
  },
  {
    name: 'clear',
    shortcut: 'c',
    description: 'Clear current conversation',
    category: 'session',
    action: 'session:clear',
  },
  {
    name: 'history',
    shortcut: 'h',
    description: 'View session history',
    category: 'session',
    action: 'session:history',
  },
  
  // Mode commands
  {
    name: 'plan',
    shortcut: 'p',
    description: 'Enter plan mode',
    category: 'mode',
    action: 'mode:plan',
  },
  {
    name: 'build',
    shortcut: 'b',
    description: 'Exit plan mode and start building',
    category: 'mode',
    action: 'mode:build',
  },
  {
    name: 'compact',
    description: 'Toggle compact view',
    category: 'mode',
    action: 'mode:compact',
  },
  
  // Tool commands
  {
    name: 'search',
    shortcut: 's',
    description: 'Search codebase semantically',
    category: 'tools',
    action: 'tool:codesearch',
    args: ['query'],
  },
  {
    name: 'reindex',
    description: 'Reindex codebase for search',
    category: 'tools',
    action: 'tool:reindex',
  },
  {
    name: 'todos',
    shortcut: 't',
    description: 'Show todo list',
    category: 'tools',
    action: 'tool:todos',
  },
  {
    name: 'revert',
    shortcut: 'r',
    description: 'Revert files to previous state',
    category: 'tools',
    action: 'tool:revert',
  },
  {
    name: 'lsp',
    description: 'Show LSP server status',
    category: 'tools',
    action: 'tool:lsp',
  },
  
  // Settings commands
  {
    name: 'model',
    shortcut: 'm',
    description: 'Change AI model',
    category: 'settings',
    action: 'settings:model',
  },
  {
    name: 'theme',
    description: 'Change color theme',
    category: 'settings',
    action: 'settings:theme',
  },
  {
    name: 'config',
    description: 'Edit configuration',
    category: 'settings',
    action: 'settings:config',
  },
  
  // Help commands
  {
    name: 'help',
    shortcut: '?',
    description: 'Show help',
    category: 'help',
    action: 'help:show',
  },
  {
    name: 'shortcuts',
    description: 'Show keyboard shortcuts',
    category: 'help',
    action: 'help:shortcuts',
  },
  {
    name: 'about',
    description: 'About StratusCode',
    category: 'help',
    action: 'help:about',
  },
];

/**
 * Get all commands
 */
export function getAllCommands(): Command[] {
  return commands;
}

/**
 * Get commands by category
 */
export function getCommandsByCategory(category: Command['category']): Command[] {
  return commands.filter(c => c.category === category);
}

/**
 * Find command by name or shortcut
 */
export function findCommand(input: string): Command | undefined {
  const normalized = input.toLowerCase().replace(/^\//, '');
  return commands.find(c => 
    c.name === normalized || c.shortcut === normalized
  );
}

/**
 * Search commands by prefix
 */
export function searchCommands(prefix: string): Command[] {
  const normalized = prefix.toLowerCase().replace(/^\//, '');
  if (!normalized) return commands;
  
  return commands.filter(c =>
    c.name.startsWith(normalized) ||
    (c.shortcut && c.shortcut.startsWith(normalized)) ||
    c.description.toLowerCase().includes(normalized)
  );
}

/**
 * Format command for display
 */
export function formatCommand(cmd: Command): string {
  const shortcut = cmd.shortcut ? ` (/${cmd.shortcut})` : '';
  return `/${cmd.name}${shortcut} - ${cmd.description}`;
}

/**
 * Get category label
 */
export function getCategoryLabel(category: Command['category']): string {
  switch (category) {
    case 'session': return 'Session';
    case 'mode': return 'Mode';
    case 'tools': return 'Tools';
    case 'settings': return 'Settings';
    case 'help': return 'Help';
  }
}
