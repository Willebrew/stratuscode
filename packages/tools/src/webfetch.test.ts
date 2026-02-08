import { describe, expect, test, beforeEach, mock } from 'bun:test';
import { webfetchTool } from './webfetch';

const ctx = { sessionId: 'test', metadata: { projectDir: '/tmp' } };

const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = originalFetch;
});

describe('webfetch tool', () => {
  test('throws for invalid URL', async () => {
    expect(
      webfetchTool.execute({ url: 'not-a-url' }, ctx as any)
    ).rejects.toThrow('Invalid URL');
  });

  test('throws for unsupported protocol', async () => {
    expect(
      webfetchTool.execute({ url: 'ftp://example.com/file' }, ctx as any)
    ).rejects.toThrow('Unsupported protocol');
  });

  test('fetches plain text content', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        headers: new Headers({ 'content-type': 'text/plain' }),
        text: () => Promise.resolve('Hello world'),
      } as Response)
    ) as unknown as typeof fetch;

    const result = await webfetchTool.execute({ url: 'https://example.com/test.txt' }, ctx as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(true);
    expect(parsed.content).toBe('Hello world');
    expect(parsed.truncated).toBe(false);

    globalThis.fetch = originalFetch;
  });

  test('extracts text from HTML', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        headers: new Headers({ 'content-type': 'text/html' }),
        text: () =>
          Promise.resolve('<html><body><p>Paragraph one</p><script>evil()</script><p>Paragraph two</p></body></html>'),
      } as Response)
    ) as unknown as typeof fetch;

    const result = await webfetchTool.execute({ url: 'https://example.com' }, ctx as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(true);
    expect(parsed.content).toContain('Paragraph one');
    expect(parsed.content).toContain('Paragraph two');
    expect(parsed.content).not.toContain('evil()');

    globalThis.fetch = originalFetch;
  });

  test('handles JSON content', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve('{"key":"value"}'),
      } as Response)
    ) as unknown as typeof fetch;

    const result = await webfetchTool.execute({ url: 'https://api.example.com/data' }, ctx as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(true);
    expect(parsed.content).toContain('"key"');

    globalThis.fetch = originalFetch;
  });

  test('truncates long content', async () => {
    const longContent = 'x'.repeat(100);
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        headers: new Headers({ 'content-type': 'text/plain' }),
        text: () => Promise.resolve(longContent),
      } as Response)
    ) as unknown as typeof fetch;

    const result = await webfetchTool.execute({ url: 'https://example.com', maxLength: 50 }, ctx as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.truncated).toBe(true);
    expect(parsed.content).toContain('[truncated]');

    globalThis.fetch = originalFetch;
  });

  test('returns error on HTTP failure', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as Response)
    ) as unknown as typeof fetch;

    const result = await webfetchTool.execute({ url: 'https://example.com/missing' }, ctx as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.error).toBe(true);
    expect(parsed.message).toContain('404');

    globalThis.fetch = originalFetch;
  });

  test('returns error on network failure', async () => {
    globalThis.fetch = mock(() =>
      Promise.reject(new Error('ECONNREFUSED'))
    ) as unknown as typeof fetch;

    const result = await webfetchTool.execute({ url: 'https://example.com' }, ctx as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.error).toBe(true);
    expect(parsed.message).toContain('ECONNREFUSED');

    globalThis.fetch = originalFetch;
  });
});
