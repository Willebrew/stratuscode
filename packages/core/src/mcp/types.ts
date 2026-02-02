/**
 * MCP Types
 *
 * Type definitions for Model Context Protocol integration.
 */

// ============================================
// Configuration Types
// ============================================

export interface MCPLocalConfig {
  type: 'local';
  command: string[];
  environment?: Record<string, string>;
  enabled?: boolean;
  timeout?: number;
}

export interface MCPRemoteConfig {
  type: 'remote';
  url: string;
  headers?: Record<string, string>;
  enabled?: boolean;
  timeout?: number;
}

export type MCPServerConfig = MCPLocalConfig | MCPRemoteConfig;

// ============================================
// Server State
// ============================================

export type MCPServerStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface MCPServer {
  name: string;
  config: MCPServerConfig;
  status: MCPServerStatus;
  error?: string;
  tools: MCPTool[];
  resources: MCPResource[];
}

// ============================================
// MCP Protocol Types
// ============================================

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

// ============================================
// JSON-RPC Types
// ============================================

export interface JSONRPCRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: unknown;
}

export interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface JSONRPCNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

// ============================================
// MCP Messages
// ============================================

export interface MCPInitializeParams {
  protocolVersion: string;
  capabilities: {
    roots?: { listChanged?: boolean };
    sampling?: Record<string, unknown>;
  };
  clientInfo: {
    name: string;
    version: string;
  };
}

export interface MCPInitializeResult {
  protocolVersion: string;
  capabilities: {
    tools?: { listChanged?: boolean };
    resources?: { subscribe?: boolean; listChanged?: boolean };
    prompts?: { listChanged?: boolean };
  };
  serverInfo: {
    name: string;
    version: string;
  };
}

export interface MCPListToolsResult {
  tools: MCPTool[];
}

export interface MCPCallToolParams {
  name: string;
  arguments?: Record<string, unknown>;
}

export interface MCPCallToolResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

export interface MCPListResourcesResult {
  resources: MCPResource[];
}

export interface MCPReadResourceParams {
  uri: string;
}

export interface MCPReadResourceResult {
  contents: Array<{
    uri: string;
    mimeType?: string;
    text?: string;
    blob?: string;
  }>;
}
