import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ============================================
// Mock LSP manager before importing lsp tool
// ============================================

let mockGetClient: (filePath: string) => any;

mock.module('./lib/lsp/manager', () => ({
  createLSPManager: () => ({
    getClient: (filePath: string) => mockGetClient(filePath),
  }),
  LSPManager: class MockLSPManager {
    getClient(filePath: string) { return mockGetClient(filePath); }
  },
}));

const { lspTool } = await import('./lsp');

// ============================================
// Test helpers
// ============================================

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lsp-test-'));
  fs.writeFileSync(path.join(tmpDir, 'test.ts'), 'export const x = 1;\n');
  // Default: return a full mock client
  mockGetClient = () => Promise.resolve(createMockClient());
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function ctx() {
  return { sessionId: 'test', metadata: { projectDir: tmpDir } } as any;
}

function createMockClient(overrides: Record<string, any> = {}) {
  return {
    didOpen: () => {},
    hover: () => Promise.resolve({ contents: 'string type' }),
    definition: () => Promise.resolve([{ uri: `file://${tmpDir}/test.ts`, range: { start: { line: 0, character: 7 }, end: { line: 0, character: 8 } } }]),
    references: () => Promise.resolve([{ uri: `file://${tmpDir}/test.ts`, range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } } }]),
    getDiagnostics: () => [{ message: 'unused variable', severity: 2 }],
    documentSymbols: () => Promise.resolve([{ name: 'x', kind: 13 }]),
    workspaceSymbols: () => Promise.resolve([{ name: 'x', kind: 13, location: {} }]),
    completion: () => Promise.resolve({ items: [{ label: 'console' }] }),
    prepareRename: () => Promise.resolve({ start: { line: 0, character: 7 }, end: { line: 0, character: 8 } }),
    rename: () => Promise.resolve({ changes: { 'test.ts': [{ range: {}, newText: 'y' }] } }),
    goToImplementation: () => Promise.resolve([]),
    prepareCallHierarchy: () => Promise.resolve([{ name: 'x', kind: 13, uri: `file://${tmpDir}/test.ts`, range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } }, selectionRange: { start: { line: 0, character: 7 }, end: { line: 0, character: 8 } } }]),
    incomingCalls: () => Promise.resolve([{ from: { name: 'main' }, fromRanges: [] }]),
    outgoingCalls: () => Promise.resolve([{ to: { name: 'log' }, fromRanges: [] }]),
    ...overrides,
  };
}

// ============================================
// Manager caching (getManager)
// ============================================

