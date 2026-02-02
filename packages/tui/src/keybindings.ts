/**
 * Keybindings System
 *
 * Vim-style keybindings for the TUI.
 */

// ============================================
// Types
// ============================================

export type KeyAction =
  | 'scroll_up'
  | 'scroll_down'
  | 'scroll_top'
  | 'scroll_bottom'
  | 'toggle_sessions'
  | 'new_session'
  | 'copy_response'
  | 'search'
  | 'cycle_agent'
  | 'abort'
  | 'submit'
  | 'external_editor';

export interface KeyBinding {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  action: KeyAction;
}

export interface KeybindingConfig {
  leader: string;
  bindings: KeyBinding[];
}

// ============================================
// Default Keybindings
// ============================================

export const DEFAULT_KEYBINDINGS: KeybindingConfig = {
  leader: ' ', // Space as leader key
  bindings: [
    // Navigation
    { key: 'j', action: 'scroll_down' },
    { key: 'k', action: 'scroll_up' },
    { key: 'g', action: 'scroll_top' }, // gg handled separately
    { key: 'G', shift: true, action: 'scroll_bottom' },

    // Sessions (leader + key)
    { key: 'l', action: 'toggle_sessions' }, // <leader>l
    { key: 'n', action: 'new_session' }, // <leader>n

    // Actions
    { key: 'y', action: 'copy_response' },
    { key: '/', action: 'search' },
    { key: 'Tab', action: 'cycle_agent' },

    // Control combinations
    { key: 'c', ctrl: true, action: 'abort' },
    { key: 'e', ctrl: true, action: 'external_editor' },
  ],
};

// ============================================
// Keybinding Manager
// ============================================

export class KeybindingManager {
  private config: KeybindingConfig;
  private leaderActive = false;
  private leaderTimeout: ReturnType<typeof setTimeout> | null = null;
  private pendingKeys: string[] = [];

  constructor(config: KeybindingConfig = DEFAULT_KEYBINDINGS) {
    this.config = config;
  }

  /**
   * Process a key input and return the action if matched
   */
  processKey(
    input: string,
    key: { ctrl?: boolean; meta?: boolean; shift?: boolean; return?: boolean; tab?: boolean }
  ): KeyAction | null {
    // Handle Tab key
    if (key.tab) {
      return 'cycle_agent';
    }

    // Handle Enter
    if (key.return) {
      return 'submit';
    }

    // Check for leader key
    if (input === this.config.leader && !key.ctrl && !key.meta) {
      this.activateLeader();
      return null;
    }

    // If leader is active, check for leader combinations
    if (this.leaderActive) {
      this.deactivateLeader();
      const action = this.findLeaderBinding(input);
      if (action) return action;
    }

    // Check for gg (scroll to top)
    if (input === 'g' && !key.ctrl && !key.meta) {
      if (this.pendingKeys[0] === 'g') {
        this.pendingKeys = [];
        return 'scroll_top';
      }
      this.pendingKeys = ['g'];
      setTimeout(() => {
        this.pendingKeys = [];
      }, 500);
      return null;
    }

    // Clear pending keys for non-g input
    if (input !== 'g') {
      this.pendingKeys = [];
    }

    // Check for direct bindings
    return this.findBinding(input, key);
  }

  /**
   * Activate leader key mode
   */
  private activateLeader(): void {
    this.leaderActive = true;
    if (this.leaderTimeout) {
      clearTimeout(this.leaderTimeout);
    }
    this.leaderTimeout = setTimeout(() => {
      this.deactivateLeader();
    }, 1000); // 1 second timeout for leader
  }

  /**
   * Deactivate leader key mode
   */
  private deactivateLeader(): void {
    this.leaderActive = false;
    if (this.leaderTimeout) {
      clearTimeout(this.leaderTimeout);
      this.leaderTimeout = null;
    }
  }

  /**
   * Find a binding that matches after leader key
   */
  private findLeaderBinding(input: string): KeyAction | null {
    // Leader bindings: l, n
    const leaderBindings: Record<string, KeyAction> = {
      l: 'toggle_sessions',
      n: 'new_session',
      s: 'search',
    };
    return leaderBindings[input] || null;
  }

  /**
   * Find a direct binding
   */
  private findBinding(
    input: string,
    key: { ctrl?: boolean; meta?: boolean; shift?: boolean }
  ): KeyAction | null {
    for (const binding of this.config.bindings) {
      const ctrlMatch = (binding.ctrl || false) === (key.ctrl || false);
      const metaMatch = (binding.meta || false) === (key.meta || false);
      const shiftMatch = (binding.shift || false) === (key.shift || false);

      if (binding.key === input && ctrlMatch && metaMatch && shiftMatch) {
        return binding.action;
      }
    }
    return null;
  }

  /**
   * Check if leader mode is active
   */
  isLeaderActive(): boolean {
    return this.leaderActive;
  }

  /**
   * Get the leader key
   */
  getLeaderKey(): string {
    return this.config.leader;
  }
}

/**
 * Create a new keybinding manager
 */
export function createKeybindingManager(config?: KeybindingConfig): KeybindingManager {
  return new KeybindingManager(config);
}
