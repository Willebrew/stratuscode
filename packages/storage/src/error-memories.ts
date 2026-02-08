/**
 * Error Memories Storage
 *
 * SQLite-backed ErrorMemoryStore adapter implementing the SAGE interface.
 * Persists error memories to the `error_memories` table so agents
 * learn from tool failures across sessions.
 */

import { getDatabase, insert, deleteById } from './database';
import type { ErrorMemoryStore, ErrorMemoryEntry } from '@willebrew/sage-core';

// ============================================
// Row Type (internal — maps to DB schema)
// ============================================

interface ErrorMemoryRow {
  id: string;
  project_dir: string | null;
  tool_name: string | null;
  error_pattern: string;
  lesson: string;
  raw_error: string | null;
  error_hash: string;
  occurrence_count: number;
  confidence: number;
  last_occurred_at: number;
  created_at: number;
  tags: string | null;
}

// ============================================
// Conversion
// ============================================

function rowToEntry(row: ErrorMemoryRow): ErrorMemoryEntry {
  return {
    id: row.id,
    scope: row.project_dir,
    toolName: row.tool_name || '',
    errorPattern: row.error_pattern,
    lesson: row.lesson,
    rawError: row.raw_error || '',
    errorHash: row.error_hash,
    occurrenceCount: row.occurrence_count,
    confidence: row.confidence,
    lastOccurredAt: row.last_occurred_at,
    createdAt: row.created_at,
    tags: row.tags ? JSON.parse(row.tags) : [],
  };
}

// ============================================
// SQLiteErrorStore
// ============================================

/**
 * SQLite-backed ErrorMemoryStore implementing the SAGE interface.
 *
 * Maps `scope` to `project_dir` and `ErrorMemoryEntry` to the
 * existing `error_memories` table schema (no migration needed).
 */
export class SQLiteErrorStore implements ErrorMemoryStore {
  async save(entry: ErrorMemoryEntry): Promise<void> {
    const db = getDatabase();

    // Upsert: update if exists, insert if new
    const existing = db.query('SELECT id FROM error_memories WHERE id = ?').get(entry.id) as { id: string } | null;

    if (existing) {
      db.query(`
        UPDATE error_memories SET
          project_dir = ?, tool_name = ?, error_pattern = ?, lesson = ?,
          raw_error = ?, error_hash = ?, occurrence_count = ?, confidence = ?,
          last_occurred_at = ?, tags = ?
        WHERE id = ?
      `).run(
        entry.scope, entry.toolName, entry.errorPattern, entry.lesson,
        entry.rawError, entry.errorHash, entry.occurrenceCount, entry.confidence,
        entry.lastOccurredAt, entry.tags.length > 0 ? JSON.stringify(entry.tags) : null,
        entry.id,
      );
    } else {
      insert('error_memories', {
        id: entry.id,
        project_dir: entry.scope,
        tool_name: entry.toolName,
        error_pattern: entry.errorPattern,
        lesson: entry.lesson,
        raw_error: entry.rawError,
        error_hash: entry.errorHash,
        occurrence_count: entry.occurrenceCount,
        confidence: entry.confidence,
        last_occurred_at: entry.lastOccurredAt,
        created_at: entry.createdAt,
        tags: entry.tags.length > 0 ? JSON.stringify(entry.tags) : null,
      });
    }
  }

  async get(id: string): Promise<ErrorMemoryEntry | null> {
    const db = getDatabase();
    const row = db.query('SELECT * FROM error_memories WHERE id = ?').get(id) as ErrorMemoryRow | null;
    return row ? rowToEntry(row) : null;
  }

  async getByHash(hash: string, scope?: string | null): Promise<ErrorMemoryEntry | null> {
    const db = getDatabase();
    let row: ErrorMemoryRow | null;

    if (scope != null) {
      // Check project-specific first
      row = db.query('SELECT * FROM error_memories WHERE error_hash = ? AND project_dir = ?')
        .get(hash, scope) as ErrorMemoryRow | null;
      if (!row) {
        // Fall back to global
        row = db.query('SELECT * FROM error_memories WHERE error_hash = ? AND project_dir IS NULL')
          .get(hash) as ErrorMemoryRow | null;
      }
    } else {
      row = db.query('SELECT * FROM error_memories WHERE error_hash = ? AND project_dir IS NULL')
        .get(hash) as ErrorMemoryRow | null;
    }

    return row ? rowToEntry(row) : null;
  }