describe('lsp tool: operations', () => {
  test('no LSP server available returns error', async () => {
    mockGetClient = () => Promise.resolve(null);
    const result = await lspTool.execute(
      { operation: 'hover', filePath: 'test.ts', line: 0, character: 0 },
      ctx()
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.error).toContain('No LSP server available');
    expect(parsed.hint).toContain('language server');
  });

  test('hover returns result', async () => {
    const result = await lspTool.execute(
      { operation: 'hover', filePath: 'test.ts', line: 0, character: 7 },
      ctx()
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.operation).toBe('hover');
    expect(parsed.result).toBeDefined();
  });

  test('definition returns locations', async () => {
    const result = await lspTool.execute(
      { operation: 'definition', filePath: 'test.ts', line: 0, character: 7 },
      ctx()
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.operation).toBe('definition');
    expect(parsed.result).toBeArray();
  });

  test('references returns locations', async () => {
    const result = await lspTool.execute(
      { operation: 'references', filePath: 'test.ts', line: 0, character: 7 },
      ctx()
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.operation).toBe('references');
    expect(parsed.result).toBeArray();
  });

  test('diagnostics returns diagnostic list', async () => {
    const result = await lspTool.execute(
      { operation: 'diagnostics', filePath: 'test.ts' },
      ctx()
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.operation).toBe('diagnostics');
    expect(parsed.result).toBeArray();
    expect(parsed.result[0].message).toBe('unused variable');
  });

  test('documentSymbols returns symbols', async () => {
    const result = await lspTool.execute(
      { operation: 'documentSymbols', filePath: 'test.ts' },
      ctx()
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.operation).toBe('documentSymbols');
    expect(parsed.result[0].name).toBe('x');
  });

  test('workspaceSymbols returns results', async () => {
    // workspaceSymbols needs filePath to resolve a client even though operation itself doesn't
    const result = await lspTool.execute(
      { operation: 'workspaceSymbols', query: 'x', filePath: 'test.ts' },
      ctx()
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.operation).toBe('workspaceSymbols');
    expect(parsed.result).toBeArray();
  });

  test('completion returns items', async () => {
    const result = await lspTool.execute(
      { operation: 'completion', filePath: 'test.ts', line: 0, character: 0 },
      ctx()
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.operation).toBe('completion');
    expect(parsed.result.items[0].label).toBe('console');
  });

  test('rename succeeds when prepareRename returns range', async () => {
    const result = await lspTool.execute(
      { operation: 'rename', filePath: 'test.ts', line: 0, character: 7, newName: 'y' },
      ctx()
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.operation).toBe('rename');
    expect(parsed.result).toBeDefined();
    expect(parsed.result.changes).toBeDefined();
  });

  test('rename fails when prepareRename returns null', async () => {
    mockGetClient = () => Promise.resolve(createMockClient({
      prepareRename: () => Promise.resolve(null),
    }));
    const result = await lspTool.execute(
      { operation: 'rename', filePath: 'test.ts', line: 0, character: 7, newName: 'y' },
      ctx()
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.error).toContain('Cannot rename');
  });

  test('goToImplementation returns locations', async () => {
    const result = await lspTool.execute(
      { operation: 'goToImplementation', filePath: 'test.ts', line: 0, character: 7 },
      ctx()
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.operation).toBe('goToImplementation');
    expect(parsed.result).toBeArray();
  });

  test('prepareCallHierarchy returns items', async () => {
    const result = await lspTool.execute(
      { operation: 'prepareCallHierarchy', filePath: 'test.ts', line: 0, character: 7 },
      ctx()
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.operation).toBe('prepareCallHierarchy');
    expect(parsed.result).toBeArray();
  });

  test('incomingCalls returns callers', async () => {
    const result = await lspTool.execute(
      { operation: 'incomingCalls', filePath: 'test.ts', line: 0, character: 7 },
      ctx()
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.operation).toBe('incomingCalls');
    expect(parsed.result).toBeArray();
  });

  test('incomingCalls with no hierarchy items returns empty', async () => {
    mockGetClient = () => Promise.resolve(createMockClient({
      prepareCallHierarchy: () => Promise.resolve([]),
    }));
    const result = await lspTool.execute(
      { operation: 'incomingCalls', filePath: 'test.ts', line: 0, character: 7 },
      ctx()
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.result).toEqual([]);
    expect(parsed.note).toContain('No call hierarchy');
  });

  test('outgoingCalls returns callees', async () => {
    const result = await lspTool.execute(
      { operation: 'outgoingCalls', filePath: 'test.ts', line: 0, character: 7 },
      ctx()
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.operation).toBe('outgoingCalls');
    expect(parsed.result).toBeArray();
  });

  test('outgoingCalls with no hierarchy items returns empty', async () => {
    mockGetClient = () => Promise.resolve(createMockClient({
      prepareCallHierarchy: () => Promise.resolve([]),
    }));
    const result = await lspTool.execute(
      { operation: 'outgoingCalls', filePath: 'test.ts', line: 0, character: 7 },
      ctx()
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.result).toEqual([]);
    expect(parsed.note).toContain('No call hierarchy');
  });

  test('client error returns error response', async () => {
    mockGetClient = () => Promise.resolve(createMockClient({
      hover: () => Promise.reject(new Error('server crashed')),
    }));
    const result = await lspTool.execute(
      { operation: 'hover', filePath: 'test.ts', line: 0, character: 0 },
      ctx()
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.error).toBe('LSP operation failed');
    expect(parsed.message).toBe('server crashed');
  });

  test('workspaceSymbols without filePath falls through to error', async () => {
    // workspaceSymbols is NOT in needsFile, so validation passes
    // but absolutePath is undefined, falling through to the generic error
    const result = await lspTool.execute(
      { operation: 'workspaceSymbols', query: 'test' },
      ctx()
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.error).toContain('File path required');
  });
});
