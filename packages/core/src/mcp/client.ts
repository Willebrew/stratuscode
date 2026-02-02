/**
 * MCP Client
 *
 * Manages connections to MCP servers and provides a unified interface.
 */

import type {
  MCPServerConfig,
  MCPServer,
  MCPServerStatus,
  MCPTool,
  MCPResource,
  JSONRPCRequest,
  JSONRPCResponse,
  MCPInitializeResult,
  MCPListToolsResult,
  MCPCallToolParams,
  MCPCallToolResult,
  MCPListResourcesResult,
  MCPReadResourceParams,
  MCPReadResourceResult,
} from './types';
import { createStdioTransport, type StdioTransport } from './transport-stdio';
import { createHttpTransport, type HttpTransport } from './transport-http';

// ============================================
// Types
// ============================================

type Transport = StdioTransport | HttpTransport;

interface ServerConnection {
  server: MCPServer;
  transport: Transport;
}

// ============================================
// MCP Client
// ============================================

export class MCPClient {
  private connections: Map<string, ServerConnection> = new Map();
  private clientInfo = {
    name: 'stratuscode',
    version: '0.1.0',
  };

  /**
   * Add and connect to an MCP server
   */
  async connect(name: string, config: MCPServerConfig): Promise<MCPServer> {
    // Check if already connected
    if (this.connections.has(name)) {
      return this.connections.get(name)!.server;
    }

    // Create transport based on type
    const transport = config.type === 'local'
      ? createStdioTransport(config)
      : createHttpTransport(config);

    // Create server state
    const server: MCPServer = {
      name,
      config,
      status: 'connecting',
      tools: [],
      resources: [],
    };

    this.connections.set(name, { server, transport });

    try {
      // Initialize connection
      const initResult = await this.sendRequest<MCPInitializeResult>(name, {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {
            roots: { listChanged: true },
          },
          clientInfo: this.clientInfo,
        },
      });

      if (initResult.error) {
        throw new Error(initResult.error.message);
      }

      // Send initialized notification
      await this.sendNotification(name, 'notifications/initialized');

      // List tools
      const toolsResult = await this.sendRequest<MCPListToolsResult>(name, {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
      });

      if (toolsResult.result) {
        server.tools = toolsResult.result.tools;
      }

      // List resources
      const resourcesResult = await this.sendRequest<MCPListResourcesResult>(name, {
        jsonrpc: '2.0',
        id: 3,
        method: 'resources/list',
      });

      if (resourcesResult.result) {
        server.resources = resourcesResult.result.resources;
      }

      server.status = 'connected';
      return server;
    } catch (error) {
      server.status = 'error';
      server.error = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  /**
   * Disconnect from an MCP server
   */
  disconnect(name: string): void {
    const connection = this.connections.get(name);
    if (connection) {
      connection.transport.close();
      connection.server.status = 'disconnected';
      this.connections.delete(name);
    }
  }

  /**
   * Disconnect from all servers
   */
  disconnectAll(): void {
    for (const name of this.connections.keys()) {
      this.disconnect(name);
    }
  }

  /**
   * Get a connected server
   */
  getServer(name: string): MCPServer | undefined {
    return this.connections.get(name)?.server;
  }

  /**
   * Get all connected servers
   */
  getServers(): MCPServer[] {
    return Array.from(this.connections.values()).map(c => c.server);
  }

  /**
   * Get all tools from all connected servers
   */
  getAllTools(): Array<MCPTool & { serverName: string }> {
    const tools: Array<MCPTool & { serverName: string }> = [];

    for (const [serverName, connection] of this.connections) {
      if (connection.server.status === 'connected') {
        for (const tool of connection.server.tools) {
          tools.push({ ...tool, serverName });
        }
      }
    }

    return tools;
  }

  /**
   * Call a tool on an MCP server
   */
  async callTool(
    serverName: string,
    toolName: string,
    args?: Record<string, unknown>
  ): Promise<MCPCallToolResult> {
    const result = await this.sendRequest<MCPCallToolResult>(serverName, {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args,
      } as MCPCallToolParams,
    });

    if (result.error) {
      return {
        content: [{ type: 'text', text: `Error: ${result.error.message}` }],
        isError: true,
      };
    }

    return result.result || { content: [], isError: true };
  }

  /**
   * Read a resource from an MCP server
   */
  async readResource(serverName: string, uri: string): Promise<MCPReadResourceResult> {
    const result = await this.sendRequest<MCPReadResourceResult>(serverName, {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'resources/read',
      params: { uri } as MCPReadResourceParams,
    });

    if (result.error) {
      throw new Error(result.error.message);
    }

    return result.result || { contents: [] };
  }

  /**
   * Send a JSON-RPC request
   */
  private async sendRequest<T>(
    serverName: string,
    request: JSONRPCRequest
  ): Promise<JSONRPCResponse & { result?: T }> {
    const connection = this.connections.get(serverName);
    if (!connection) {
      throw new Error(`MCP server not connected: ${serverName}`);
    }

    return connection.transport.send(request) as Promise<JSONRPCResponse & { result?: T }>;
  }

  /**
   * Send a JSON-RPC notification (no response expected)
   */
  private async sendNotification(serverName: string, method: string, params?: unknown): Promise<void> {
    const connection = this.connections.get(serverName);
    if (!connection) {
      throw new Error(`MCP server not connected: ${serverName}`);
    }

    // Notifications don't expect a response, but we send them the same way
    try {
      await connection.transport.send({
        jsonrpc: '2.0',
        id: 0, // Will be ignored for notifications
        method,
        params,
      });
    } catch {
      // Notifications may not return a response
    }
  }
}

/**
 * Create a new MCP client
 */
export function createMCPClient(): MCPClient {
  return new MCPClient();
}
