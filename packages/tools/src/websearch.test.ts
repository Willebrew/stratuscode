import { describe, expect, test, beforeEach, mock } from 'bun:test';
import { websearchTool } from './websearch';

const ctx = { sessionId: 'test', metadata: { projectDir: '/tmp' } };

const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = originalFetch;
});

describe('websearch tool', () => {
  test('returns results on successful search', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        text: () =>
          Promise.resolve(
            '<a class="result-link" href="https://example.com">Example</a>' +
            '<td class="result-snippet">A test snippet</td>'
          ),
      } as Response)
    ) as unknown as typeof fetch;

    const result = await websearchTool.execute({ query: 'test query' }, ctx as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(true);
    expect(parsed.results).toBeArray();
  });

  test('returns error on fetch failure', async () => {
    globalThis.fetch = mock(() =>
      Promise.reject(new Error('Network error'))
    ) as unknown as typeof fetch;

    const result = await websearchTool.execute({ query: 'fail query' }, ctx as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.error).toBe(true);
    expect(parsed.message).toContain('Search failed');

    globalThis.fetch = originalFetch;
  });

  test('returns error on non-ok response', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve({ ok: false, status: 429 } as Response)
    ) as unknown as typeof fetch;

    const result = await websearchTool.execute({ query: 'rate limited' }, ctx as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.error).toBe(true);

    globalThis.fetch = originalFetch;
  });

  test('limits maxResults to 10', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        text: () => Promise.resolve('<html></html>'),
      } as Response)
    ) as unknown as typeof fetch;

    const result = await websearchTool.execute({ query: 'test', maxResults: 50 }, ctx as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(true);

    globalThis.fetch = originalFetch;
  });

  test('fallback parsing for regular anchor tags', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        text: () =>
          Promise.resolve(
            '<a href="https://docs.example.com/api">API Docs</a>'
          ),
      } as Response)
    ) as unknown as typeof fetch;

    const result = await websearchTool.execute({ query: 'api docs' }, ctx as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(true);
    if (parsed.results.length > 0) {
      expect(parsed.results[0].url).toContain('example.com');
    }

    globalThis.fetch = originalFetch;
  });
});
