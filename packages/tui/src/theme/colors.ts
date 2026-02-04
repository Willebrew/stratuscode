/**
 * Color Palette
 *
 * Neo-noir color scheme for the TUI.
 * Deep charcoal base with electric cyan/magenta accents.
 */

export const colors = {
  // Primary palette
  primary: '#7C3AED',      // StratusCode purple
  primaryDim: '#5B21B6',
  secondary: '#A855F7',    // Soft violet accent
  secondaryDim: '#9333EA',
  glow: '#C4B5FD',         // Lavender glow for highlights
  
  // Semantic colors
  success: '#34D399',      // Jade
  successDim: '#10B981',
  warning: '#FBBF24',      // Amber
  warningDim: '#D97706',
  error: '#F87171',        // Coral red
  errorDim: '#DC2626',
  info: '#60A5FA',         // Blue
  infoDim: '#2563EB',
  
  // Neutral palette
  text: '#EAF2FF',         // Misty white
  textMuted: '#9FB3D1',    // Slate 300
  textDim: '#6F7A8F',      // Slate 500
  border: '#1B2333',       // Deep navy
  borderDim: '#121824',    // Darker edge
  background: '#0A0E14',   // Charcoal night
  backgroundAlt: '#0F1624', // Slight lift for panels
  
  // Status colors
  pending: '#9CA3AF',
  inProgress: '#F59E0B',
  completed: '#10B981',
  
  // Agent mode colors
  agentBuild: '#10B981',    // Emerald - action/building
  agentPlan: '#F59E0B',     // Amber - planning/thinking
  
  // Code colors
  keyword: '#C084FC',      // Purple 400
  string: '#34D399',       // Emerald 400
  number: '#F472B6',       // Pink 400
  comment: '#6B7280',      // Gray 500
  function: '#60A5FA',     // Blue 400
  variable: '#F9FAFB',     // Gray 50
} as const;

export type ColorName = keyof typeof colors;

/**
 * Get a color by name
 */
export function getColor(name: ColorName): string {
  return colors[name];
}

/**
 * Status to color mapping
 */
export function getStatusColor(status: 'pending' | 'in_progress' | 'completed'): string {
  switch (status) {
    case 'pending':
      return colors.pending;
    case 'in_progress':
      return colors.inProgress;
    case 'completed':
      return colors.completed;
  }
}

/**
 * Priority to color mapping
 */
export function getPriorityColor(priority: 'low' | 'medium' | 'high'): string {
  switch (priority) {
    case 'low':
      return colors.textDim;
    case 'medium':
      return colors.text;
    case 'high':
      return colors.warning;
  }
}

/**
 * Agent mode to color mapping
 */
export function getAgentColor(agent: string): string {
  switch (agent.toLowerCase()) {
    case 'plan':
      return colors.agentPlan;
    case 'build':
    default:
      return colors.agentBuild;
  }
}
