/**
 * Doom Loop Detection
 *
 * Detects when the agent is stuck in a loop making identical tool calls.
 */

// ============================================
// Types
// ============================================

interface ToolCallRecord {
  tool: string;
  argsHash: string;
  timestamp: number;
}

// ============================================
// Doom Loop Detector
// ============================================

export class DoomLoopDetector {
  private history: ToolCallRecord[] = [];
  private readonly threshold: number;
  private readonly maxHistory: number;

  constructor(threshold: number = 3, maxHistory: number = 10) {
    this.threshold = threshold;
    this.maxHistory = maxHistory;
  }

  /**
   * Record a tool call
   */
  record(tool: string, args: Record<string, unknown>): void {
    const record: ToolCallRecord = {
      tool,
      argsHash: this.hashArgs(args),
      timestamp: Date.now(),
    };

    this.history.push(record);

    // Keep history bounded
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
  }

  /**
   * Check if we're in a doom loop
   */
  isInLoop(): boolean {
    if (this.history.length < this.threshold) {
      return false;
    }

    // Check if the last N calls are identical
    const recentCalls = this.history.slice(-this.threshold);
    const firstCall = recentCalls[0];
    
    if (!firstCall) return false;

    return recentCalls.every(
      call => call.tool === firstCall.tool && call.argsHash === firstCall.argsHash
    );
  }

  /**
   * Get the repeated tool call if in a loop
   */
  getRepeatedCall(): { tool: string; count: number } | null {
    if (!this.isInLoop()) {
      return null;
    }

    const lastCall = this.history[this.history.length - 1];
    if (!lastCall) return null;

    // Count how many identical calls
    let count = 0;
    for (let i = this.history.length - 1; i >= 0; i--) {
      const call = this.history[i];
      if (call?.tool === lastCall.tool && call?.argsHash === lastCall.argsHash) {
        count++;
      } else {
        break;
      }
    }

    return { tool: lastCall.tool, count };
  }

  /**
   * Clear the history
   */
  clear(): void {
    this.history = [];
  }

  /**
   * Get current history length
   */
  getHistoryLength(): number {
    return this.history.length;
  }

  /**
   * Hash arguments for comparison
   */
  private hashArgs(args: Record<string, unknown>): string {
    // Sort keys for consistent ordering
    const sortedKeys = Object.keys(args).sort();
    const normalized = sortedKeys.map(key => `${key}:${JSON.stringify(args[key])}`);
    return normalized.join('|');
  }
}

/**
 * Create a new doom loop detector
 */
export function createDoomLoopDetector(threshold?: number): DoomLoopDetector {
  return new DoomLoopDetector(threshold);
}
