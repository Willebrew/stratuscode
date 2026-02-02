/**
 * CodeSearch Tool
 *
 * Semantic code search using local embeddings (Ollama + Qdrant).
 */

import { defineTool } from './sage-adapter';
import { CodebaseIndexer } from './lib/embeddings/indexer';

export interface CodeSearchArgs extends Record<string, unknown> {
  query: string;
  maxResults?: number;
  reindex?: boolean;
}

// Cache indexers per project
const indexerCache = new Map<string, CodebaseIndexer>();

function getIndexer(projectDir: string): CodebaseIndexer {
  let indexer = indexerCache.get(projectDir);
  if (!indexer) {
    indexer = new CodebaseIndexer({ projectDir });
    indexerCache.set(projectDir, indexer);
  }
  return indexer;
}

export const codesearchTool = defineTool<CodeSearchArgs>({
  name: 'codesearch',
  description: `Semantic code search using local embeddings.

Searches the codebase using natural language queries to find relevant code.
Uses Ollama (embeddinggemma) for embeddings and Qdrant for vector storage.

Use this for:
- Finding code related to a concept ("authentication logic")
- Locating implementations ("error handling for API calls")
- Understanding patterns ("how state is managed")

Parameters:
- query: Natural language description of what you're looking for
- maxResults: Maximum results to return (default: 5)
- reindex: Force reindexing of the codebase (use sparingly)

Returns code snippets with file paths and line numbers, ranked by relevance.`,
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Natural language search query',
      },
      maxResults: {
        type: 'number',
        description: 'Maximum results to return (default: 5, range: 1-20)',
      },
      reindex: {
        type: 'boolean',
        description: 'Force reindex the codebase',
      },
    },
    required: ['query'],
  },
  timeout: 60000, // 1 minute for search (indexing may take longer)

  async execute(args, context) {
    const { query, maxResults = 5, reindex = false } = args;
    const projectDir = context.projectDir;

    const indexer = getIndexer(projectDir);

    // Check dependencies
    const deps = await indexer.checkDependencies();
    if (!deps.ollama) {
      return JSON.stringify({
        error: 'Ollama not available',
        message: 'Please ensure Ollama is running at localhost:11434',
      });
    }
    if (!deps.qdrant) {
      return JSON.stringify({
        error: 'Qdrant not available',
        message: 'Please ensure Qdrant is running at localhost:6333',
      });
    }

    // Check if we need to index
    const stats = await indexer.getStats();
    const needsIndex = reindex || !stats || stats.pointsCount === 0;

    if (needsIndex) {
      try {
        await indexer.initialize();
        const indexStats = await indexer.indexAll();
        
        if (indexStats.chunksCreated === 0) {
          return JSON.stringify({
            error: 'No files indexed',
            message: 'No supported files found in the project directory',
          });
        }
      } catch (error) {
        return JSON.stringify({
          error: 'Indexing failed',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Search
    try {
      const results = await indexer.search(query, maxResults);
      
      return JSON.stringify({
        query,
        results: results.map(r => ({
          filePath: r.chunk.filePath,
          startLine: r.chunk.startLine,
          endLine: r.chunk.endLine,
          content: r.chunk.content,
          language: r.chunk.language,
          score: r.score,
        })),
        totalResults: results.length,
      });
    } catch (error) {
      return JSON.stringify({
        error: 'Search failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  },
});
