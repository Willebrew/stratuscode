/**
 * Codebase Indexer
 *
 * Indexes codebase files for semantic search.
 */

import * as fs from 'fs';
import * as path from 'path';
import { OllamaEmbeddings } from './ollama';
import { QdrantClient, type CodeChunk } from './qdrant';
import { createHash } from 'crypto';

// ============================================
// Types
// ============================================

export interface IndexerConfig {
  projectDir: string;
  ollamaUrl?: string;
  ollamaModel?: string;
  qdrantUrl?: string;
  collectionName?: string;
  chunkSize?: number;
  chunkOverlap?: number;
}

export interface IndexStats {
  filesIndexed: number;
  chunksCreated: number;
  totalTokens: number;
  duration: number;
}

// ============================================
// File patterns
// ============================================

const SUPPORTED_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.pyi',
  '.rs',
  '.go',
  '.java', '.kt', '.kts',
  '.c', '.cpp', '.cc', '.h', '.hpp',
  '.cs',
  '.rb',
  '.php',
  '.swift',
  '.scala',
  '.vue', '.svelte',
  '.md', '.mdx',
  '.json', '.yaml', '.yml', '.toml',
]);

const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out',
  '__pycache__', '.venv', 'venv', 'env',
  'target', '.cargo',
  'vendor',
  '.next', '.nuxt', '.output',
  'coverage', '.nyc_output',
]);

const IGNORED_FILES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb',
  'Cargo.lock', 'Gemfile.lock', 'poetry.lock',
]);

// ============================================
// Indexer
// ============================================

export class CodebaseIndexer {
  private ollama: OllamaEmbeddings;
  private qdrant: QdrantClient;
  private projectDir: string;
  private chunkSize: number;
  private chunkOverlap: number;
  private vectorSize: number | null = null;

  constructor(config: IndexerConfig) {
    this.projectDir = config.projectDir;
    this.chunkSize = config.chunkSize || 1000;
    this.chunkOverlap = config.chunkOverlap || 200;

    this.ollama = new OllamaEmbeddings({
      baseUrl: config.ollamaUrl,
      model: config.ollamaModel,
    });

    this.qdrant = new QdrantClient({
      url: config.qdrantUrl,
      collectionName: config.collectionName,
    });
  }

  /**
   * Check if dependencies are available
   */
  async checkDependencies(): Promise<{ ollama: boolean; qdrant: boolean }> {
    const [ollama, qdrant] = await Promise.all([
      this.ollama.isAvailable(),
      this.qdrant.isAvailable(),
    ]);
    return { ollama, qdrant };
  }

  /**
   * Initialize the indexer
   */
  async initialize(): Promise<void> {
    // Get vector dimension from Ollama
    this.vectorSize = await this.ollama.getDimension();
    
    // Initialize Qdrant collection
    await this.qdrant.initCollection(this.vectorSize);
  }

  /**
   * Index the entire codebase
   */
  async indexAll(onProgress?: (file: string, progress: number) => void): Promise<IndexStats> {
    const startTime = Date.now();
    
    // Ensure initialized
    if (!this.vectorSize) {
      await this.initialize();
    }

    // Clear existing index
    await this.qdrant.clearCollection();
    await this.qdrant.initCollection(this.vectorSize!);

    // Find all files
    const files = this.findFiles(this.projectDir);
    let filesIndexed = 0;
    let chunksCreated = 0;
    let totalTokens = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      const relativePath = path.relative(this.projectDir, file);
      
      onProgress?.(relativePath, (i + 1) / files.length);

      try {
        const chunks = await this.indexFile(file);
        filesIndexed++;
        chunksCreated += chunks;
      } catch (error) {
        console.error(`[Indexer] Failed to index ${relativePath}:`, error);
      }
    }

