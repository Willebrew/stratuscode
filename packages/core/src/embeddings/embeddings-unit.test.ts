/**
 * Embeddings Unit Tests (ollama.ts + qdrant.ts)
 *
 * Mocked fetch-based tests covering coverage gaps:
 *   - OllamaEmbeddings: isAvailable catch, hasModel, getDimension
 *   - QdrantClient: getCollectionInfo catch, deleteByFilePath
 */

import { describe, test, expect, afterEach } from 'bun:test';
import { OllamaEmbeddings, cosineSimilarity } from './ollama';
import { QdrantClient } from './qdrant';

// ============================================
// Helpers
// ============================================

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  globalThis.fetch = handler as typeof fetch;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: { 'Content-Type': 'application/json' },
  });
}

function textResponse(body: string, status: number): Response {
  return new Response(body, {
    status,
    statusText: status === 200 ? 'OK' : 'Error',
  });
}

// ============================================
// OllamaEmbeddings
// ============================================

describe('OllamaEmbeddings', () => {
  // --- Constructor ---

  test('constructor uses defaults (localhost:11434, nomic-embed-text)', () => {
    const ollama = new OllamaEmbeddings();
    // Verify defaults by intercepting embed call and checking URL/body
    let capturedUrl = '';
    let capturedBody = '';
    mockFetch((url, init) => {
      capturedUrl = url as string;
      capturedBody = init?.body as string;
      return jsonResponse({ embedding: [0.1] });
    });

    // Trigger a call to expose defaults
    ollama.embed('hi');
    expect(capturedUrl).toBe('http://localhost:11434/api/embeddings');
    expect(JSON.parse(capturedBody).model).toBe('nomic-embed-text');
  });

  test('constructor accepts custom config', () => {
    const ollama = new OllamaEmbeddings({ baseUrl: 'http://myhost:9999', model: 'custom-model' });
    let capturedUrl = '';
    let capturedBody = '';
    mockFetch((url, init) => {
      capturedUrl = url as string;
      capturedBody = init?.body as string;
      return jsonResponse({ embedding: [0.2] });
    });

    ollama.embed('hi');
    expect(capturedUrl).toBe('http://myhost:9999/api/embeddings');
    expect(JSON.parse(capturedBody).model).toBe('custom-model');
  });

  // --- embed ---

  test('embed() success returns embedding array', async () => {
    const ollama = new OllamaEmbeddings();
    const expected = [0.1, 0.2, 0.3, 0.4];
    mockFetch(() => jsonResponse({ embedding: expected }));

    const result = await ollama.embed('hello');
    expect(result).toEqual(expected);
  });

  test('embed() non-ok response throws', async () => {
    const ollama = new OllamaEmbeddings();
    mockFetch(() => textResponse('model not found', 404));

    await expect(ollama.embed('hello')).rejects.toThrow('Ollama embedding error: 404');
  });

  // --- embedBatch ---

  test('embedBatch() returns array for each text', async () => {
    const ollama = new OllamaEmbeddings();
    let callCount = 0;
    mockFetch(() => {
      callCount++;
      return jsonResponse({ embedding: [callCount * 0.1, callCount * 0.2] });
    });

    const result = await ollama.embedBatch(['a', 'b', 'c']);
    expect(result.length).toBe(3);
    expect(result[0]!.length).toBe(2);
    expect(result[1]!.length).toBe(2);
    expect(result[2]!.length).toBe(2);
  });

  // --- isAvailable ---

  test('isAvailable() returns true on ok response', async () => {
    const ollama = new OllamaEmbeddings();
    mockFetch(() => jsonResponse({ models: [] }));

    expect(await ollama.isAvailable()).toBe(true);
  });

  test('isAvailable() returns false on non-ok response', async () => {
    const ollama = new OllamaEmbeddings();
    mockFetch(() => textResponse('error', 500));

    expect(await ollama.isAvailable()).toBe(false);
  });

  test('isAvailable() returns false on fetch error (catch path)', async () => {
    const ollama = new OllamaEmbeddings();
    mockFetch(() => {
      throw new Error('ECONNREFUSED');
    });

    expect(await ollama.isAvailable()).toBe(false);
  });

  // --- hasModel ---

  test('hasModel() returns true when model found in list', async () => {
    const ollama = new OllamaEmbeddings({ model: 'nomic-embed-text' });
    mockFetch(() =>
      jsonResponse({
        models: [
          { name: 'nomic-embed-text:latest' },
          { name: 'llama3:latest' },
        ],
      })
    );

    expect(await ollama.hasModel()).toBe(true);
  });

  test('hasModel() returns false when model not in list', async () => {
    const ollama = new OllamaEmbeddings({ model: 'nomic-embed-text' });
    mockFetch(() =>
      jsonResponse({
        models: [{ name: 'llama3:latest' }, { name: 'mistral:latest' }],
      })
    );

    expect(await ollama.hasModel()).toBe(false);
  });

  test('hasModel() returns false on fetch error', async () => {
    const ollama = new OllamaEmbeddings();
    mockFetch(() => {
      throw new Error('ECONNREFUSED');
    });

    expect(await ollama.hasModel()).toBe(false);
  });

  test('hasModel() returns false on non-ok response', async () => {
    const ollama = new OllamaEmbeddings();
    mockFetch(() => textResponse('server error', 500));

    expect(await ollama.hasModel()).toBe(false);
  });

  test('hasModel() returns false when models array is empty', async () => {
    const ollama = new OllamaEmbeddings();
    mockFetch(() => jsonResponse({ models: [] }));

    expect(await ollama.hasModel()).toBe(false);
  });

  test('hasModel() returns false when models field missing', async () => {
    const ollama = new OllamaEmbeddings();
    mockFetch(() => jsonResponse({}));

    expect(await ollama.hasModel()).toBe(false);
  });

  // --- getDimension ---

  test('getDimension() returns embedding length', async () => {
    const ollama = new OllamaEmbeddings();
    mockFetch(() => jsonResponse({ embedding: [0.1, 0.2, 0.3, 0.4, 0.5] }));

    const dim = await ollama.getDimension();
    expect(dim).toBe(5);
  });

  test('getDimension() propagates embed error', async () => {
    const ollama = new OllamaEmbeddings();
    mockFetch(() => textResponse('fail', 500));

    await expect(ollama.getDimension()).rejects.toThrow('Ollama embedding error');
  });
});

