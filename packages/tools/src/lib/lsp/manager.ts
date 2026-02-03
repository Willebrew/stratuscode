/**
 * LSP Manager
 *
 * Manages the lifecycle of language servers across the workspace.
 * Automatically starts servers based on file extensions and caches them per root.
 */

import * as path from 'path';
import { LspClient } from './client';
import { getServersForFile, type LSPServerInfo, type LSPServerHandle } from './servers';

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
  private broken = new Set<string>();
  private spawning = new Map<string, Promise<LspClient | null>>();
  private projectDir: string;
  private idleTimeoutMs = 5 * 60 * 1000; // 5 minutes

  constructor(projectDir: string) {
    this.projectDir = projectDir;
  }

  /**
   * Get or create an LSP client for a file
   */
  async getClient(filePath: string): Promise<LspClient | null> {
    const candidates = getServersForFile(filePath);
    if (candidates.length === 0) {
      return null;
    }

    // Try each candidate server in order until one succeeds
    for (const serverInfo of candidates) {
      const root = await serverInfo.root(filePath, this.projectDir);
      if (!root) {
        continue; // This server doesn't apply — try the next candidate
      }

      const key = `${serverInfo.id}:${root}`;

      // Skip known-broken servers
      if (this.broken.has(key)) {
        continue;
      }

      // Check for existing server with health check
      const existing = this.servers.get(key);
      if (existing) {
        if (!existing.client.isAlive()) {
          this.servers.delete(key);
        } else {
          existing.lastUsed = Date.now();
          return existing.client;
        }
      }

      // Deduplicate in-flight spawns
      const inflight = this.spawning.get(key);
      if (inflight) {
        return inflight;
      }

      const promise = this.spawnClient(key, serverInfo, root, filePath);
      this.spawning.set(key, promise);
      try {
        const client = await promise;
        if (client) {
          return client;
        }
        // Spawn failed — continue to next candidate
      } finally {
        this.spawning.delete(key);
      }
    }

    return null;
  }

  /**
   * Spawn a new LSP client for the given server/root
   */
  private async spawnClient(
    key: string,
    serverInfo: LSPServerInfo,
    root: string,
    filePath: string,
  ): Promise<LspClient | null> {
    const handle = await serverInfo.spawn(root);
    if (!handle) {
      this.broken.add(key);
      return null;
    }

    const ext = path.extname(filePath).slice(1);
    const client = new LspClient({
      rootUri: root,
      languageId: this.extToLanguageId(ext),
    });

    try {
      await client.connect(handle.process);
    } catch {
      this.broken.add(key);
      handle.process.kill();
      return null;
    }

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
    return Array.from(this.servers.entries()).map(([_key, server]) => ({
      id: server.info.id,
      root: server.root,
      lastUsed: server.lastUsed,
    }));
  }

  /**
   * Get list of broken server keys
   */
  getBrokenServers(): string[] {
    return Array.from(this.broken);
  }

  /**
   * Clear broken status so servers can be retried (e.g. after manual install)
   */
  resetBroken(serverId?: string): void {
    if (serverId) {
      for (const key of this.broken) {
        if (key.startsWith(`${serverId}:`)) {
          this.broken.delete(key);
        }
      }
    } else {
      this.broken.clear();
    }
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
      astro: 'astro',
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
