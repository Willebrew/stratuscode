/**
 * LSP Manager
 *
 * Manages the lifecycle of language servers across the workspace.
 * Automatically starts servers based on file extensions and caches them per root.
 */

import * as path from 'path';
import { LspClient } from './client';
import { getServerForFile, type LSPServerInfo, type LSPServerHandle } from './servers';

// ============================================
// Types
// ============================================

interface ManagedServer {
  info: LSPServerInfo;
  handle: LSPServerHandle;
  client: LspClient;
  root: string;
  lastUsed: number;
}

// ============================================
// LSP Manager
// ============================================

export class LSPManager {
  private servers = new Map<string, ManagedServer>();
  private projectDir: string;
  private idleTimeoutMs = 5 * 60 * 1000; // 5 minutes

  constructor(projectDir: string) {
    this.projectDir = projectDir;
  }

  /**
   * Get or create an LSP client for a file
   */
  async getClient(filePath: string): Promise<LspClient | null> {
    const serverInfo = getServerForFile(filePath);
    if (!serverInfo) {
      return null;
    }

    // Find the root for this file
    const root = await serverInfo.root(filePath, this.projectDir);
    if (!root) {
      return null;
    }

    // Check for existing server
    const key = `${serverInfo.id}:${root}`;
    const existing = this.servers.get(key);
    if (existing) {
      existing.lastUsed = Date.now();
      return existing.client;
    }

    // Start new server
    const handle = await serverInfo.spawn(root);
    if (!handle) {
      return null;
    }

    // Create client
    const ext = path.extname(filePath).slice(1);
    const client = new LspClient({
      rootUri: root,
      languageId: this.extToLanguageId(ext),
    });

    // Wire up to existing process
    await this.connectClientToProcess(client, handle);

    const managed: ManagedServer = {
      info: serverInfo,
      handle,
      client,
      root,
      lastUsed: Date.now(),
    };

    this.servers.set(key, managed);
    return client;
  }

  /**
   * Connect a client to an existing process
   */
  private async connectClientToProcess(client: LspClient, handle: LSPServerHandle): Promise<void> {
    // The client needs to use the existing process
    // This is a simplified connection - in practice you'd want more robust handling
    (client as any).process = handle.process;
    (client as any).initialized = false;
    
    // Set up message handling
    handle.process.stdout?.on('data', (data: Buffer) => {
      (client as any).handleMessage(data.toString());
    });

    // Initialize
    await (client as any).initialize();
  }

  /**
   * Stop a specific server
   */
  stop(serverId: string, root: string): void {
    const key = `${serverId}:${root}`;
    const server = this.servers.get(key);
    if (server) {
      server.client.stop();
      this.servers.delete(key);
    }
  }

  /**
   * Stop all servers
   */
  stopAll(): void {
    for (const server of this.servers.values()) {
      server.client.stop();
    }
    this.servers.clear();
  }

  /**
   * Stop idle servers
   */
  cleanupIdle(): void {
    const now = Date.now();
    for (const [key, server] of this.servers.entries()) {
      if (now - server.lastUsed > this.idleTimeoutMs) {
        server.client.stop();
        this.servers.delete(key);
      }
    }
  }

  /**
   * Get active server count
   */
  getActiveCount(): number {
    return this.servers.size;
  }

  /**
   * Get list of active servers
   */
  getActiveServers(): Array<{ id: string; root: string; lastUsed: number }> {
    return Array.from(this.servers.entries()).map(([key, server]) => ({
      id: server.info.id,
      root: server.root,
      lastUsed: server.lastUsed,
    }));
  }

  /**
   * Convert file extension to LSP language ID
   */
  private extToLanguageId(ext: string): string {
    const mapping: Record<string, string> = {
      ts: 'typescript',
      tsx: 'typescriptreact',
      js: 'javascript',
      jsx: 'javascriptreact',
      mjs: 'javascript',
      cjs: 'javascript',
      mts: 'typescript',
      cts: 'typescript',
      py: 'python',
      pyi: 'python',
      go: 'go',
      rs: 'rust',
      rb: 'ruby',
      ex: 'elixir',
      exs: 'elixir',
      zig: 'zig',
      cs: 'csharp',
      fs: 'fsharp',
      swift: 'swift',
      c: 'c',
      cpp: 'cpp',
      cc: 'cpp',
      cxx: 'cpp',
      h: 'c',
      hpp: 'cpp',
      vue: 'vue',
      json: 'json',
      jsonc: 'jsonc',
      css: 'css',
    };
    return mapping[ext] || ext;
  }
}

/**
 * Create an LSP manager for a project
 */
export function createLSPManager(projectDir: string): LSPManager {
  return new LSPManager(projectDir);
}
