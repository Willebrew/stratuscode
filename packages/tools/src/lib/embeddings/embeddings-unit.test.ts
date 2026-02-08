/**
 * Embeddings Unit Tests (Mocked Fetch)
 *
 * Tests for OllamaEmbeddings, cosineSimilarity, and QdrantClient
 * using mocked globalThis.fetch — no real services required.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { OllamaEmbeddings, cosineSimilarity } from './ollama';
import { QdrantClient } from './qdrant';

// ============================================
// Helpers
// ============================================

const originalFetch = globalThis.fetch;

function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : input.url;
    return handler(url, init);
  }) as typeof fetch;
}

function jsonResponse(body: unknown, status = 200, statusText = 'OK'): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText,
    headers: { 'Content-Type': 'application/json' },
  });
}

function textResponse(body: string, status: number, statusText = 'Error'): Response {
  return new Response(body, { status, statusText });
}

// ============================================
// OllamaEmbeddings
// ============================================

describe('OllamaEmbeddings (unit)', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // --- Constructor / config ---

  test('uses default baseUrl and model', () => {
    const ollama = new OllamaEmbeddings();
    // We verify defaults by observing the URL in the fetch call
    let capturedUrl = '';
    mockFetch((url) => {
      capturedUrl = url;
      return jsonResponse({ embedding: [1, 2, 3] });
    });
    // Trigger a call to observe the URL
    ollama.embed('hi');
    expect(capturedUrl).toBe('http://localhost:11434/api/embeddings');
  });

  test('accepts custom baseUrl and model', async () => {
    const ollama = new OllamaEmbeddings({
      baseUrl: 'http://myhost:9999',
      model: 'custom-model',
    });

    let capturedUrl = '';
    let capturedBody: any = null;

    mockFetch(async (url, init) => {
      capturedUrl = url;
      capturedBody = JSON.parse(init?.body as string);
      return jsonResponse({ embedding: [0.5] });
    });

    const result = await ollama.embed('test');
    expect(capturedUrl).toBe('http://myhost:9999/api/embeddings');
    expect(capturedBody.model).toBe('custom-model');
    expect(capturedBody.prompt).toBe('test');
    expect(result).toEqual([0.5]);
  });

  // --- embed ---

  test('embed returns embedding vector on success', async () => {
    const ollama = new OllamaEmbeddings();
    mockFetch(() => jsonResponse({ embedding: [0.1, 0.2, 0.3, 0.4] }));

    const result = await ollama.embed('hello world');
    expect(result).toEqual([0.1, 0.2, 0.3, 0.4]);
  });

  test('embed throws on non-ok response', async () => {
    const ollama = new OllamaEmbeddings();
    mockFetch(() => textResponse('model not found', 500, 'Internal Server Error'));

    await expect(ollama.embed('hello')).rejects.toThrow('Ollama embedding error: 500 Internal Server Error');
  });

  test('embed sends correct request body', async () => {
    const ollama = new OllamaEmbeddings({ model: 'bge-large' });
    let capturedBody: any = null;

    mockFetch(async (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return jsonResponse({ embedding: [1] });
    });

    await ollama.embed('some text');
    expect(capturedBody).toEqual({ model: 'bge-large', prompt: 'some text' });
  });

  // --- embedBatch ---

  test('embedBatch returns embeddings for all texts', async () => {
    const ollama = new OllamaEmbeddings();
    let callCount = 0;

    mockFetch(() => {
      callCount++;
      return jsonResponse({ embedding: [callCount * 0.1, callCount * 0.2] });
    });

    const results = await ollama.embedBatch(['a', 'b', 'c']);
    expect(results.length).toBe(3);
    // Each call got a unique embedding
    expect(results[0]).toEqual([0.1, 0.2]);
    expect(results[1]).toEqual([0.2, 0.4]);
    expect(results[2]).toEqual([0.30000000000000004, 0.6000000000000001]);
  });

  // --- isAvailable ---

  test('isAvailable returns true when Ollama responds ok', async () => {
    const ollama = new OllamaEmbeddings();
    mockFetch(() => jsonResponse({ models: [] }));

    const available = await ollama.isAvailable();
    expect(available).toBe(true);
  });

  test('isAvailable returns false on fetch error (connection refused)', async () => {
    const ollama = new OllamaEmbeddings();
    mockFetch(() => {
      throw new Error('fetch failed: Connection refused');
    });

    const available = await ollama.isAvailable();
    expect(available).toBe(false);
  });

  test('isAvailable returns false on non-ok response', async () => {
    const ollama = new OllamaEmbeddings();
    mockFetch(() => textResponse('service unavailable', 503, 'Service Unavailable'));

    const available = await ollama.isAvailable();
    expect(available).toBe(false);
  });

  // --- hasModel ---

  test('hasModel returns true when model exists in list', async () => {
    const ollama = new OllamaEmbeddings(); // default model: nomic-embed-text
    mockFetch(() =>
      jsonResponse({
        models: [
          { name: 'llama2:latest' },
          { name: 'nomic-embed-text:latest' },
        ],
      }),
    );

    const has = await ollama.hasModel();
    expect(has).toBe(true);
  });

  test('hasModel returns false when model not found', async () => {
    const ollama = new OllamaEmbeddings();
    mockFetch(() =>
      jsonResponse({
        models: [
          { name: 'llama2:latest' },
          { name: 'mistral:latest' },
        ],
      }),
    );

    const has = await ollama.hasModel();
    expect(has).toBe(false);
  });

  test('hasModel returns false on fetch error', async () => {
    const ollama = new OllamaEmbeddings();
    mockFetch(() => {
      throw new Error('network error');
    });

    const has = await ollama.hasModel();
    expect(has).toBe(false);
  });

  test('hasModel returns false on non-ok response (500)', async () => {
    const ollama = new OllamaEmbeddings();
    mockFetch(() => textResponse('internal error', 500, 'Internal Server Error'));

    const has = await ollama.hasModel();
    expect(has).toBe(false);
  });

  test('hasModel returns false when models array is empty', async () => {
    const ollama = new OllamaEmbeddings();
    mockFetch(() => jsonResponse({ models: [] }));

    const has = await ollama.hasModel();
    expect(has).toBe(false);
  });

  test('hasModel returns false when models field is missing', async () => {
    const ollama = new OllamaEmbeddings();
    mockFetch(() => jsonResponse({}));

    const has = await ollama.hasModel();
    expect(has).toBe(false);
  });

  test('hasModel with custom model name matches partial string', async () => {
    const ollama = new OllamaEmbeddings({ model: 'bge-large' });
    mockFetch(() =>
      jsonResponse({
        models: [{ name: 'bge-large-en-v1.5:latest' }],
      }),
    );

    const has = await ollama.hasModel();
    expect(has).toBe(true);
  });

  // --- getDimension ---

  test('getDimension returns embedding length', async () => {
    const ollama = new OllamaEmbeddings();
    const fakeVector = new Array(768).fill(0).map((_, i) => i * 0.001);
    mockFetch(() => jsonResponse({ embedding: fakeVector }));

    const dim = await ollama.getDimension();
    expect(dim).toBe(768);
  });

  test('getDimension propagates embed error', async () => {
    const ollama = new OllamaEmbeddings();
    mockFetch(() => textResponse('bad request', 400, 'Bad Request'));

    await expect(ollama.getDimension()).rejects.toThrow('Ollama embedding error: 400 Bad Request');
  });
});

// ============================================
// cosineSimilarity
// ============================================

describe('cosineSimilarity (unit)', () => {
  test('identical vectors return 1', () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1.0);
    expect(cosineSimilarity([0.5, 0.5], [0.5, 0.5])).toBeCloseTo(1.0);
  });

  test('orthogonal vectors return 0', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0.0);
  });

  test('opposite vectors return -1', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1.0);
  });

  test('zero vector returns 0', () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
    expect(cosineSimilarity([1, 2, 3], [0, 0, 0])).toBe(0);
    expect(cosineSimilarity([0, 0], [0, 0])).toBe(0);
  });

  test('different length vectors throw', () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow('Vectors must have same length');
    expect(() => cosineSimilarity([], [1])).toThrow('Vectors must have same length');
  });

  test('empty vectors of same length return 0', () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });

  test('known cosine similarity value', () => {
    // cos([1,2,3], [4,5,6]) = 32 / (sqrt(14) * sqrt(77)) ≈ 0.9746
    const sim = cosineSimilarity([1, 2, 3], [4, 5, 6]);
    expect(sim).toBeCloseTo(0.9746, 3);
  });
});

// ============================================
// QdrantClient
// ============================================

describe('QdrantClient (unit)', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // --- Constructor ---

  test('uses default url and collectionName', async () => {
    const client = new QdrantClient();
    let capturedUrl = '';
    mockFetch((url) => {
      capturedUrl = url;
      return jsonResponse({});
    });

    await client.isAvailable();
    expect(capturedUrl).toBe('http://localhost:6333/collections');
  });

  test('accepts custom url and collectionName', async () => {
    const client = new QdrantClient({ url: 'http://myqdrant:7777', collectionName: 'my_coll' });
    let capturedUrl = '';
    mockFetch((url) => {
      capturedUrl = url;
      return jsonResponse({});
    });

    await client.isAvailable();
    expect(capturedUrl).toBe('http://myqdrant:7777/collections');
  });

  // --- isAvailable ---

  test('isAvailable returns true on ok response', async () => {
    const client = new QdrantClient();
    mockFetch(() => jsonResponse({ result: { collections: [] } }));

    expect(await client.isAvailable()).toBe(true);
  });

  test('isAvailable returns false on fetch error', async () => {
    const client = new QdrantClient();
    mockFetch(() => {
      throw new Error('ECONNREFUSED');
    });

    expect(await client.isAvailable()).toBe(false);
  });

  test('isAvailable returns false on non-ok response', async () => {
    const client = new QdrantClient();
    mockFetch(() => textResponse('down', 503));

    expect(await client.isAvailable()).toBe(false);
  });

  // --- initCollection ---

  test('initCollection skips creation when collection already exists', async () => {
    const client = new QdrantClient({ collectionName: 'existing_coll' });
    let putCalled = false;

    mockFetch((url, init) => {
      if (init?.method === 'PUT') {
        putCalled = true;
        return jsonResponse({ result: true });
      }
      // GET check returns ok — collection exists
      return jsonResponse({ result: { status: 'green' } });
    });

    await client.initCollection(768);
    expect(putCalled).toBe(false);
  });

  test('initCollection creates collection when it does not exist', async () => {
    const client = new QdrantClient({ collectionName: 'new_coll' });
    let putBody: any = null;

    mockFetch((url, init) => {
      if (!init?.method || init.method === 'GET') {
        // Collection does not exist
        return textResponse('not found', 404, 'Not Found');
      }
      if (init.method === 'PUT') {
        putBody = JSON.parse(init.body as string);
        return jsonResponse({ result: true });
      }
      return jsonResponse({});
    });

    await client.initCollection(384);
    expect(putBody).toEqual({
      vectors: { size: 384, distance: 'Cosine' },
    });
  });

  test('initCollection throws on creation failure', async () => {
    const client = new QdrantClient({ collectionName: 'fail_coll' });

    mockFetch((_url, init) => {
      if (init?.method === 'PUT') {
        return textResponse('disk full', 500, 'Internal Server Error');
      }
      // Collection does not exist
      return textResponse('not found', 404, 'Not Found');
    });

    await expect(client.initCollection(768)).rejects.toThrow('Failed to create Qdrant collection: disk full');
  });

  // --- upsert ---

  test('upsert sends correct payload and succeeds', async () => {
    const client = new QdrantClient({ collectionName: 'test_coll' });
    let capturedBody: any = null;
    let capturedUrl = '';

    mockFetch((url, init) => {
      capturedUrl = url;
      capturedBody = JSON.parse(init?.body as string);
      return jsonResponse({ result: { status: 'completed' } });
    });

    const chunk = {
      id: 'chunk1',
      filePath: '/src/index.ts',
      startLine: 1,
      endLine: 10,
      content: 'export const x = 1;',
      language: 'typescript',
      indexedAt: 1700000000000,
    };

    await client.upsert([{ id: 'chunk1', vector: [0.1, 0.2], payload: chunk }]);
    expect(capturedUrl).toContain('/collections/test_coll/points');
    expect(capturedBody.points.length).toBe(1);
    // UUID is deterministic from md5 hash
    expect(capturedBody.points[0].id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(capturedBody.points[0].vector).toEqual([0.1, 0.2]);
    expect(capturedBody.points[0].payload.originalId).toBe('chunk1');
    expect(capturedBody.points[0].payload.filePath).toBe('/src/index.ts');
  });

  test('upsert throws on non-ok response', async () => {
    const client = new QdrantClient();
    mockFetch(() => textResponse('bad vectors', 400, 'Bad Request'));

    await expect(
      client.upsert([
        {
          id: 'x',
          vector: [1],
          payload: {
            id: 'x',
            filePath: '/a.ts',
            startLine: 1,
            endLine: 1,
            content: '',
            language: 'typescript',
            indexedAt: 0,
          },
        },
      ]),
    ).rejects.toThrow('Failed to upsert points: bad vectors');
  });

  // --- search ---

  test('search returns mapped results', async () => {
    const client = new QdrantClient({ collectionName: 'search_coll' });

    mockFetch(() =>
      jsonResponse({
        result: [
          {
            id: 'uuid-1',
            score: 0.95,
            payload: {
              id: 'c1',
              filePath: '/a.ts',
              startLine: 1,
              endLine: 5,
              content: 'function a() {}',
              language: 'typescript',
              indexedAt: 1700000000000,
            },
          },
          {
            id: 'uuid-2',
            score: 0.82,
            payload: {
              id: 'c2',
              filePath: '/b.ts',
              startLine: 10,
              endLine: 20,
              content: 'function b() {}',
              language: 'typescript',
              indexedAt: 1700000000000,
            },
          },
        ],
      }),
    );

    const results = await client.search([0.1, 0.2, 0.3], 2);
    expect(results.length).toBe(2);
    expect(results[0]!.score).toBe(0.95);
    expect(results[0]!.chunk.filePath).toBe('/a.ts');
    expect(results[1]!.score).toBe(0.82);
    expect(results[1]!.chunk.filePath).toBe('/b.ts');
  });

  test('search sends correct request body with default limit', async () => {
    const client = new QdrantClient({ collectionName: 'sc' });
    let capturedBody: any = null;

    mockFetch((_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return jsonResponse({ result: [] });
    });

    await client.search([0.5, 0.5]);
    expect(capturedBody).toEqual({
      vector: [0.5, 0.5],
      limit: 5,
      with_payload: true,
    });
  });

  test('search throws on non-ok response', async () => {
    const client = new QdrantClient();
    mockFetch(() => textResponse('collection not found', 404, 'Not Found'));

    await expect(client.search([0.1], 3)).rejects.toThrow('Failed to search: collection not found');
  });

  // --- clearCollection ---

  test('clearCollection succeeds on ok response', async () => {
    const client = new QdrantClient({ collectionName: 'del_coll' });
    let capturedMethod = '';
    let capturedUrl = '';

    mockFetch((url, init) => {
      capturedUrl = url;
      capturedMethod = init?.method || 'GET';
      return jsonResponse({ result: true });
    });

    await client.clearCollection();
    expect(capturedMethod).toBe('DELETE');
    expect(capturedUrl).toContain('/collections/del_coll');
  });

  test('clearCollection ignores 404 (collection already gone)', async () => {
    const client = new QdrantClient();
    mockFetch(() => textResponse('not found', 404, 'Not Found'));

    // Should not throw
    await client.clearCollection();
  });

  test('clearCollection throws on other error status', async () => {
    const client = new QdrantClient();
    mockFetch(() => textResponse('permission denied', 403, 'Forbidden'));

    await expect(client.clearCollection()).rejects.toThrow('Failed to delete collection: permission denied');
  });

  // --- getCollectionInfo ---

  test('getCollectionInfo returns parsed info on success', async () => {
    const client = new QdrantClient({ collectionName: 'info_coll' });
    mockFetch(() =>
      jsonResponse({
        result: {
          points_count: 42,
          config: { params: { vectors: { size: 768 } } },
        },
      }),
    );

    const info = await client.getCollectionInfo();
    expect(info).toEqual({ pointsCount: 42, vectorSize: 768 });
  });

  test('getCollectionInfo returns null on non-ok response', async () => {
    const client = new QdrantClient();
    mockFetch(() => textResponse('not found', 404, 'Not Found'));

    const info = await client.getCollectionInfo();
    expect(info).toBeNull();
  });

  test('getCollectionInfo returns null on fetch error (catch path)', async () => {
    const client = new QdrantClient();
    mockFetch(() => {
      throw new Error('ECONNREFUSED');
    });

    const info = await client.getCollectionInfo();
    expect(info).toBeNull();
  });

  // --- deleteByFilePath ---

  test('deleteByFilePath sends correct filter and succeeds', async () => {
    const client = new QdrantClient({ collectionName: 'del_fp_coll' });
    let capturedUrl = '';
    let capturedBody: any = null;
    let capturedMethod = '';

    mockFetch((url, init) => {
      capturedUrl = url;
      capturedMethod = init?.method || 'GET';
      capturedBody = JSON.parse(init?.body as string);
      return jsonResponse({ result: { status: 'completed' } });
    });

    await client.deleteByFilePath('/src/old-file.ts');
    expect(capturedUrl).toContain('/collections/del_fp_coll/points/delete');
    expect(capturedMethod).toBe('POST');
    expect(capturedBody).toEqual({
      filter: {
        must: [{ key: 'filePath', match: { value: '/src/old-file.ts' } }],
      },
    });
  });

  test('deleteByFilePath throws on non-ok response', async () => {
    const client = new QdrantClient();
    mockFetch(() => textResponse('server error', 500, 'Internal Server Error'));

    await expect(client.deleteByFilePath('/src/file.ts')).rejects.toThrow(
      'Failed to delete points: server error',
    );
  });

  // --- stringToUuid determinism ---

  test('upsert produces deterministic UUIDs for same IDs', async () => {
    const client = new QdrantClient();
    const bodies: any[] = [];

    mockFetch((_url, init) => {
      bodies.push(JSON.parse(init?.body as string));
      return jsonResponse({ result: { status: 'completed' } });
    });

    const chunk = {
      id: 'test-id',
      filePath: '/f.ts',
      startLine: 1,
      endLine: 1,
      content: '',
      language: 'typescript',
      indexedAt: 0,
    };

    await client.upsert([{ id: 'test-id', vector: [1], payload: chunk }]);
    await client.upsert([{ id: 'test-id', vector: [2], payload: chunk }]);

    // Same input ID should produce the same UUID
    expect(bodies[0].points[0].id).toBe(bodies[1].points[0].id);
  });
});
