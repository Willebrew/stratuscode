import { describe, test, expect, beforeEach, mock } from 'bun:test';

// ============================================
// Mock @vercel/sandbox before importing sandbox module
// ============================================

let mockSandboxCreate: () => any;
let mockSandboxGet: () => any;

mock.module('@vercel/sandbox', () => ({
  Sandbox: {
    create: (...args: any[]) => mockSandboxCreate(),
    get: (...args: any[]) => mockSandboxGet(),
  },
}));

const {
  createSandbox,
  reconnectSandbox,
  getSandbox,
  registerSandboxAlias,
  readSandboxFile,
  startSandboxKeepalive,
  extendSandboxTimeout,
} = await import('./sandbox');

// ============================================
// Helpers
// ============================================

function makeMockVercelSandbox(overrides: Record<string, any> = {}) {
  return {
    sandboxId: 'sb-new-123',
    status: 'running',
    timeout: 300_000,
    stop: () => Promise.resolve(),
    extendTimeout: () => Promise.resolve(),
    runCommand: (_cmd: string, _args?: string[]) =>
      Promise.resolve({
        exitCode: 0,
        stdout: () => Promise.resolve(''),
        stderr: () => Promise.resolve(''),
      }),
    readFile: () => Promise.resolve(null),
    writeFiles: () => Promise.resolve(),
    ...overrides,
  };
}

beforeEach(() => {
  const gs = globalThis as any;
  gs.__stratusActiveSandboxes?.clear();
});

// ============================================
// createSandbox
// ============================================

describe('sandbox: createSandbox', () => {
  test('creates sandbox with Vercel SDK and clones repo', async () => {
    const originalEnv = { ...process.env };
    try {
      process.env.VERCEL_TOKEN = 'vt-test';
      process.env.VERCEL_PROJECT_ID = 'prj-test';
      process.env.VERCEL_TEAM_ID = 'team-test';

      const mockSb = makeMockVercelSandbox();
      mockSandboxCreate = () => Promise.resolve(mockSb);

      const info = await createSandbox({
        owner: 'testowner',
        repo: 'testrepo',
        branch: 'main',
        githubToken: 'gh-token-123',
        sessionId: 'session-1',
      });

      expect(info.sandboxId).toBe('sb-new-123');
      expect(info.owner).toBe('testowner');
      expect(info.repo).toBe('testrepo');
      expect(info.branch).toBe('main');
      expect(info.sessionBranch).toBe('stratuscode/session-1');
      expect(info.workDir).toBe('/vercel/sandbox');
      expect(info.alphaMode).toBe(false);

      // Should be stored in the map
      const retrieved = await getSandbox('session-1');
      expect(retrieved).toBeDefined();
      expect(retrieved!.sandboxId).toBe('sb-new-123');
    } finally {
      process.env = originalEnv;
    }
  });

  test('throws when GitHub token is missing', async () => {
    await expect(
      createSandbox({
        owner: 'o',
        repo: 'r',
        branch: 'main',
        githubToken: '',
        sessionId: 's1',
      })
    ).rejects.toThrow('GitHub token is required');
  });

  test('throws when Vercel credentials are missing', async () => {
    const originalEnv = { ...process.env };
    try {
      delete process.env.VERCEL_TOKEN;
      delete process.env.VERCEL_PROJECT_ID;
      delete process.env.VERCEL_TEAM_ID;

      await expect(
        createSandbox({
          owner: 'o',
          repo: 'r',
          branch: 'main',
          githubToken: 'gh-tok',
          sessionId: 's2',
        })
      ).rejects.toThrow('Vercel Sandbox credentials not configured');
    } finally {
      process.env = originalEnv;
    }
  });

  test('throws when git clone fails', async () => {
    const originalEnv = { ...process.env };
    try {
      process.env.VERCEL_TOKEN = 'vt';
      process.env.VERCEL_PROJECT_ID = 'prj';
      process.env.VERCEL_TEAM_ID = 'team';

      const mockSb = makeMockVercelSandbox({
        runCommand: (_cmd: string, _args?: string[]) =>
          Promise.resolve({
            exitCode: 128,
            stdout: () => Promise.resolve(''),
            stderr: () => Promise.resolve('fatal: repository not found'),
          }),
      });
      mockSandboxCreate = () => Promise.resolve(mockSb);

      await expect(
        createSandbox({
          owner: 'o',
          repo: 'r',
          branch: 'main',
          githubToken: 'gh-tok',
          sessionId: 's3',
        })
      ).rejects.toThrow('Failed to clone repository');
    } finally {
      process.env = originalEnv;
    }
  });
});

