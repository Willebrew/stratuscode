/**
 * Tool Registry
 *
 * Manages tool registration and provides tools in API format for LLM calls.
 */

import type { Tool, ToolDefinition, ToolContext, JSONSchema } from '@stratuscode/shared';
import { ToolError } from '@stratuscode/shared';

// ============================================
// Types
// ============================================

export interface ToolRegistry {
  register(tool: Tool): void;
  get(name: string): Tool | undefined;
  list(): Tool[];
  execute(name: string, args: Record<string, unknown>, context: ToolContext): Promise<unknown>;
  toAPIFormat(): ToolDefinition[];
}

// ============================================
// Tool Registry Implementation
// ============================================

export function createToolRegistry(): ToolRegistry {
  const tools: Map<string, Tool> = new Map();

  return {
    /**
     * Register a tool
     */
    register(tool: Tool): void {
      if (tools.has(tool.name)) {
        console.warn(`[ToolRegistry] Overwriting existing tool: ${tool.name}`);
      }
      tools.set(tool.name, tool);
    },

    /**
     * Get a tool by name
     */
    get(name: string): Tool | undefined {
      return tools.get(name);
    },

    /**
     * List all registered tools
     */
    list(): Tool[] {
      return Array.from(tools.values());
    },

    /**
     * Execute a tool by name
     */
    async execute(
      name: string,
      args: Record<string, unknown>,
      context: ToolContext
    ): Promise<unknown> {
      const tool = tools.get(name);
      if (!tool) {
        throw new ToolError(`Tool not found: ${name}`, name);
      }
      return tool.execute(args, context);
    },

    /**
     * Get tools in API format (for LLM)
     */
    toAPIFormat(): ToolDefinition[] {
      return Array.from(tools.values()).map(tool => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
        timeout: tool.timeout,
        maxResultSize: tool.maxResultSize,
      }));
    },
  };
}

// ============================================
// Tool Definition Helper
// ============================================

/**
 * Define a tool with type safety
 */
export function defineTool<TArgs extends Record<string, unknown>>(config: {
  name: string;
  description: string;
  parameters: JSONSchema;
  timeout?: number;
  maxResultSize?: number;
  execute: (args: TArgs, context: ToolContext) => Promise<unknown>;
}): Tool {
  return {
    name: config.name,
    description: config.description,
    parameters: config.parameters,
    timeout: config.timeout,
    maxResultSize: config.maxResultSize,
    execute: config.execute as Tool['execute'],
  };
}
