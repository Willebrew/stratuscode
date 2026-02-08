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

describe('webfetch tool: edge cases', () => {
  test('handles invalid JSON with application/json content type', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve('this is not json {{{'),
      } as Response)
    ) as unknown as typeof fetch;

    const result = await webfetchTool.execute({ url: 'https://api.example.com/data' }, ctx as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(true);
    // Falls back to raw text when JSON parse fails
    expect(parsed.content).toBe('this is not json {{{');

    globalThis.fetch = originalFetch;
  });

  test('decodes numeric HTML entities', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        headers: new Headers({ 'content-type': 'text/html' }),
        text: () =>
          Promise.resolve('<html><body><p>A &#38; B &#60; C &#x3e; D</p></body></html>'),
      } as Response)
    ) as unknown as typeof fetch;

    const result = await webfetchTool.execute({ url: 'https://example.com' }, ctx as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(true);
    // &#38; = &, &#60; = <, &#x3e; = >
    expect(parsed.content).toContain('A & B < C > D');

    globalThis.fetch = originalFetch;
  });

  test('handles file not found', async () => {
    expect(
      webfetchTool.execute({ url: 'https://example.com/missing' }, ctx as any)
    ).rejects.toThrow();
  });
});
