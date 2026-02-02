/**
 * SAGE Adapter
 *
 * Bridges StratusCode tools to the SAGE framework.
 * Provides defineTool helper and tool registry creation.
 */

import {
  createToolRegistry as createSageRegistry,
  type Tool as SageTool,
  type ToolRegistry as SageToolRegistry,
  type ToolContext as SageToolContext,
} from '@sage/core';
import type { ToolContext as StratusToolContext } from '@stratuscode/shared';

// ============================================
// Re-export SAGE types for convenience
// ============================================

export type { SageToolRegistry as ToolRegistry };

// ============================================
// Tool Definition Helper
// ============================================

/**
 * Define a tool compatible with both StratusCode's context and SAGE's registry.
 *
 * Tools defined with this helper receive a StratusCode ToolContext
 * (with projectDir, sessionId, abort) but are registered with SAGE's
 * tool registry under the hood.
 */
export function defineTool<TArgs extends Record<string, unknown>>(config: {
  name: string;
  description: string;
  parameters: SageTool['parameters'];
  timeout?: number;
  maxResultSize?: number;
  execute: (args: TArgs, context: StratusToolContext) => Promise<unknown>;
}): SageTool {
  return {
    name: config.name,
    description: config.description,
    parameters: config.parameters,
    timeout: config.timeout,
    maxResultSize: config.maxResultSize,
    execute: async (args: Record<string, unknown>, sageContext: SageToolContext) => {
      // Adapt SAGE's ToolContext to StratusCode's ToolContext
      const stratusContext: StratusToolContext = {
        sessionId: sageContext.sessionId,
        projectDir: (sageContext.metadata?.projectDir as string) || process.cwd(),
        abort: sageContext.metadata?.abort as AbortSignal | undefined,
      };
      return config.execute(args as TArgs, stratusContext);
    },
  };
}

// ============================================
// Tool Registry Creation
// ============================================

/**
 * Create a SAGE tool registry pre-loaded with all StratusCode tools.
 */
export function createStratusCodeToolRegistry(): SageToolRegistry {
  return createSageRegistry();
}
