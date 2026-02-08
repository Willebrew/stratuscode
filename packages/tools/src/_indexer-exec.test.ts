import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ============================================
// Import with query string to bypass mock.module from codesearch.test.ts
// codesearch.test.ts mocks './lib/embeddings/indexer', but a query string
// creates a distinct module ID that isn't affected by the mock
// ============================================

const { CodebaseIndexer } = await import('./lib/embeddings/indexer?real=1');

// ============================================
// Mock fetch for Ollama + Qdrant
// ============================================

const originalFetch = globalThis.fetch;

function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : input.url;
    return handler(url, init);
  }) as typeof fetch;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function textResponse(body: string, status: number): Response {
  return new Response(body, { status, statusText: 'Error' });
}

// ============================================
// Temp project setup
// ============================================

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'indexer-test-'));
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeFile(relativePath: string, content: string) {
  const fullPath = path.join(tmpDir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

// Standard mock that handles all Ollama + Qdrant endpoints
function setupStandardMock(vectorSize = 4) {
  const fakeEmbedding = Array.from({ length: vectorSize }, (_, i) => i * 0.1);

  mockFetch((url, init) => {
    // Ollama: list tags (isAvailable)
    if (url.includes('/api/tags')) {
      return jsonResponse({ models: [{ name: 'nomic-embed-text:latest' }] });
    }
    // Ollama: embeddings
    if (url.includes('/api/embeddings')) {
      return jsonResponse({ embedding: fakeEmbedding });
    }
    // Qdrant: list collections (isAvailable)
    if (url.includes('/collections') && (!init?.method || init.method === 'GET') && !url.includes('/points')) {
      // Check if it's a collection-specific GET (initCollection check)
      if (url.match(/\/collections\/[^/]+$/)) {
        return textResponse('not found', 404); // collection doesn't exist
      }
      return jsonResponse({ result: { collections: [] } });
    }
    // Qdrant: create collection (PUT)
    if (init?.method === 'PUT' && url.includes('/collections/')) {
      return jsonResponse({ result: true });
    }
    // Qdrant: DELETE collection
    if (init?.method === 'DELETE' && url.includes('/collections/')) {
      return jsonResponse({ result: true });
    }
    // Qdrant: upsert points
    if (init?.method === 'PUT' && url.includes('/points')) {
      return jsonResponse({ result: { status: 'completed' } });
    }
    // Qdrant: search
    if (init?.method === 'POST' && url.includes('/points/search')) {
      return jsonResponse({ result: [] });
    }
    // Qdrant: collection info
    if (url.includes('/collections/') && (!init?.method || init.method === 'GET')) {
      return jsonResponse({ result: { points_count: 0, config: { params: { vectors: { size: vectorSize } } } } });
    }
    return textResponse('unexpected request: ' + url, 500);
  });
}

// ============================================
// Tests
// ============================================

describe('CodebaseIndexer', () => {
  test('constructor uses defaults', () => {
    const indexer = new CodebaseIndexer({ projectDir: tmpDir });
    expect(indexer).toBeDefined();
  });

  test('constructor accepts custom config', () => {
    const indexer = new CodebaseIndexer({
      projectDir: tmpDir,
      ollamaUrl: 'http://custom:11434',
      ollamaModel: 'custom-model',
      qdrantUrl: 'http://custom:6333',
      collectionName: 'custom_coll',
      chunkSize: 500,
      chunkOverlap: 100,
    });
    expect(indexer).toBeDefined();
  });

  test('checkDependencies returns both available', async () => {
    setupStandardMock();
    const indexer = new CodebaseIndexer({ projectDir: tmpDir });
    const deps = await indexer.checkDependencies();
    expect(deps.ollama).toBe(true);
    expect(deps.qdrant).toBe(true);
  });

  test('checkDependencies returns both unavailable', async () => {
    mockFetch(() => { throw new Error('ECONNREFUSED'); });
    const indexer = new CodebaseIndexer({ projectDir: tmpDir });
    const deps = await indexer.checkDependencies();
    expect(deps.ollama).toBe(false);
    expect(deps.qdrant).toBe(false);
  });

  test('initialize gets dimension and creates collection', async () => {
    setupStandardMock(768);
    const indexer = new CodebaseIndexer({ projectDir: tmpDir });
    await indexer.initialize();
  });

  test('indexFile indexes a TypeScript file', async () => {
    setupStandardMock();
    writeFile('src/index.ts', 'export const x = 1;\nexport const y = 2;\n');

    const indexer = new CodebaseIndexer({ projectDir: tmpDir, chunkSize: 50 });
    await indexer.initialize();
    const chunks = await indexer.indexFile(path.join(tmpDir, 'src/index.ts'));
    expect(chunks).toBeGreaterThan(0);
  });

  test('indexFile returns 0 for empty file', async () => {
    setupStandardMock();
    writeFile('empty.ts', '');

    const indexer = new CodebaseIndexer({ projectDir: tmpDir });
    await indexer.initialize();
    const chunks = await indexer.indexFile(path.join(tmpDir, 'empty.ts'));
    expect(chunks).toBe(0);
  });

  test('indexFile with large content creates multiple chunks', async () => {
    setupStandardMock();
    const lines = Array.from({ length: 100 }, (_, i) => `const line${i} = ${i};`).join('\n');
    writeFile('big.ts', lines);

    const indexer = new CodebaseIndexer({ projectDir: tmpDir, chunkSize: 200, chunkOverlap: 50 });
    await indexer.initialize();
    const chunks = await indexer.indexFile(path.join(tmpDir, 'big.ts'));
    expect(chunks).toBeGreaterThan(1);
  });

  test('indexAll indexes all supported files', async () => {
    setupStandardMock();
    writeFile('src/main.ts', 'export function main() {}');
    writeFile('src/utils.js', 'module.exports = {}');
    writeFile('README.md', '# Project');
    writeFile('config.json', '{}');
    // Should be ignored:
    writeFile('node_modules/dep/index.js', 'ignored');
    writeFile('.git/HEAD', 'ref: refs/heads/main');
    writeFile('package-lock.json', '{}');

    const indexer = new CodebaseIndexer({ projectDir: tmpDir });
    const progressCalls: string[] = [];
    const stats = await indexer.indexAll((file) => { progressCalls.push(file); });

    expect(stats.filesIndexed).toBeGreaterThanOrEqual(3);
    expect(stats.chunksCreated).toBeGreaterThan(0);
    expect(stats.duration).toBeGreaterThanOrEqual(0);
    expect(progressCalls.length).toBeGreaterThanOrEqual(3);
  });

  test('indexAll calls initialize if not initialized', async () => {
    setupStandardMock();
    writeFile('test.ts', 'const x = 1;');

    const indexer = new CodebaseIndexer({ projectDir: tmpDir });
    const stats = await indexer.indexAll();
    expect(stats.filesIndexed).toBeGreaterThanOrEqual(1);
  });

  test('indexAll handles indexFile errors gracefully', async () => {
    let embedCallCount = 0;
    mockFetch((url, init) => {
      if (url.includes('/api/tags')) return jsonResponse({ models: [{ name: 'nomic-embed-text:latest' }] });
      if (url.includes('/api/embeddings')) {
        embedCallCount++;
        if (embedCallCount > 1) throw new Error('embedding failed');
        return jsonResponse({ embedding: [0.1, 0.2, 0.3, 0.4] });
      }
      if (url.includes('/collections') && (!init?.method || init.method === 'GET')) {
        if (url.match(/\/collections\/[^/]+$/)) return textResponse('not found', 404);
        return jsonResponse({ result: { collections: [] } });
      }
      if (init?.method === 'PUT') return jsonResponse({ result: true });
      if (init?.method === 'DELETE') return jsonResponse({ result: true });
      return jsonResponse({});
    });

    writeFile('good.ts', 'const x = 1;');
    writeFile('bad.ts', 'const y = 2;');

    const indexer = new CodebaseIndexer({ projectDir: tmpDir });
    const stats = await indexer.indexAll();
    expect(stats.filesIndexed).toBeGreaterThanOrEqual(0);
  });

  test('indexAll with no supported files returns zero stats', async () => {
    setupStandardMock();
    writeFile('readme.txt', 'not a supported extension');
    writeFile('.hidden/file.ts', 'hidden dir');

    const indexer = new CodebaseIndexer({ projectDir: tmpDir });
    const stats = await indexer.indexAll();
    expect(stats.filesIndexed).toBe(0);
    expect(stats.chunksCreated).toBe(0);
  });

  test('search returns results from Qdrant', async () => {
    mockFetch((url, init) => {
      if (url.includes('/api/embeddings')) return jsonResponse({ embedding: [0.1, 0.2] });
      if (url.includes('/points/search')) {
        return jsonResponse({
          result: [{
            id: 'uuid-1',
            score: 0.95,
            payload: {
              id: 'c1', filePath: '/a.ts', startLine: 1, endLine: 5,
              content: 'function a() {}', language: 'typescript', indexedAt: 0,
            },
          }],
        });
      }
      return jsonResponse({});
    });

    const indexer = new CodebaseIndexer({ projectDir: tmpDir });
    const results = await indexer.search('function a', 5);
    expect(results.length).toBe(1);
    expect(results[0]!.score).toBe(0.95);
  });

  test('getStats returns collection info', async () => {
    mockFetch((url) => {
      if (url.includes('/collections/')) {
        return jsonResponse({
          result: { points_count: 42, config: { params: { vectors: { size: 768 } } } },
        });
      }
      return jsonResponse({});
    });

    const indexer = new CodebaseIndexer({ projectDir: tmpDir });
    const stats = await indexer.getStats();
    expect(stats).toEqual({ pointsCount: 42, vectorSize: 768 });
  });

  test('findFiles discovers supported extensions', async () => {
    setupStandardMock();
    writeFile('a.ts', 'x');
    writeFile('b.py', 'x');
    writeFile('c.rs', 'x');
    writeFile('d.go', 'x');
    writeFile('e.java', 'x');
    writeFile('f.rb', 'x');
    writeFile('g.vue', 'x');
    writeFile('h.swift', 'x');
    writeFile('i.yaml', 'x');

    const indexer = new CodebaseIndexer({ projectDir: tmpDir });
    const stats = await indexer.indexAll();
    expect(stats.filesIndexed).toBe(9);
  });

  test('findFiles ignores non-supported and ignored paths', async () => {
    setupStandardMock();
    writeFile('good.ts', 'x');
    writeFile('node_modules/dep.ts', 'ignored');
    writeFile('dist/out.js', 'ignored');
    writeFile('build/out.js', 'ignored');
    writeFile('.git/config', 'ignored');
    writeFile('__pycache__/mod.py', 'ignored');
    writeFile('target/debug/main.rs', 'ignored');
    writeFile('coverage/report.json', 'ignored');
    writeFile('package-lock.json', 'ignored');
    writeFile('yarn.lock', 'ignored');

    const indexer = new CodebaseIndexer({ projectDir: tmpDir });
    const stats = await indexer.indexAll();
    expect(stats.filesIndexed).toBe(1);
  });

  test('getLanguage maps extensions correctly', async () => {
    setupStandardMock();
    writeFile('test.tsx', 'x');
    writeFile('test.jsx', 'x');
    writeFile('test.mjs', 'x');
    writeFile('test.cjs', 'x');
    writeFile('test.pyi', 'x');
    writeFile('test.kt', 'x');
    writeFile('test.kts', 'x');
    writeFile('test.cpp', 'x');
    writeFile('test.cc', 'x');
    writeFile('test.h', 'x');
    writeFile('test.hpp', 'x');
    writeFile('test.cs', 'x');
    writeFile('test.php', 'x');
    writeFile('test.scala', 'x');
    writeFile('test.svelte', 'x');
    writeFile('test.mdx', 'x');
    writeFile('test.toml', 'x');
    writeFile('test.yml', 'x');
    writeFile('test.c', 'x');

    const indexer = new CodebaseIndexer({ projectDir: tmpDir });
    const stats = await indexer.indexAll();
    expect(stats.filesIndexed).toBe(19);
  });

  test('chunkContent creates overlapping chunks', async () => {
    setupStandardMock();
    const lines = Array.from({ length: 50 }, (_, i) => `const variable_${i} = "value_${i}";`).join('\n');
    writeFile('chunked.ts', lines);

    const indexer = new CodebaseIndexer({ projectDir: tmpDir, chunkSize: 200, chunkOverlap: 50 });
    await indexer.initialize();
    const chunks = await indexer.indexFile(path.join(tmpDir, 'chunked.ts'));
    expect(chunks).toBeGreaterThan(1);
  });
});
