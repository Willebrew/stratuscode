/**
 * Database Module Tests
 *
 * Tests for getDataDir, initDatabase idempotency,
 * getDatabase auto-init, closeDatabase cleanup, and table schema.
 */

import { describe, test, expect, afterAll } from 'bun:test';
import * as os from 'os';
import * as path from 'path';
import { getDataDir, initDatabase, getDatabase, closeDatabase } from './database';

const testDir = `/tmp/stratuscode-database-test-${Date.now()}`;

// ============================================
// getDataDir
// ============================================

describe('getDataDir', () => {
  test('returns a non-empty string', () => {
    const dir = getDataDir();
    expect(typeof dir).toBe('string');
    expect(dir.length).toBeGreaterThan(0);
  });

  test('returns same value on subsequent calls (cached)', () => {
    const dir1 = getDataDir();
    const dir2 = getDataDir();
    expect(dir1).toBe(dir2);
  });

  test('returns the custom dataDir after initDatabase is called with config', () => {
    // Close any existing database first so initDatabase will accept new config
    closeDatabase();
    // Re-initialize with our test directory
    initDatabase({ dataDir: testDir });
    const dir = getDataDir();
    expect(dir).toBe(testDir);
  });
});

// ============================================
// initDatabase
// ============================================

describe('initDatabase', () => {
  afterAll(() => {
    closeDatabase();
  });

  test('initializes and returns a database instance', () => {
    closeDatabase();
    const db = initDatabase({ dataDir: testDir });
    expect(db).toBeDefined();
    // The database should respond to queries
    const result = db.query('SELECT 1 as val').get() as { val: number };
    expect(result.val).toBe(1);
  });

  test('returns same instance on second call (idempotent)', () => {
    const db1 = initDatabase({ dataDir: testDir });
    const db2 = initDatabase({ dataDir: '/tmp/different-dir' });
    // Should return the cached instance, ignoring the new config
    expect(db1).toBe(db2);
  });

  test('creates required tables', () => {
    const db = getDatabase();
    // Check that all expected tables exist
    const tables = db
      .query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const tableNames = tables.map(t => t.name);

    expect(tableNames).toContain('sessions');
    expect(tableNames).toContain('messages');
    expect(tableNames).toContain('message_parts');
    expect(tableNames).toContain('tool_calls');
    expect(tableNames).toContain('todos');
    expect(tableNames).toContain('pending_questions');
    expect(tableNames).toContain('error_memories');
  });

  test('creates required indexes', () => {
    const db = getDatabase();
    const indexes = db
      .query("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name")
      .all() as { name: string }[];
    const indexNames = indexes.map(i => i.name);

    expect(indexNames).toContain('idx_sessions_project');
    expect(indexNames).toContain('idx_sessions_updated');
    expect(indexNames).toContain('idx_messages_session');
    expect(indexNames).toContain('idx_message_parts_message');
    expect(indexNames).toContain('idx_tool_calls_message');
    expect(indexNames).toContain('idx_todos_session');
    expect(indexNames).toContain('idx_pending_questions_session');
    expect(indexNames).toContain('idx_error_memories_project');
    expect(indexNames).toContain('idx_error_memories_hash');
  });

  test('WAL mode is enabled', () => {
    const db = getDatabase();
    const result = db.query('PRAGMA journal_mode').get() as { journal_mode: string };
    expect(result.journal_mode).toBe('wal');
  });
});

// ============================================
// getDatabase
// ============================================

describe('getDatabase', () => {
  test('returns initialized database', () => {
    const db = getDatabase();
    expect(db).toBeDefined();
    const result = db.query('SELECT 1 as val').get() as { val: number };
    expect(result.val).toBe(1);
  });
});

// ============================================
// closeDatabase
// ============================================

describe('closeDatabase', () => {
  test('closes the database without error', () => {
    expect(() => closeDatabase()).not.toThrow();
  });

  test('calling closeDatabase twice does not throw', () => {
    // Already closed above, calling again should be a no-op
    expect(() => closeDatabase()).not.toThrow();
  });

  test('getDatabase re-initializes after close', () => {
    // After close, getDatabase should auto-init a new instance
    const db = getDatabase();
    expect(db).toBeDefined();
    const result = db.query('SELECT 1 as val').get() as { val: number };
    expect(result.val).toBe(1);
    // Clean up
    closeDatabase();
  });
});
