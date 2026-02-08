import { describe, test, expect, beforeEach, mock } from 'bun:test';

// ============================================
// Mock servers and client before import
// ============================================

let mockGetServersForFile: (filePath: string) => any[];
let mockClientConnect: () => Promise<void>;
let mockClientIsAlive: () => boolean;
let mockClientStop: () => void;

mock.module('./servers', () => ({
  getServersForFile: (filePath: string) => mockGetServersForFile(filePath),
}));

mock.module('./client', () => ({
  LspClient: class MockLspClient {
    rootUri: string;
    languageId: string;
    constructor(opts: any) {
      this.rootUri = opts.rootUri;
      this.languageId = opts.languageId;
    }
    connect() { return mockClientConnect(); }
    isAlive() { return mockClientIsAlive(); }
    stop() { mockClientStop(); }
  },
}));

// Use query-string cache-busting to bypass mock.module contamination from _lsp-ops.test.ts
const { LSPManager, createLSPManager } = await import('./manager?real=1');

// ============================================
// Helpers
// ============================================

function makeServerInfo(overrides: Record<string, any> = {}) {
  return {
    id: 'test-server',
    root: () => Promise.resolve('/project'),
    spawn: () => Promise.resolve({ process: { kill: () => {} } }),
    ...overrides,
  };
}

beforeEach(() => {
  mockGetServersForFile = () => [];
  mockClientConnect = () => Promise.resolve();
  mockClientIsAlive = () => true;
  mockClientStop = () => {};
});

// ============================================
// Tests
// ============================================

