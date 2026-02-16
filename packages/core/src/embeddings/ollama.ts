/**
 * Ollama Embeddings Client
 *
 * Generates embeddings using Ollama's local models.
 */

// ============================================
// Types
// ============================================

export interface OllamaConfig {
  baseUrl?: string;
  model?: string;
}

export interface EmbeddingResponse {
  embedding: number[];
}

// ============================================
// Client
// ============================================

const DEFAULT_BASE_URL = 'http://localhost:11434';
const DEFAULT_MODEL = 'nomic-embed-text';

export class OllamaEmbeddings {
  private baseUrl: string;
  private model: string;

  constructor(config?: OllamaConfig) {
    this.baseUrl = config?.baseUrl || DEFAULT_BASE_URL;
    this.model = config?.model || DEFAULT_MODEL;
  }

  /**
   * Generate embedding for a single text
   */
  async embed(text: string): Promise<number[]> {
    const response = await fetch(`${this.baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        prompt: text,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama embedding error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as EmbeddingResponse;
    return data.embedding;
  }

  /**
   * Generate embeddings for multiple texts
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    // Ollama doesn't have native batch support, so we parallelize
    const results = await Promise.all(
      texts.map(text => this.embed(text))
    );
    return results;
  }

  /**
   * Check if Ollama is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(2000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Check if the embedding model is available
   */
  async hasModel(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) return false;
      
      const data = await response.json() as { models?: Array<{ name: string }> };
      return data.models?.some(m => m.name.includes(this.model)) ?? false;
    } catch {
      return false;
    }
  }

  /**
   * Get embedding dimension for current model
   */
  async getDimension(): Promise<number> {
    // Generate a test embedding to get dimension
    const testEmbedding = await this.embed('test');
    return testEmbedding.length;
  }
}

/**
 * Compute cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
