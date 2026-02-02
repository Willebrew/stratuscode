/**
 * MCP Stdio Transport
 *
 * Local stdio transport for MCP servers using child processes.
 */

import { spawn, type ChildProcess } from 'child_process';
import type {
  JSONRPCRequest,
  JSONRPCResponse,
  MCPLocalConfig,
} from './types';

// ============================================
// Types
// ============================================

export interface StdioTransport {
  send(request: JSONRPCRequest): Promise<JSONRPCResponse>;
  close(): void;
  isConnected(): boolean;
}

// ============================================
// Implementation
// ============================================

export function createStdioTransport(config: MCPLocalConfig): StdioTransport {
  let process: ChildProcess | null = null;
  let connected = false;
  let requestId = 0;
  const pendingRequests = new Map<string | number, {
    resolve: (value: JSONRPCResponse) => void;
    reject: (error: Error) => void;
  }>();
  let buffer = '';

  function start(): void {
    if (process) return;

    const [command, ...args] = config.command;
    if (!command) {
      throw new Error('MCP command is empty');
    }

    process = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...globalThis.process.env, ...config.environment },
    });

    connected = true;

    // Handle stdout (responses)
    process.stdout?.on('data', (data: Buffer) => {
      buffer += data.toString();
      processBuffer();
    });

    // Handle stderr (logs/errors)
    process.stderr?.on('data', (data: Buffer) => {
      console.error(`[MCP] ${data.toString()}`);
    });

    // Handle process exit
    process.on('exit', (code) => {
      connected = false;
      process = null;
      
      // Reject all pending requests
      for (const [id, { reject }] of pendingRequests) {
        reject(new Error(`MCP process exited with code ${code}`));
        pendingRequests.delete(id);
      }
    });

    // Handle process error
    process.on('error', (error) => {
      connected = false;
      console.error(`[MCP] Process error: ${error.message}`);
    });
  }

  function processBuffer(): void {
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const response = JSON.parse(line) as JSONRPCResponse;
        const pending = pendingRequests.get(response.id);
        
        if (pending) {
          pending.resolve(response);
          pendingRequests.delete(response.id);
        }
      } catch {
        // Ignore parse errors for non-JSON output
      }
    }
  }

  return {
    async send(request: JSONRPCRequest): Promise<JSONRPCResponse> {
      if (!process || !connected) {
        start();
      }

      if (!process?.stdin) {
        throw new Error('MCP process stdin not available');
      }

      // Assign request ID if not provided
      const req = {
        ...request,
        id: request.id ?? ++requestId,
      };

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          pendingRequests.delete(req.id);
          reject(new Error(`MCP request timed out: ${request.method}`));
        }, config.timeout ?? 30000);

        pendingRequests.set(req.id, {
          resolve: (response) => {
            clearTimeout(timeout);
            resolve(response);
          },
          reject: (error) => {
            clearTimeout(timeout);
            reject(error);
          },
        });

        process!.stdin!.write(JSON.stringify(req) + '\n');
      });
    },

    close(): void {
      if (process) {
        process.kill();
        process = null;
        connected = false;
      }
    },

    isConnected(): boolean {
      return connected;
    },
  };
}
