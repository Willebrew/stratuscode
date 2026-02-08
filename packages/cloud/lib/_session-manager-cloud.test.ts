import { describe, test, expect, beforeEach, mock } from 'bun:test';

// ============================================
// Mock sandbox + cloud-session before importing session-manager
// ============================================

let mockCreateSandbox: () => any;
let mockDestroySandbox: () => any;
const aliasRegistry: string[] = [];

mock.module('./sandbox', () => ({
  createSandbox: (...args: any[]) => mockCreateSandbox(),
  registerSandboxAlias: (id: string) => { aliasRegistry.push(id); },
  destroySandbox: (...args: any[]) => mockDestroySandbox(),
}));

mock.module('./cloud-session', () => ({
  CloudSession: class MockCloudSession {
    sessionId: string;
    options: any;
    constructor(opts: any) {
      this.sessionId = opts.sessionId;
      this.options = opts;
    }
  },
}));

const {
  createCloudSession,
  destroyCloudSession,
  getActiveSession,
  getUserSessionCount,
  removeSession,
} = await import('./session-manager');

// ============================================
// Tests
// ============================================

describe('session-manager: createCloudSession', () => {
  beforeEach(() => {
    const gs = globalThis as any;
    gs.__stratusActiveSessions?.clear();
    gs.__stratusUserSessionCounts?.clear();
    aliasRegistry.length = 0;

    mockCreateSandbox = () => Promise.resolve({
      sandbox: { id: 'sb-123' },
      workDir: '/workspace',
    });
    mockDestroySandbox = () => Promise.resolve();
  });

  test('creates session, tracks it, and returns ActiveSession', async () => {
    const session = await createCloudSession({
      userId: 'user-1',
      owner: 'myowner',
      repo: 'myrepo',
      branch: 'main',
      githubToken: 'gh-token',
      model: 'gpt-4o',
      apiKey: 'sk-test',
      baseUrl: 'https://api.openai.com/v1',
      providerType: 'chat-completions',
    });

    expect(session).toBeDefined();
    expect(session.userId).toBe('user-1');
    expect(session.owner).toBe('myowner');
    expect(session.repo).toBe('myrepo');
    expect(session.branch).toBe('main');
    expect(session.createdAt).toBeGreaterThan(0);
    expect(session.cloudSession).toBeDefined();
    expect(session.sandboxInfo).toBeDefined();

    // Should be retrievable
    const retrieved = getActiveSession(session.cloudSession.sessionId);
    expect(retrieved).toBeDefined();
    expect(retrieved!.userId).toBe('user-1');

    // User session count should increment
    expect(getUserSessionCount('user-1')).toBe(1);

    // Alias should be registered
    expect(aliasRegistry.length).toBe(1);
  });

  test('creates multiple sessions for the same user', async () => {
    await createCloudSession({
      userId: 'user-2',
      owner: 'o',
      repo: 'r',
      branch: 'main',
      githubToken: 'gh',
      model: 'gpt-4o',
      apiKey: 'key',
    });
    await createCloudSession({
      userId: 'user-2',
      owner: 'o',
      repo: 'r2',
      branch: 'dev',
      githubToken: 'gh',
      model: 'gpt-4o',
      apiKey: 'key',
    });

    expect(getUserSessionCount('user-2')).toBe(2);
  });

  test('uses default agent "build" when not specified', async () => {
    const session = await createCloudSession({
      userId: 'user-3',
      owner: 'o',
      repo: 'r',
      branch: 'main',
      githubToken: 'gh',
      model: 'gpt-4o',
      apiKey: 'key',
    });

    // The CloudSession mock stores options
    expect((session.cloudSession as any).options.agent).toBe('build');
  });

  test('passes custom agent to CloudSession', async () => {
    const session = await createCloudSession({
      userId: 'user-4',
      owner: 'o',
      repo: 'r',
      branch: 'main',
      githubToken: 'gh',
      model: 'gpt-4o',
      apiKey: 'key',
      agent: 'plan',
    });

    expect((session.cloudSession as any).options.agent).toBe('plan');
  });

  test('passes provider headers to CloudSession', async () => {
    const session = await createCloudSession({
      userId: 'user-5',
      owner: 'o',
      repo: 'r',
      branch: 'main',
      githubToken: 'gh',
      model: 'gpt-4o',
      apiKey: 'key',
      providerHeaders: { 'X-Custom': 'value' },
    });

    expect((session.cloudSession as any).options.providerHeaders).toEqual({ 'X-Custom': 'value' });
  });
});

describe('session-manager: destroyCloudSession', () => {
  beforeEach(() => {
    const gs = globalThis as any;
    gs.__stratusActiveSessions?.clear();
    gs.__stratusUserSessionCounts?.clear();

    mockCreateSandbox = () => Promise.resolve({
      sandbox: { id: 'sb-del' },
      workDir: '/workspace',
    });
    mockDestroySandbox = () => Promise.resolve();
  });

  test('destroys sandbox and removes session', async () => {
    const session = await createCloudSession({
      userId: 'del-user',
      owner: 'o',
      repo: 'r',
      branch: 'main',
      githubToken: 'gh',
      model: 'gpt-4o',
      apiKey: 'key',
    });

    const sessionId = session.cloudSession.sessionId;
    expect(getActiveSession(sessionId)).toBeDefined();

    await destroyCloudSession(sessionId);
    expect(getActiveSession(sessionId)).toBeUndefined();
    expect(getUserSessionCount('del-user')).toBe(0);
  });
});
