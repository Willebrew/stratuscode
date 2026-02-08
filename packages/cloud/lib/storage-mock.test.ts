import { describe, expect, test } from 'bun:test';

import { initDatabase, getDatabase } from './storage-mock';

describe('storage-mock', () => {
  test('initDatabase is a no-op that does not throw', () => {
    expect(() => initDatabase()).not.toThrow();
  });

  test('getDatabase returns null', () => {
    expect(getDatabase()).toBeNull();
  });
});