// ============================================
// cosineSimilarity
// ============================================

describe('cosineSimilarity', () => {
  test('identical vectors return 1', () => {
    const v = [1, 2, 3];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 10);
  });

  test('orthogonal vectors return 0', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 10);
  });

  test('opposite vectors return -1', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 10);
  });

  test('zero vector returns 0', () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
    expect(cosineSimilarity([1, 2, 3], [0, 0, 0])).toBe(0);
  });

  test('different length throws', () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow('Vectors must have same length');
  });
});

// ============================================
// QdrantClient
// ============================================

describe('QdrantClient', () => {
  const BASE_URL = 'http://localhost:6333';
  const COLLECTION = 'stratuscode_code';

  // --- Constructor ---

  test('constructor uses defaults', () => {
    const client = new QdrantClient();
    // Verify defaults via intercepted URL on isAvailable
    let capturedUrl = '';
    mockFetch((url) => {
      capturedUrl = url as string;
      return jsonResponse({ collections: [] });
    });
    client.isAvailable();
    expect(capturedUrl).toBe(`${BASE_URL}/collections`);
  });

  test('constructor accepts custom config', () => {
    const client = new QdrantClient({ url: 'http://custom:1234', collectionName: 'my_coll' });
    let capturedUrl = '';
    mockFetch((url) => {
      capturedUrl = url as string;
      return jsonResponse({ collections: [] });
    });
    client.isAvailable();
    expect(capturedUrl).toBe('http://custom:1234/collections');
  });

  // --- isAvailable ---

  test('isAvailable() returns true on ok response', async () => {
    const client = new QdrantClient();
    mockFetch(() => jsonResponse({ collections: [] }));

    expect(await client.isAvailable()).toBe(true);
  });

  test('isAvailable() returns false on non-ok', async () => {
    const client = new QdrantClient();
    mockFetch(() => textResponse('error', 500));

    expect(await client.isAvailable()).toBe(false);
  });

  test('isAvailable() returns false on fetch error', async () => {
    const client = new QdrantClient();
    mockFetch(() => {
      throw new Error('ECONNREFUSED');
    });

    expect(await client.isAvailable()).toBe(false);
  });

  // --- initCollection ---

  test('initCollection() skips creation when collection exists', async () => {
    const client = new QdrantClient();
    let putCalled = false;
    mockFetch((_url, init) => {
      if (init?.method === 'PUT') {
        putCalled = true;
        return jsonResponse({ result: true });
      }
      // GET check - collection exists
      return jsonResponse({ result: { status: 'green' } });
    });

    await client.initCollection(768);
    expect(putCalled).toBe(false);
  });

  test('initCollection() creates new collection when it does not exist', async () => {
    const client = new QdrantClient();
    let putBody: any = null;
    mockFetch((_url, init) => {
      if (init?.method === 'PUT') {
        putBody = JSON.parse(init.body as string);
        return jsonResponse({ result: true });
      }
      // GET check - collection doesn't exist
      return textResponse('not found', 404);
    });

    await client.initCollection(384);
    expect(putBody).not.toBeNull();
    expect(putBody.vectors.size).toBe(384);
    expect(putBody.vectors.distance).toBe('Cosine');
  });

  test('initCollection() throws on creation failure', async () => {
    const client = new QdrantClient();
    mockFetch((_url, init) => {
      if (init?.method === 'PUT') {
        return textResponse('disk full', 500);
      }
      return textResponse('not found', 404);
    });

    await expect(client.initCollection(768)).rejects.toThrow('Failed to create Qdrant collection');
  });

  // --- upsert ---

  test('upsert() success sends correct body', async () => {
    const client = new QdrantClient();
    let capturedBody: any = null;
    mockFetch((_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return jsonResponse({ result: { status: 'completed' } });
    });

    const payload = {
      id: 'chunk-1',
      filePath: '/src/file.ts',
      startLine: 1,
      endLine: 10,
      content: 'function test() {}',
      language: 'typescript',
      indexedAt: 1000,
    };

    await client.upsert([{ id: 'chunk-1', vector: [0.1, 0.2], payload }]);

    expect(capturedBody.points.length).toBe(1);
    expect(capturedBody.points[0].payload.originalId).toBe('chunk-1');
    expect(capturedBody.points[0].vector).toEqual([0.1, 0.2]);
    // UUID should be deterministic (md5 of 'chunk-1')
    expect(capturedBody.points[0].id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  test('upsert() failure throws', async () => {
    const client = new QdrantClient();
    mockFetch(() => textResponse('bad request', 400));

    const payload = {
      id: 'x',
      filePath: '/x',
      startLine: 1,
      endLine: 1,
      content: '',
      language: 'ts',
      indexedAt: 0,
    };
    await expect(client.upsert([{ id: 'x', vector: [1], payload }])).rejects.toThrow(
      'Failed to upsert points'
    );
  });

  // --- search ---

  test('search() returns mapped results', async () => {
    const client = new QdrantClient();
    const chunk = {
      id: 'c1',
      filePath: '/a.ts',
      startLine: 1,
      endLine: 5,
      content: 'code',
      language: 'typescript',
      indexedAt: 100,
    };
    mockFetch(() =>
      jsonResponse({
        result: [
          { id: 'uuid-1', score: 0.95, payload: chunk },
          { id: 'uuid-2', score: 0.80, payload: { ...chunk, filePath: '/b.ts' } },
        ],
      })
    );

    const results = await client.search([0.1, 0.2], 2);
    expect(results.length).toBe(2);
    expect(results[0]!.score).toBe(0.95);
    expect(results[0]!.chunk.filePath).toBe('/a.ts');
    expect(results[1]!.score).toBe(0.80);
    expect(results[1]!.chunk.filePath).toBe('/b.ts');
  });

  test('search() failure throws', async () => {
    const client = new QdrantClient();
    mockFetch(() => textResponse('internal error', 500));

    await expect(client.search([0.1], 5)).rejects.toThrow('Failed to search');
  });

  // --- clearCollection ---

  test('clearCollection() succeeds on ok response', async () => {
    const client = new QdrantClient();
    mockFetch(() => jsonResponse({ result: true }));

    await expect(client.clearCollection()).resolves.toBeUndefined();
  });

  test('clearCollection() ignores 404', async () => {
    const client = new QdrantClient();
    mockFetch(() => textResponse('not found', 404));

    await expect(client.clearCollection()).resolves.toBeUndefined();
  });

  test('clearCollection() throws on other errors', async () => {
    const client = new QdrantClient();
    mockFetch(() => textResponse('server error', 500));

    await expect(client.clearCollection()).rejects.toThrow('Failed to delete collection');
  });

  // --- getCollectionInfo ---

  test('getCollectionInfo() returns data on success', async () => {
    const client = new QdrantClient();
    mockFetch(() =>
      jsonResponse({
        result: {
          points_count: 42,
          config: { params: { vectors: { size: 768 } } },
        },
      })
    );

    const info = await client.getCollectionInfo();
    expect(info).not.toBeNull();
    expect(info!.pointsCount).toBe(42);
    expect(info!.vectorSize).toBe(768);
  });

  test('getCollectionInfo() returns null on non-ok response', async () => {
    const client = new QdrantClient();
    mockFetch(() => textResponse('not found', 404));

    const info = await client.getCollectionInfo();
    expect(info).toBeNull();
  });

  test('getCollectionInfo() returns null on fetch error (catch path)', async () => {
    const client = new QdrantClient();
    mockFetch(() => {
      throw new Error('ECONNREFUSED');
    });

    const info = await client.getCollectionInfo();
    expect(info).toBeNull();
  });

  // --- deleteByFilePath ---

  test('deleteByFilePath() sends correct filter and succeeds', async () => {
    const client = new QdrantClient();
    let capturedUrl = '';
    let capturedBody: any = null;
    mockFetch((url, init) => {
      capturedUrl = url as string;
      capturedBody = JSON.parse(init?.body as string);
      return jsonResponse({ result: { status: 'completed' } });
    });

    await client.deleteByFilePath('/src/old-file.ts');

    expect(capturedUrl).toBe(`${BASE_URL}/collections/${COLLECTION}/points/delete`);
    expect(capturedBody.filter.must[0].key).toBe('filePath');
    expect(capturedBody.filter.must[0].match.value).toBe('/src/old-file.ts');
  });

  test('deleteByFilePath() failure throws', async () => {
    const client = new QdrantClient();
    mockFetch(() => textResponse('server error', 500));

    await expect(client.deleteByFilePath('/some/file.ts')).rejects.toThrow(
      'Failed to delete points'
    );
  });

  // --- Deterministic UUIDs ---

  test('same input produces same UUID (deterministic)', async () => {
    const client = new QdrantClient();
    const uuids: string[] = [];

    // Capture UUIDs from two separate upsert calls with the same ID
    mockFetch((_url, init) => {
      const body = JSON.parse(init?.body as string);
      if (body?.points) {
        uuids.push(body.points[0].id);
      }
      return jsonResponse({ result: { status: 'completed' } });
    });

    const payload = {
      id: 'deterministic-test',
      filePath: '/test.ts',
      startLine: 1,
      endLine: 1,
      content: '',
      language: 'ts',
      indexedAt: 0,
    };

    await client.upsert([{ id: 'deterministic-test', vector: [1], payload }]);
    await client.upsert([{ id: 'deterministic-test', vector: [2], payload }]);

    expect(uuids.length).toBe(2);
    expect(uuids[0]).toBe(uuids[1]);
    // Verify UUID format
    expect(uuids[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  test('different inputs produce different UUIDs', async () => {
    const client = new QdrantClient();
    const uuids: string[] = [];

    mockFetch((_url, init) => {
      const body = JSON.parse(init?.body as string);
      if (body?.points) {
        uuids.push(body.points[0].id);
      }
      return jsonResponse({ result: { status: 'completed' } });
    });

    const makePayload = (id: string) => ({
      id,
      filePath: '/test.ts',
      startLine: 1,
      endLine: 1,
      content: '',
      language: 'ts',
      indexedAt: 0,
    });

    await client.upsert([{ id: 'id-a', vector: [1], payload: makePayload('id-a') }]);
    await client.upsert([{ id: 'id-b', vector: [1], payload: makePayload('id-b') }]);

    expect(uuids.length).toBe(2);
    expect(uuids[0]).not.toBe(uuids[1]);
  });
});
