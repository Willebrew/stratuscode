/**
 * Error Memories Store Tests
 *
 * Tests for SQLiteErrorStore — CRUD, search, prune, and decay operations.
 * Uses real SQLite via initDatabase with temp directory.
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { initDatabase, closeDatabase } from './database';
import { SQLiteErrorStore } from './error-memories';
import type { ErrorMemoryEntry } from '@willebrew/sage-core';

const testDir = `/tmp/stratuscode-error-memories-test-${Date.now()}`;
let store: SQLiteErrorStore;

beforeAll(() => {
  initDatabase({ dataDir: testDir });
  store = new SQLiteErrorStore();
});

afterAll(() => {
  closeDatabase();
});

function createEntry(overrides?: Partial<ErrorMemoryEntry>): ErrorMemoryEntry {
  const now = Date.now();
  return {
    id: `err-${Math.random().toString(36).slice(2, 8)}`,
    scope: '/test/project',
    toolName: 'bash',
    errorPattern: 'command_not_found',
    lesson: 'Use the full path to the command.',
    rawError: 'bash: foo: command not found',
    errorHash: `hash-${Math.random().toString(36).slice(2, 8)}`,
    occurrenceCount: 1,
    confidence: 0.9,
    lastOccurredAt: now,
    createdAt: now,
    tags: ['bash', 'command'],
    ...overrides,
  };
}

// ============================================
// save + get
// ============================================

describe('save and get', () => {
  test('save and retrieve entry by ID', async () => {
    const entry = createEntry({ id: 'err-get-1' });
    await store.save(entry);

    const retrieved = await store.get('err-get-1');
    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe('err-get-1');
    expect(retrieved!.lesson).toBe(entry.lesson);
    expect(retrieved!.toolName).toBe('bash');
    expect(retrieved!.tags).toEqual(['bash', 'command']);
  });

  test('get returns null for non-existent ID', async () => {
    const result = await store.get('non-existent-id');
    expect(result).toBeNull();
  });

  test('save updates existing entry (upsert)', async () => {
    const entry = createEntry({ id: 'err-upsert-1', lesson: 'Original lesson' });
    await store.save(entry);

    const updated = { ...entry, lesson: 'Updated lesson', occurrenceCount: 2 };
    await store.save(updated);

    const retrieved = await store.get('err-upsert-1');
    expect(retrieved!.lesson).toBe('Updated lesson');
    expect(retrieved!.occurrenceCount).toBe(2);
  });

  test('save handles empty tags', async () => {
    const entry = createEntry({ id: 'err-no-tags', tags: [] });
    await store.save(entry);

    const retrieved = await store.get('err-no-tags');
    expect(retrieved!.tags).toEqual([]);
  });
});

// ============================================
// getByHash
// ============================================

describe('getByHash', () => {
  test('finds entry by hash and scope', async () => {
    const entry = createEntry({
      id: 'err-hash-1',
      errorHash: 'unique-hash-1',
      scope: '/project/a',
    });
    await store.save(entry);

    const result = await store.getByHash('unique-hash-1', '/project/a');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('err-hash-1');
  });

  test('falls back to global when project-specific not found', async () => {
    const globalEntry = createEntry({
      id: 'err-hash-global',
      errorHash: 'global-hash-1',
      scope: null,
    });
    await store.save(globalEntry);

    const result = await store.getByHash('global-hash-1', '/some/project');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('err-hash-global');
  });

  test('returns null when hash not found', async () => {
    const result = await store.getByHash('nonexistent-hash');
    expect(result).toBeNull();
  });
});

// ============================================
// delete
// ============================================

describe('delete', () => {
  test('deletes entry by ID', async () => {
    const entry = createEntry({ id: 'err-delete-1' });
    await store.save(entry);
    expect(await store.get('err-delete-1')).not.toBeNull();

    await store.delete('err-delete-1');
    expect(await store.get('err-delete-1')).toBeNull();
  });
});

// ============================================
// list
// ============================================

describe('list', () => {
  test('lists entries for a scope ordered by score', async () => {
    const scope = `/list-test-${Date.now()}`;
    const e1 = createEntry({ id: 'err-list-1', scope, confidence: 0.9, occurrenceCount: 5 });
    const e2 = createEntry({ id: 'err-list-2', scope, confidence: 0.3, occurrenceCount: 1 });
    await store.save(e1);
    await store.save(e2);

    const results = await store.list(scope, 10);
    expect(results.length).toBeGreaterThanOrEqual(2);
    // Higher confidence/occurrence should rank first
    const ids = results.map(r => r.id);
    expect(ids.indexOf('err-list-1')).toBeLessThan(ids.indexOf('err-list-2'));
  });

  test('respects limit', async () => {
    const scope = `/list-limit-${Date.now()}`;
    for (let i = 0; i < 5; i++) {
      await store.save(createEntry({ id: `err-lim-${i}`, scope }));
    }

    const results = await store.list(scope, 2);
    expect(results.length).toBe(2);
  });
});

// ============================================
// search
// ============================================

describe('search', () => {
  test('finds entries by lesson keyword', async () => {
    const scope = `/search-test-${Date.now()}`;
    await store.save(createEntry({
      id: 'err-search-1',
      scope,
      lesson: 'Use npm install instead of yarn add',
    }));
    await store.save(createEntry({
      id: 'err-search-2',
      scope,
      lesson: 'Check file permissions first',
    }));

    const results = await store.search('npm install', scope, 10);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some(r => r.id === 'err-search-1')).toBe(true);
  });

  test('finds entries by error pattern', async () => {
    const scope = `/search-pattern-${Date.now()}`;
    await store.save(createEntry({
      id: 'err-search-p1',
      scope,
      errorPattern: 'permission_denied',
    }));

    const results = await store.search('permission_denied', scope, 10);
    expect(results.some(r => r.id === 'err-search-p1')).toBe(true);
  });

  test('returns empty for no matches', async () => {
    const results = await store.search('zzz-no-match-zzz', null, 10);
    expect(results).toEqual([]);
  });
});

// ============================================
// prune
// ============================================

describe('prune', () => {
  test('removes low-confidence entries', async () => {
    const entry = createEntry({
      id: 'err-prune-low',
      confidence: 0.05,
      scope: `/prune-test-${Date.now()}`,
    });
    await store.save(entry);

    const pruned = await store.prune({ minConfidence: 0.1 });
    expect(pruned).toBeGreaterThanOrEqual(1);
    expect(await store.get('err-prune-low')).toBeNull();
  });

  test('removes old low-occurrence entries', async () => {
    const oldTime = Date.now() - 200 * 86400000; // 200 days ago
    const entry = createEntry({
      id: 'err-prune-old',
      lastOccurredAt: oldTime,
      occurrenceCount: 1,
      confidence: 0.5,
      scope: `/prune-old-${Date.now()}`,
    });
    await store.save(entry);

    const pruned = await store.prune({ maxAgeDays: 90 });
    expect(pruned).toBeGreaterThanOrEqual(1);
    expect(await store.get('err-prune-old')).toBeNull();
  });
});

// ============================================
// applyDecay
// ============================================

describe('applyDecay', () => {
  test('decays old entries', async () => {
    const oldTime = Date.now() - 60 * 86400000; // 60 days ago
    const entry = createEntry({
      id: 'err-decay-1',
      confidence: 0.9,
      lastOccurredAt: oldTime,
    });
    await store.save(entry);

    const updated = await store.applyDecay(30);
    expect(updated).toBeGreaterThanOrEqual(1);

    const decayed = await store.get('err-decay-1');
    expect(decayed!.confidence).toBeLessThan(0.9);
  });

  test('does not decay very recent entries', async () => {
    const entry = createEntry({
      id: 'err-decay-recent',
      confidence: 0.9,
      lastOccurredAt: Date.now(),
    });
    await store.save(entry);

    await store.applyDecay(30);

    const result = await store.get('err-decay-recent');
    // Should be very close to original — within 0.01
    expect(Math.abs(result!.confidence - 0.9)).toBeLessThan(0.01);
  });
});
