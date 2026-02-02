/**
 * MCP HTTP Transport
 *
 * Remote HTTP/SSE transport for MCP servers.
 */

import type {
  JSONRPCRequest,
  JSONRPCResponse,
  MCPRemoteConfig,
} from './types';

// ============================================
// Types
// ============================================

export interface HttpTransport {
  send(request: JSONRPCRequest): Promise<JSONRPCResponse>;
  close(): void;
  isConnected(): boolean;
}

// ============================================
// Implementation
// ============================================

export function createHttpTransport(config: MCPRemoteConfig): HttpTransport {
  let connected = false;
  let requestId = 0;

  // Resolve environment variables in headers
  const headers = resolveHeaders(config.headers || {});

  return {
    async send(request: JSONRPCRequest): Promise<JSONRPCResponse> {
      const req = {
        ...request,
        id: request.id ?? ++requestId,
      };

      const controller = new AbortController();
      const timeout = setTimeout(() => {
        controller.abort();
      }, config.timeout ?? 30000);

      try {
        const response = await fetch(config.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...headers,
          },
          body: JSON.stringify(req),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
          throw new Error(`MCP HTTP error: ${response.status} ${response.statusText}`);
        }

        connected = true;
        return await response.json() as JSONRPCResponse;
      } catch (error) {
        connected = false;
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error(`MCP request timed out: ${request.method}`);
        }
        throw error;
      }
    },

    close(): void {
      connected = false;
    },

    isConnected(): boolean {
      return connected;
    },
  };
}

/**
 * Resolve environment variables in header values
 * Supports ${VAR_NAME} syntax
 */
function resolveHeaders(headers: Record<string, string>): Record<string, string> {
  const resolved: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    resolved[key] = value.replace(/\$\{(\w+)\}/g, (_, varName) => {
      return process.env[varName] || '';
    });
  }

  return resolved;
}
