/**
 * Tool Result Cache
 *
 * Hash-based caching for read operations.
 */

import * as fs from 'fs';
import * as crypto from 'crypto';

// ============================================
// Types
// ============================================

export interface CacheEntry {
  hash: string;
  result: string;
  timestamp: number;
  mtime?: number;
}

export interface CacheConfig {
  maxEntries: number;
  ttlMs: number;
  enableFileMtime: boolean;
}

// ============================================
// Default Config
// ============================================

export const DEFAULT_CACHE_CONFIG: CacheConfig = {
  maxEntries: 100,
  ttlMs: 5 * 60 * 1000, // 5 minutes
  enableFileMtime: true,
};

// ============================================
// Tool Cache
// ============================================

export class ToolCache {
  private cache: Map<string, CacheEntry> = new Map();
  private config: CacheConfig;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CACHE_CONFIG, ...config };
  }

  /**
   * Get a cached result
   */
  get(tool: string, args: Record<string, unknown>): string | null {
    const key = this.buildKey(tool, args);
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check TTL
    if (Date.now() - entry.timestamp > this.config.ttlMs) {
      this.cache.delete(key);
      return null;
    }

    // Check file mtime if enabled
    if (this.config.enableFileMtime && entry.mtime !== undefined) {
      const filePath = this.extractFilePath(args);
      if (filePath) {
        try {
          const stats = fs.statSync(filePath);
          if (stats.mtimeMs > entry.mtime) {
            this.cache.delete(key);
            return null;
          }
        } catch {
          // File doesn't exist or can't be accessed
          this.cache.delete(key);
          return null;
        }
      }
    }

    return entry.result;
  }

  /**
   * Set a cached result
   */
  set(tool: string, args: Record<string, unknown>, result: string): void {
    // Enforce max entries
    if (this.cache.size >= this.config.maxEntries) {
      this.evictOldest();
    }

    const key = this.buildKey(tool, args);
    let mtime: number | undefined;

    // Get file mtime if applicable
    if (this.config.enableFileMtime) {
      const filePath = this.extractFilePath(args);
      if (filePath) {
        try {
          const stats = fs.statSync(filePath);
          mtime = stats.mtimeMs;
        } catch {
          // Ignore
        }
      }
    }

    this.cache.set(key, {
      hash: key,
      result,
      timestamp: Date.now(),
      mtime,
    });
  }

  /**
   * Invalidate a cache entry
   */
  invalidate(tool: string, args: Record<string, unknown>): void {
    const key = this.buildKey(tool, args);
    this.cache.delete(key);
  }

  /**
   * Invalidate all entries for a file path
   */
  invalidateFile(filePath: string): void {
    for (const [key, entry] of this.cache) {
      if (key.includes(filePath)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear the entire cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache stats
   */
  getStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.config.maxEntries,
    };
  }

  /**
   * Build a cache key from tool name and arguments
   */
  private buildKey(tool: string, args: Record<string, unknown>): string {
    const sortedArgs = JSON.stringify(args, Object.keys(args).sort());
    const hash = crypto.createHash('md5').update(`${tool}:${sortedArgs}`).digest('hex');
    return hash;
  }

  /**
   * Extract file path from common tool arguments
   */
  private extractFilePath(args: Record<string, unknown>): string | null {
    const pathKeys = ['file_path', 'path', 'directory_path', 'search_path'];
    for (const key of pathKeys) {
      if (typeof args[key] === 'string') {
        return args[key] as string;
      }
    }
    return null;
  }

  /**
   * Evict the oldest cache entry
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }
}

/**
 * Create a new tool cache
 */
export function createToolCache(config?: Partial<CacheConfig>): ToolCache {
  return new ToolCache(config);
}

/**
 * Check if a tool is cacheable
 */
export function isCacheableTool(toolName: string): boolean {
  const cacheableTools = ['read', 'ls', 'grep', 'glob'];
  return cacheableTools.includes(toolName);
}