describe('LSPManager', () => {
  test('createLSPManager returns an LSPManager', () => {
    const manager = createLSPManager('/project');
    expect(manager).toBeInstanceOf(LSPManager);
  });

  test('getClient returns null when no servers match', async () => {
    mockGetServersForFile = () => [];
    const manager = new LSPManager('/project');
    const client = await manager.getClient('/project/test.xyz');
    expect(client).toBeNull();
  });

  test('getClient returns null when server root returns null', async () => {
    mockGetServersForFile = () => [makeServerInfo({ root: () => Promise.resolve(null) })];
    const manager = new LSPManager('/project');
    const client = await manager.getClient('/project/test.ts');
    expect(client).toBeNull();
  });

  test('getClient returns client when spawn succeeds', async () => {
    mockGetServersForFile = () => [makeServerInfo()];
    const manager = new LSPManager('/project');
    const client = await manager.getClient('/project/test.ts');
    expect(client).not.toBeNull();
    expect(manager.getActiveCount()).toBe(1);
  });

  test('getClient caches client for same server+root', async () => {
    mockGetServersForFile = () => [makeServerInfo()];
    const manager = new LSPManager('/project');
    const client1 = await manager.getClient('/project/a.ts');
    const client2 = await manager.getClient('/project/b.ts');
    expect(client1).toBe(client2);
  });

  test('getClient spawns new client when existing is dead', async () => {
    let alive = true;
    mockClientIsAlive = () => alive;
    mockGetServersForFile = () => [makeServerInfo()];
    const manager = new LSPManager('/project');

    const client1 = await manager.getClient('/project/test.ts');
    alive = false;
    const client2 = await manager.getClient('/project/test.ts');

    expect(client1).not.toBe(client2);
  });

  test('getClient skips broken servers', async () => {
    mockGetServersForFile = () => [
      makeServerInfo({ id: 'broken', spawn: () => Promise.resolve(null) }),
      makeServerInfo({ id: 'good' }),
    ];
    const manager = new LSPManager('/project');

    // First call: broken fails, good succeeds
    const client1 = await manager.getClient('/project/test.ts');
    expect(client1).not.toBeNull();

    // broken should be marked
    expect(manager.getBrokenServers()).toContain('broken:/project');

    // Second call: broken is skipped, good is returned from cache
    const client2 = await manager.getClient('/project/test.ts');
    expect(client2).not.toBeNull();
  });

  test('getClient marks server broken when spawn returns null', async () => {
    mockGetServersForFile = () => [makeServerInfo({ spawn: () => Promise.resolve(null) })];
    const manager = new LSPManager('/project');
    const client = await manager.getClient('/project/test.ts');
    expect(client).toBeNull();
    expect(manager.getBrokenServers().length).toBe(1);
  });

  test('getClient marks server broken when connect fails', async () => {
    const killCalled: boolean[] = [];
    mockClientConnect = () => Promise.reject(new Error('connect failed'));
    mockGetServersForFile = () => [makeServerInfo({
      spawn: () => Promise.resolve({ process: { kill: () => { killCalled.push(true); } } }),
    })];
    const manager = new LSPManager('/project');
    const client = await manager.getClient('/project/test.ts');
    expect(client).toBeNull();
    expect(killCalled.length).toBe(1);
    expect(manager.getBrokenServers().length).toBe(1);
  });

  test('getClient deduplicates concurrent spawns', async () => {
    let spawnCount = 0;
    mockGetServersForFile = () => [makeServerInfo({
      spawn: () => {
        spawnCount++;
        return Promise.resolve({ process: { kill: () => {} } });
      },
    })];
    const manager = new LSPManager('/project');

    // Concurrent calls
    const [c1, c2] = await Promise.all([
      manager.getClient('/project/a.ts'),
      manager.getClient('/project/b.ts'),
    ]);

    // Both should get the same client, spawn called only once
    expect(c1).toBe(c2);
    expect(spawnCount).toBe(1);
  });

  test('stop removes a specific server', async () => {
    mockGetServersForFile = () => [makeServerInfo()];
    const manager = new LSPManager('/project');
    await manager.getClient('/project/test.ts');
    expect(manager.getActiveCount()).toBe(1);

    manager.stop('test-server', '/project');
    expect(manager.getActiveCount()).toBe(0);
  });

  test('stop is safe for nonexistent server', () => {
    const manager = new LSPManager('/project');
    expect(() => manager.stop('nope', '/nope')).not.toThrow();
  });

  test('stopAll clears all servers', async () => {
    mockGetServersForFile = () => [makeServerInfo()];
    const manager = new LSPManager('/project');
    await manager.getClient('/project/test.ts');
    expect(manager.getActiveCount()).toBe(1);

    manager.stopAll();
    expect(manager.getActiveCount()).toBe(0);
  });

  test('cleanupIdle stops servers idle beyond threshold', async () => {
    mockGetServersForFile = () => [makeServerInfo()];
    const manager = new LSPManager('/project');
    await manager.getClient('/project/test.ts');

    // Manually set lastUsed to long ago
    const servers = (manager as any).servers;
    for (const s of servers.values()) {
      s.lastUsed = Date.now() - 10 * 60 * 1000; // 10 minutes ago
    }

    manager.cleanupIdle();
    expect(manager.getActiveCount()).toBe(0);
  });

  test('cleanupIdle keeps recently used servers', async () => {
    mockGetServersForFile = () => [makeServerInfo()];
    const manager = new LSPManager('/project');
    await manager.getClient('/project/test.ts');

    manager.cleanupIdle();
    expect(manager.getActiveCount()).toBe(1);
  });

  test('getActiveServers returns server info', async () => {
    mockGetServersForFile = () => [makeServerInfo()];
    const manager = new LSPManager('/project');
    await manager.getClient('/project/test.ts');

    const servers = manager.getActiveServers();
    expect(servers.length).toBe(1);
    expect(servers[0]!.id).toBe('test-server');
    expect(servers[0]!.root).toBe('/project');
    expect(servers[0]!.lastUsed).toBeGreaterThan(0);
  });

  test('resetBroken clears specific server', async () => {
    mockGetServersForFile = () => [makeServerInfo({ spawn: () => Promise.resolve(null) })];
    const manager = new LSPManager('/project');
    await manager.getClient('/project/test.ts');
    expect(manager.getBrokenServers().length).toBe(1);

    manager.resetBroken('test-server');
    expect(manager.getBrokenServers().length).toBe(0);
  });

  test('resetBroken clears all when no argument', async () => {
    mockGetServersForFile = () => [
      makeServerInfo({ id: 'a', spawn: () => Promise.resolve(null) }),
    ];
    const manager = new LSPManager('/project');
    await manager.getClient('/project/test.ts');

    mockGetServersForFile = () => [
      makeServerInfo({ id: 'b', spawn: () => Promise.resolve(null) }),
    ];
    await manager.getClient('/project/test.py');

    expect(manager.getBrokenServers().length).toBe(2);
    manager.resetBroken();
    expect(manager.getBrokenServers().length).toBe(0);
  });

  test('extToLanguageId maps common extensions', async () => {
    // Test via getClient with different file extensions
    const extensions = [
      ['ts', 'typescript'], ['tsx', 'typescriptreact'],
      ['js', 'javascript'], ['jsx', 'javascriptreact'],
      ['py', 'python'], ['go', 'go'], ['rs', 'rust'],
      ['vue', 'vue'], ['css', 'css'], ['json', 'json'],
    ];

    for (const [ext, expected] of extensions) {
      let capturedLangId = '';
      mock.module('./client', () => ({
        LspClient: class {
          constructor(opts: any) { capturedLangId = opts.languageId; }
          connect() { return Promise.resolve(); }
          isAlive() { return true; }
          stop() {}
        },
      }));

      mockGetServersForFile = () => [makeServerInfo({ id: `srv-${ext}` })];
      const manager = new LSPManager('/project');
      await manager.getClient(`/project/test.${ext}`);
      expect(capturedLangId).toBe(expected);
    }
  });
});
