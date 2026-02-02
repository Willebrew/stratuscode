/**
 * MCP Tool Bridge
 *
 * Bridges MCP tools to the StratusCode tool registry.
 */

import type { Tool, ToolContext, ToolDefinition, JSONSchema } from '@stratuscode/shared';
import type { MCPClient } from './client';
import type { MCPTool, MCPCallToolResult } from './types';

// ============================================
// Tool Bridge
// ============================================

/**
 * Create a StratusCode tool from an MCP tool
 */
export function bridgeMCPTool(
  mcpClient: MCPClient,
  serverName: string,
  mcpTool: MCPTool
): Tool {
  const toolName = `mcp:${serverName}:${mcpTool.name}`;

  return {
    name: toolName,
    description: `[MCP: ${serverName}] ${mcpTool.description}`,
    parameters: mcpTool.inputSchema as JSONSchema,

    async execute(args: Record<string, unknown>, context: ToolContext): Promise<string> {
      try {
        const result = await mcpClient.callTool(serverName, mcpTool.name, args);
        return formatMCPResult(result);
      } catch (error) {
        return JSON.stringify({
          error: true,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
  };
}

/**
 * Get all MCP tools as StratusCode tools
 */
export function getAllMCPTools(mcpClient: MCPClient): Tool[] {
  const mcpTools = mcpClient.getAllTools();
  return mcpTools.map(tool => bridgeMCPTool(mcpClient, tool.serverName, tool));
}

/**
 * Format MCP call result for StratusCode
 */
function formatMCPResult(result: MCPCallToolResult): string {
  if (result.isError) {
    const errorContent = result.content.find(c => c.type === 'text');
    return JSON.stringify({
      error: true,
      message: errorContent?.text || 'Unknown MCP error',
    });
  }

  // Combine all text content
  const textParts = result.content
    .filter(c => c.type === 'text')
    .map(c => c.text)
    .join('\n');

  if (textParts) {
    return textParts;
  }

  // Return full result if no text content
  return JSON.stringify(result.content);
}

/**
 * Get tool definitions for MCP tools (for system prompt)
 */
export function getMCPToolDefinitions(mcpClient: MCPClient): ToolDefinition[] {
  const mcpTools = mcpClient.getAllTools();
  
  return mcpTools.map(tool => ({
    name: `mcp:${tool.serverName}:${tool.name}`,
    description: `[MCP: ${tool.serverName}] ${tool.description}`,
    parameters: tool.inputSchema as JSONSchema,
  }));
}
