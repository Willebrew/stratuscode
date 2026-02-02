/**
 * Color Palette
 *
 * Clean, modern color scheme for the TUI.
 * No emojis - ASCII-based visual design.
 */

export const colors = {
  // Primary palette
  primary: '#7C3AED',      // Violet
  primaryDim: '#5B21B6',
  secondary: '#06B6D4',    // Cyan
  secondaryDim: '#0891B2',
  
  // Semantic colors
  success: '#10B981',      // Emerald
  successDim: '#059669',
  warning: '#F59E0B',      // Amber
  warningDim: '#D97706',
  error: '#EF4444',        // Red
  errorDim: '#DC2626',
  info: '#3B82F6',         // Blue
  infoDim: '#2563EB',
  
  // Neutral palette
  text: '#F9FAFB',         // Gray 50
  textMuted: '#9CA3AF',    // Gray 400
  textDim: '#6B7280',      // Gray 500
  border: '#374151',       // Gray 700
  borderDim: '#1F2937',    // Gray 800
  background: '#111827',   // Gray 900
  backgroundAlt: '#1F2937', // Gray 800
  
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