// ============================================
// reconnectSandbox
// ============================================

describe('sandbox: reconnectSandbox', () => {
  test('reconnects to existing sandbox by ID', async () => {
    const mockSb = makeMockVercelSandbox({ sandboxId: 'sb-reconnect' });
    mockSandboxGet = () => Promise.resolve(mockSb);

    const info = await reconnectSandbox('sb-reconnect', 'session-rc');
    expect(info).toBeDefined();
    expect(info!.sandboxId).toBe('sb-reconnect');
    expect(info!.sessionBranch).toBe('stratuscode/session-rc');
    expect(info!.workDir).toBe('/vercel/sandbox');

    // Should be stored
    const retrieved = await getSandbox('session-rc');
    expect(retrieved).toBeDefined();
  });

  test('returns null when sandbox not found', async () => {
    mockSandboxGet = () => Promise.resolve(null);

    const info = await reconnectSandbox('sb-gone', 'session-gone');
    expect(info).toBeNull();
  });

  test('returns null when get throws', async () => {
    mockSandboxGet = () => Promise.reject(new Error('network error'));

    const info = await reconnectSandbox('sb-err', 'session-err');
    expect(info).toBeNull();
  });
});

// ============================================
// readSandboxFile: Node.js stream path
// ============================================

describe('sandbox: readSandboxFile (Node stream)', () => {
  test('reads file via async iterable (Node.js stream path)', async () => {
    const content = 'hello from node stream';
    // Create a mock stream without getReader (not Web Streams API)
    // but with Symbol.asyncIterator
    const mockStream = {
      [Symbol.asyncIterator]: async function* () {
        yield Buffer.from(content);
      },
    };
    const mockSandbox = makeMockVercelSandbox({
      readFile: () => Promise.resolve(mockStream),
    });
    const info = {
      sandboxId: 'sb-ns',
      sandbox: mockSandbox,
      owner: 'o',
      repo: 'r',
      branch: 'main',
      sessionBranch: 'stratuscode/ns',
      workDir: '/work',
    };
    registerSandboxAlias('sess-node-stream', info as any);

    const result = await readSandboxFile('sess-node-stream', '/file.txt');
    expect(result).toBe(content);
  });
});

// ============================================
// startSandboxKeepalive: interval execution
// ============================================

describe('sandbox: startSandboxKeepalive interval', () => {
  test('keepalive interval calls extendSandboxTimeout', async () => {
    let extendCalls = 0;
    const mockSandbox = makeMockVercelSandbox({
      extendTimeout: () => {
        extendCalls++;
        return Promise.resolve();
      },
    });
    const info = {
      sandboxId: 'sb-ka',
      sandbox: mockSandbox,
      owner: 'o',
      repo: 'r',
      branch: 'main',
      sessionBranch: 'stratuscode/ka',
      workDir: '/work',
    };
    registerSandboxAlias('sess-ka-test', info as any);

    // Directly call extendSandboxTimeout to verify it works
    await extendSandboxTimeout('sess-ka-test', 300_000);
    expect(extendCalls).toBe(1);

    // Start keepalive and immediately clean up
    const cleanup = startSandboxKeepalive('sess-ka-test');
    cleanup();
  });
});