  async delete(id: string): Promise<void> {
    deleteById('error_memories', id);
  }

  async list(scope: string | null, limit: number = 10): Promise<ErrorMemoryEntry[]> {
    const db = getDatabase();
    const now = Date.now();
    const dayMs = 86_400_000;

    // Score: confidence × log2(occurrence_count + 1) × recency_boost
    // recency_boost = 1 / (1 + age_days / 7)
    const stmt = db.query(`
      SELECT *,
        (confidence * (1.0 + LOG2(occurrence_count + 1)) * (1.0 / (1.0 + (? - last_occurred_at) / ? / 7.0))) as score
      FROM error_memories
      WHERE project_dir = ? OR project_dir IS NULL
      ORDER BY score DESC
      LIMIT ?
    `);

    const rows = stmt.all(now, dayMs, scope, limit) as ErrorMemoryRow[];
    return rows.map(rowToEntry);
  }

  async search(query: string, scope?: string | null, limit: number = 10): Promise<ErrorMemoryEntry[]> {
    const db = getDatabase();
    const pattern = `%${query}%`;

    let sql: string;
    let params: (string | number | null)[];

    if (scope != null) {
      sql = `
        SELECT * FROM error_memories
        WHERE (project_dir = ? OR project_dir IS NULL)
          AND (lesson LIKE ? OR error_pattern LIKE ? OR tags LIKE ?)
        ORDER BY confidence DESC, occurrence_count DESC
        LIMIT ?
      `;
      params = [scope, pattern, pattern, pattern, limit];
    } else {
      sql = `
        SELECT * FROM error_memories
        WHERE lesson LIKE ? OR error_pattern LIKE ? OR tags LIKE ?
        ORDER BY confidence DESC, occurrence_count DESC
        LIMIT ?
      `;
      params = [pattern, pattern, pattern, limit];
    }

    const rows = db.query(sql).all(...params) as ErrorMemoryRow[];
    return rows.map(rowToEntry);
  }

  async prune(options?: { maxAgeDays?: number; minConfidence?: number }): Promise<number> {
    const db = getDatabase();
    const maxAge = (options?.maxAgeDays ?? 90) * 86_400_000;
    const minConfidence = options?.minConfidence ?? 0.2;
    const cutoff = Date.now() - maxAge;

    const r1 = db.query('DELETE FROM error_memories WHERE confidence < ?').run(minConfidence);
    const r2 = db.query(
      'DELETE FROM error_memories WHERE last_occurred_at < ? AND occurrence_count < 3'
    ).run(cutoff);

    return (r1.changes || 0) + (r2.changes || 0);
  }

  async applyDecay(halfLifeDays: number = 30): Promise<number> {
    const db = getDatabase();
    const now = Date.now();
    const dayMs = 86_400_000;
    // decay = exp(-age / (halfLife × 1.44))
    // 1.44 ≈ 1/ln(2), so half-life is accurate
    const lambda = 1.0 / (halfLifeDays * 1.44 * dayMs);

    const rows = db.query('SELECT id, confidence, last_occurred_at FROM error_memories').all() as Array<{
      id: string;
      confidence: number;
      last_occurred_at: number;
    }>;

    let updated = 0;
    const updateStmt = db.query('UPDATE error_memories SET confidence = ? WHERE id = ?');

    for (const row of rows) {
      const age = now - row.last_occurred_at;
      const decayFactor = Math.exp(-lambda * age);
      const newConfidence = Math.max(0, row.confidence * decayFactor);

      if (Math.abs(newConfidence - row.confidence) > 0.001) {
        updateStmt.run(newConfidence, row.id);
        updated++;
      }
    }

    return updated;
  }
}
