/**
 * Permission Checker
 *
 * Evaluates tool permissions against agent rules and patterns.
 */

import type { AgentInfo, PermissionAction, PermissionRule } from '@stratuscode/shared';
import { matchPattern } from './rules';

// ============================================
// Types
// ============================================

export type PermissionResult =
  | { action: 'allow' }
  | { action: 'deny'; reason: string }
  | { action: 'ask'; prompt: string };

export interface PermissionContext {
  tool: string;
  args: Record<string, unknown>;
  agent: AgentInfo;
  sessionAllowances?: Map<string, boolean>;
}

// ============================================
// Permission Checker
// ============================================

export class PermissionChecker {
  private sessionAllowances: Map<string, boolean> = new Map();

  /**
   * Check if a tool call is permitted
   */
  check(context: PermissionContext): PermissionResult {
    const { tool, args, agent } = context;

    // Find matching rule
    const rule = this.findMatchingRule(tool, args, agent.permissions);

    if (!rule) {
      // Default to allow if no rule matches
      return { action: 'allow' };
    }

    // Check session allowances first
    const allowanceKey = this.getAllowanceKey(tool, args);
    if (this.sessionAllowances.has(allowanceKey)) {
      return this.sessionAllowances.get(allowanceKey)
        ? { action: 'allow' }
        : { action: 'deny', reason: 'Previously denied in this session' };
    }

    switch (rule.action) {
      case 'allow':
        return { action: 'allow' };

      case 'deny':
        return {
          action: 'deny',
          reason: `Tool "${tool}" is not permitted for agent "${agent.name}"`,
        };

      case 'ask':
        return {
          action: 'ask',
          prompt: this.buildPrompt(tool, args, agent),
        };

      default:
        return { action: 'allow' };
    }
  }

  /**
   * Record a permission decision for the session
   */
  recordDecision(tool: string, args: Record<string, unknown>, allowed: boolean): void {
    const key = this.getAllowanceKey(tool, args);
    this.sessionAllowances.set(key, allowed);
  }

  /**
   * Record an "always allow" decision for the session (tool-level, not args-specific)
   */
  recordAlwaysAllow(tool: string): void {
    this.sessionAllowances.set(`always:${tool}`, true);
  }

  /**
   * Record an "always deny" decision for the session
   */
  recordAlwaysDeny(tool: string): void {
    this.sessionAllowances.set(`always:${tool}`, false);
  }

  /**
   * Clear session allowances
   */
  clearSession(): void {
    this.sessionAllowances.clear();
  }

  /**
   * Find the first matching rule for a tool call
   */
  private findMatchingRule(
    tool: string,
    args: Record<string, unknown>,
    rules: PermissionRule[]
  ): PermissionRule | null {
    // Check for "always" decisions first
    const alwaysKey = `always:${tool}`;
    if (this.sessionAllowances.has(alwaysKey)) {
      const allowed = this.sessionAllowances.get(alwaysKey);
      return {
        permission: tool,
        pattern: '*',
        action: allowed ? 'allow' : 'deny',
      };
    }

    // Find specific rule
    for (const rule of rules) {
      if (this.ruleMatches(rule, tool, args)) {
        return rule;
      }
    }

    return null;
  }

  /**
   * Check if a rule matches the tool call
   */
  private ruleMatches(
    rule: PermissionRule,
    tool: string,
    args: Record<string, unknown>
  ): boolean {
    // Check permission (tool name)
    if (rule.permission !== '*' && rule.permission !== tool) {
      return false;
    }

    // Check pattern (file path, command, etc.)
    if (rule.pattern !== '*') {
      const pathArg = this.getPathArg(tool, args);
      if (pathArg && !matchPattern(rule.pattern, pathArg)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get the path-like argument from tool args
   */
  private getPathArg(tool: string, args: Record<string, unknown>): string | null {
    // Different tools use different arg names for paths
    const pathKeys = ['file_path', 'directory_path', 'path', 'cwd', 'search_path'];
    for (const key of pathKeys) {
      if (typeof args[key] === 'string') {
        return args[key] as string;
      }
    }

    // For bash, check the command
    if (tool === 'bash' && typeof args['command'] === 'string') {
      return args['command'] as string;
    }

    return null;
  }

  /**
   * Build a permission prompt message
   */
  private buildPrompt(tool: string, args: Record<string, unknown>, agent: AgentInfo): string {
    const lines: string[] = [];

    lines.push(`Allow ${tool}?`);

    // Add relevant context based on tool type
    if (tool === 'bash' && args['command']) {
      lines.push(`Command: ${args['command']}`);
      if (args['cwd']) {
        lines.push(`Directory: ${args['cwd']}`);
      }
    } else {
      const path = this.getPathArg(tool, args);
      if (path) {
        lines.push(`Path: ${path}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Generate a unique key for tool call allowances
   */
  private getAllowanceKey(tool: string, args: Record<string, unknown>): string {
    // For bash, include the command in the key
    if (tool === 'bash' && args['command']) {
      return `${tool}:${args['command']}`;
    }

    // For file operations, include the path
    const path = this.getPathArg(tool, args);
    if (path) {
      return `${tool}:${path}`;
    }

    return tool;
  }
}

/**
 * Create a new permission checker
 */
export function createPermissionChecker(): PermissionChecker {
  return new PermissionChecker();
}
