/**
 * Embeddings Integration Tests
 * 
 * Requires Ollama and Qdrant running locally.
 */

import { describe, test, expect, beforeAll } from 'bun:test';
import { OllamaEmbeddings, cosineSimilarity } from './ollama';
import { QdrantClient } from './qdrant';

const ollama = new OllamaEmbeddings();
const ollamaAvailable = await ollama.isAvailable();

describe.if(ollamaAvailable)('Ollama Embeddings', () => {
  test('isAvailable returns true when Ollama is running', async () => {
    const available = await ollama.isAvailable();
    expect(available).toBe(true);
  });

  test('embed generates embedding vector', async () => {
    const embedding = await ollama.embed('Hello world');
    
    expect(Array.isArray(embedding)).toBe(true);
    expect(embedding.length).toBeGreaterThan(0);
    expect(typeof embedding[0]).toBe('number');
  });

  test('embedBatch generates multiple embeddings', async () => {
    const embeddings = await ollama.embedBatch(['Hello', 'World']);
    
    expect(embeddings.length).toBe(2);
    expect(embeddings[0]!.length).toBe(embeddings[1]!.length);
  });

  test('similar texts have high cosine similarity', async () => {
    const [emb1, emb2, emb3] = await ollama.embedBatch([
      'The cat sat on the mat',
      'A cat was sitting on a mat',
      'JavaScript is a programming language',
    ]);

    const simSimilar = cosineSimilarity(emb1!, emb2!);
    const simDifferent = cosineSimilarity(emb1!, emb3!);

    expect(simSimilar).toBeGreaterThan(0.7);
    expect(simDifferent).toBeLessThan(simSimilar);
  });
});

const qdrant = new QdrantClient({ collectionName: 'test_stratuscode' });
const qdrantAvailable = await qdrant.isAvailable();

describe.if(qdrantAvailable)('Qdrant Client', () => {
  test('isAvailable returns true when Qdrant is running', async () => {
    const available = await qdrant.isAvailable();
    expect(available).toBe(true);
  });

  test('initCollection creates collection', async () => {
    await qdrant.clearCollection();
    await qdrant.initCollection(768);
    
    const info = await qdrant.getCollectionInfo();
    expect(info).toBeDefined();
    expect(info?.vectorSize).toBe(768);
  });

  test('upsert and search work correctly', async () => {
    await qdrant.clearCollection();
    await qdrant.initCollection(4); // Small vectors for testing

    // Insert test points
    await qdrant.upsert([
      {
        id: 'test1',
        vector: [1, 0, 0, 0],
        payload: {
          id: 'test1',
          filePath: '/test/file1.ts',
          startLine: 1,
          endLine: 10,
          content: 'function hello() {}',
          language: 'typescript',
          indexedAt: Date.now(),
        },
      },
      {
        id: 'test2',
        vector: [0.9, 0.1, 0, 0],
        payload: {
          id: 'test2',
          filePath: '/test/file2.ts',
          startLine: 1,
          endLine: 5,
          content: 'function world() {}',
          language: 'typescript',
          indexedAt: Date.now(),
        },
      },
    ]);

    // Search for similar vector
    const results = await qdrant.search([1, 0, 0, 0], 2);

    expect(results.length).toBe(2);
    expect(results[0]!.chunk.filePath).toBe('/test/file1.ts');
    expect(results[0]!.score).toBeGreaterThan(results[1]!.score);
  });

  test('cleanup test collection', async () => {
    await qdrant.clearCollection();
  });
});
