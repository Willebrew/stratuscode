import { describe, expect, test, mock, beforeEach, afterEach } from 'bun:test';

// Mock the indexer module before importing codesearch
const mockIndexer = {
  checkDependencies: mock(() => Promise.resolve({ ollama: true, qdrant: true })),
  getStats: mock(() => Promise.resolve({ pointsCount: 100 })),
  initialize: mock(() => Promise.resolve()),
  indexAll: mock(() => Promise.resolve({ chunksCreated: 50, filesProcessed: 10 })),
  search: mock(() =>
    Promise.resolve([
      {
        chunk: {
          filePath: '/src/index.ts',
          startLine: 1,
          endLine: 10,
          content: 'export function main() {}',
          language: 'typescript',
        },
        score: 0.95,
      },
    ])
  ),
};

mock.module('./lib/embeddings/indexer', () => ({
  CodebaseIndexer: class {
    constructor() {
      return mockIndexer;
    }
  },
}));

import { codesearchTool } from './codesearch';

const ctx = { sessionId: 'test', metadata: { projectDir: '/tmp/test-project' } };

beforeEach(() => {
  mockIndexer.checkDependencies.mockReset();
  mockIndexer.getStats.mockReset();
  mockIndexer.initialize.mockReset();
  mockIndexer.indexAll.mockReset();
  mockIndexer.search.mockReset();
  // Reset defaults
  mockIndexer.checkDependencies.mockResolvedValue({ ollama: true, qdrant: true });
  mockIndexer.getStats.mockResolvedValue({ pointsCount: 100 });
  mockIndexer.search.mockResolvedValue([
    {
      chunk: {
        filePath: '/src/index.ts',
        startLine: 1,
        endLine: 10,
        content: 'export function main() {}',
        language: 'typescript',
      },
      score: 0.95,
    },
  ]);
});

describe('codesearch tool', () => {
  test('has correct metadata', () => {
    expect(codesearchTool.name).toBe('codesearch');
    expect(codesearchTool.description).toContain('Semantic code search');
  });

  test('returns error when Ollama is not available', async () => {
    mockIndexer.checkDependencies.mockResolvedValue({ ollama: false, qdrant: true });

    const result = await codesearchTool.execute(
      { query: 'test' },
      ctx as any
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.error).toBe('Ollama not available');
    expect(parsed.message).toContain('Ollama');
  });

  test('returns error when Qdrant is not available', async () => {
    mockIndexer.checkDependencies.mockResolvedValue({ ollama: true, qdrant: false });

    const result = await codesearchTool.execute(
      { query: 'test' },
      ctx as any
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.error).toBe('Qdrant not available');
    expect(parsed.message).toContain('Qdrant');
  });

  test('searches without reindexing when index exists', async () => {
    const result = await codesearchTool.execute(
      { query: 'main function' },
      ctx as any
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.query).toBe('main function');
    expect(parsed.results).toHaveLength(1);
    expect(parsed.results[0].filePath).toBe('/src/index.ts');
    expect(parsed.results[0].score).toBe(0.95);
    expect(parsed.totalResults).toBe(1);

    // Should NOT have called initialize or indexAll
    expect(mockIndexer.initialize).not.toHaveBeenCalled();
    expect(mockIndexer.indexAll).not.toHaveBeenCalled();
  });

  test('indexes when no existing index (pointsCount = 0)', async () => {
    mockIndexer.getStats.mockResolvedValue({ pointsCount: 0 });
    mockIndexer.indexAll.mockResolvedValue({ chunksCreated: 50, filesProcessed: 10 });

    const result = await codesearchTool.execute(
      { query: 'test' },
      ctx as any
    );
    const parsed = JSON.parse(result as string);

    expect(mockIndexer.initialize).toHaveBeenCalled();
    expect(mockIndexer.indexAll).toHaveBeenCalled();
    expect(parsed.results).toBeDefined();
  });

  test('indexes when reindex flag is true', async () => {
    mockIndexer.indexAll.mockResolvedValue({ chunksCreated: 30, filesProcessed: 5 });

    const result = await codesearchTool.execute(
      { query: 'test', reindex: true },
      ctx as any
    );
    const parsed = JSON.parse(result as string);

    expect(mockIndexer.initialize).toHaveBeenCalled();
    expect(mockIndexer.indexAll).toHaveBeenCalled();
    expect(parsed.results).toBeDefined();
  });

  test('returns error when no files indexed', async () => {
    mockIndexer.getStats.mockResolvedValue({ pointsCount: 0 });
    mockIndexer.indexAll.mockResolvedValue({ chunksCreated: 0, filesProcessed: 0 });

    const result = await codesearchTool.execute(
      { query: 'test' },
      ctx as any
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.error).toBe('No files indexed');
  });

  test('returns error when indexing fails', async () => {
    mockIndexer.getStats.mockResolvedValue({ pointsCount: 0 });
    mockIndexer.initialize.mockRejectedValue(new Error('Index init failed'));

    const result = await codesearchTool.execute(
      { query: 'test' },
      ctx as any
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.error).toBe('Indexing failed');
    expect(parsed.message).toContain('Index init failed');
  });

  test('returns error when search fails', async () => {
    mockIndexer.search.mockRejectedValue(new Error('Search error'));

    const result = await codesearchTool.execute(
      { query: 'test' },
      ctx as any
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.error).toBe('Search failed');
    expect(parsed.message).toContain('Search error');
  });

  test('indexes when getStats returns null', async () => {
    mockIndexer.getStats.mockResolvedValue(null as unknown as { pointsCount: number });
    mockIndexer.indexAll.mockResolvedValue({ chunksCreated: 10, filesProcessed: 2 });

    const result = await codesearchTool.execute(
      { query: 'test' },
      ctx as any
    );
    const parsed = JSON.parse(result as string);

    expect(mockIndexer.initialize).toHaveBeenCalled();
    expect(mockIndexer.indexAll).toHaveBeenCalled();
    expect(parsed.results).toBeDefined();
  });
});
