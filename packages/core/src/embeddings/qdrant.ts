/**
 * Qdrant Vector Store Client
 *
 * Manages vector storage and search using Qdrant.
 */

// ============================================
// Types
// ============================================

export interface QdrantConfig {
  url?: string;
  collectionName?: string;
}

export interface CodeChunk {
  id: string;
  filePath: string;
  startLine: number;
  endLine: number;
  content: string;
  language: string;
  indexedAt: number;
}

export interface SearchResult {
  chunk: CodeChunk;
  score: number;
}

interface QdrantPoint {
  id: string;
  vector: number[];
  payload: CodeChunk;
}

interface QdrantSearchResult {
  id: string;
  score: number;
  payload: CodeChunk;
}

// ============================================
// Client
// ============================================

import { createHash } from 'crypto';

const DEFAULT_URL = 'http://localhost:6333';
const DEFAULT_COLLECTION = 'stratuscode_code';

export class QdrantClient {
  private url: string;
  private collectionName: string;
  private vectorSize: number | null = null;

  constructor(config?: QdrantConfig) {
    this.url = config?.url || DEFAULT_URL;
    this.collectionName = config?.collectionName || DEFAULT_COLLECTION;
  }

  /**
   * Convert string ID to UUID format for Qdrant
   */
  private stringToUuid(str: string): string {
    const hash = createHash('md5').update(str).digest('hex');
    // Format as UUID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
  }

  /**
   * Check if Qdrant is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.url}/collections`, {
        signal: AbortSignal.timeout(2000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Initialize collection with given vector size
   */
  async initCollection(vectorSize: number): Promise<void> {
    this.vectorSize = vectorSize;

    // Check if collection exists
    const existsResponse = await fetch(`${this.url}/collections/${this.collectionName}`);
    if (existsResponse.ok) {
      return; // Collection exists
    }

    // Create collection
    const response = await fetch(`${this.url}/collections/${this.collectionName}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vectors: {
          size: vectorSize,
          distance: 'Cosine',
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create Qdrant collection: ${error}`);
    }
  }

  /**
   * Upsert points (vectors with metadata)
   */
  async upsert(points: Array<{ id: string; vector: number[]; payload: CodeChunk }>): Promise<void> {
    const response = await fetch(`${this.url}/collections/${this.collectionName}/points`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        points: points.map(p => ({
          id: this.stringToUuid(p.id),
          vector: p.vector,
          payload: { ...p.payload, originalId: p.id },
        })),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to upsert points: ${error}`);
    }
  }

  /**
   * Search for similar vectors
   */
  async search(vector: number[], limit: number = 5): Promise<SearchResult[]> {
    const response = await fetch(`${this.url}/collections/${this.collectionName}/points/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vector,
        limit,
        with_payload: true,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to search: ${error}`);
    }

    const data = await response.json() as { result: QdrantSearchResult[] };
    return data.result.map(r => ({
      chunk: r.payload,
      score: r.score,
    }));
  }

  /**
   * Delete all points in collection
   */
  async clearCollection(): Promise<void> {
    const response = await fetch(`${this.url}/collections/${this.collectionName}`, {
      method: 'DELETE',
    });

    if (!response.ok && response.status !== 404) {
      const error = await response.text();
      throw new Error(`Failed to delete collection: ${error}`);
    }
  }

  /**
   * Get collection info
   */
  async getCollectionInfo(): Promise<{ pointsCount: number; vectorSize: number } | null> {
    try {
      const response = await fetch(`${this.url}/collections/${this.collectionName}`);
      if (!response.ok) return null;

      const data = await response.json() as {
        result: {
          points_count: number;
          config: { params: { vectors: { size: number } } };
        };
      };

      return {
        pointsCount: data.result.points_count,
        vectorSize: data.result.config.params.vectors.size,
      };
    } catch {
      return null;
    }
  }

  /**
   * Delete points by file path
   */
  async deleteByFilePath(filePath: string): Promise<void> {
    const response = await fetch(`${this.url}/collections/${this.collectionName}/points/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filter: {
          must: [
            { key: 'filePath', match: { value: filePath } },
          ],
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to delete points: ${error}`);
    }
  }
}