    return {
      filesIndexed,
      chunksCreated,
      totalTokens,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Index a single file
   */
  async indexFile(filePath: string): Promise<number> {
    const content = fs.readFileSync(filePath, 'utf-8');
    const relativePath = path.relative(this.projectDir, filePath);
    const ext = path.extname(filePath);
    const language = this.getLanguage(ext);

    // Split into chunks
    const chunks = this.chunkContent(content, relativePath, language);
    if (chunks.length === 0) return 0;

    // Generate embeddings
    const texts = chunks.map(c => `${c.filePath}\n${c.content}`);
    const embeddings = await this.ollama.embedBatch(texts);

    // Upsert to Qdrant
    const points = chunks.map((chunk, i) => ({
      id: chunk.id,
      vector: embeddings[i]!,
      payload: chunk,
    }));

    await this.qdrant.upsert(points);
    return chunks.length;
  }

  /**
   * Search for similar code
   */
  async search(query: string, limit: number = 5) {
    // Generate query embedding
    const embedding = await this.ollama.embed(query);
    
    // Search in Qdrant
    return this.qdrant.search(embedding, limit);
  }

  /**
   * Get collection info
   */
  async getStats() {
    return this.qdrant.getCollectionInfo();
  }

  // ============================================
  // Helpers
  // ============================================

  private findFiles(dir: string): string[] {
    const files: string[] = [];

    const walk = (currentDir: string) => {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory()) {
          if (!IGNORED_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
            walk(fullPath);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          if (SUPPORTED_EXTENSIONS.has(ext) && !IGNORED_FILES.has(entry.name)) {
            files.push(fullPath);
          }
        }
      }
    };

    walk(dir);
    return files;
  }

  private chunkContent(content: string, filePath: string, language: string): CodeChunk[] {
    const lines = content.split('\n');
    const chunks: CodeChunk[] = [];
    
    let currentChunk: string[] = [];
    let startLine = 1;
    let charCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      currentChunk.push(line);
      charCount += line.length + 1;

      if (charCount >= this.chunkSize) {
        // Create chunk
        const chunkContent = currentChunk.join('\n');
        const endLine = startLine + currentChunk.length - 1;
        
        chunks.push({
          id: this.createChunkId(filePath, startLine),
          filePath,
          startLine,
          endLine,
          content: chunkContent,
          language,
          indexedAt: Date.now(),
        });

        // Start next chunk with overlap
        const overlapLines = Math.ceil(this.chunkOverlap / 50); // ~50 chars per line avg
        startLine = Math.max(1, endLine - overlapLines);
        currentChunk = lines.slice(startLine - 1, i + 1);
        charCount = currentChunk.join('\n').length;
      }
    }

    // Add remaining content
    if (currentChunk.length > 0) {
      const chunkContent = currentChunk.join('\n');
      if (chunkContent.trim().length > 0) {
        chunks.push({
          id: this.createChunkId(filePath, startLine),
          filePath,
          startLine,
          endLine: lines.length,
          content: chunkContent,
          language,
          indexedAt: Date.now(),
        });
      }
    }

    return chunks;
  }

  private createChunkId(filePath: string, startLine: number): string {
    const hash = createHash('md5')
      .update(`${filePath}:${startLine}`)
      .digest('hex')
      .slice(0, 16);
    return hash;
  }

  private getLanguage(ext: string): string {
    const map: Record<string, string> = {
      '.ts': 'typescript', '.tsx': 'typescript',
      '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
      '.py': 'python', '.pyi': 'python',
      '.rs': 'rust',
      '.go': 'go',
      '.java': 'java', '.kt': 'kotlin', '.kts': 'kotlin',
      '.c': 'c', '.cpp': 'cpp', '.cc': 'cpp', '.h': 'c', '.hpp': 'cpp',
      '.cs': 'csharp',
      '.rb': 'ruby',
      '.php': 'php',
      '.swift': 'swift',
      '.scala': 'scala',
      '.vue': 'vue', '.svelte': 'svelte',
      '.md': 'markdown', '.mdx': 'markdown',
      '.json': 'json', '.yaml': 'yaml', '.yml': 'yaml', '.toml': 'toml',
    };
    return map[ext] || 'text';
  }
}
