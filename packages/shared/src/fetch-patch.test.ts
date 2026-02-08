import { describe, expect, test, beforeEach } from 'bun:test';

// Reset the patch guard before each test
beforeEach(() => {
  (globalThis as any).__stratus_fetch_patched = undefined;
});

import { patchGlobalFetch } from './fetch-patch';

describe('fetch-patch: patchGlobalFetch', () => {
  test('patches globalThis.fetch and sets guard', () => {
    const originalFetch = globalThis.fetch;
    patchGlobalFetch();
    expect((globalThis as any).__stratus_fetch_patched).toBe(true);
    // Restore
    globalThis.fetch = originalFetch;
    (globalThis as any).__stratus_fetch_patched = undefined;
  });

  test('is idempotent (no-ops on second call)', () => {
    const originalFetch = globalThis.fetch;
    patchGlobalFetch();
    const patchedFetch = globalThis.fetch;
    patchGlobalFetch(); // second call
    expect(globalThis.fetch).toBe(patchedFetch); // same reference
    globalThis.fetch = originalFetch;
    (globalThis as any).__stratus_fetch_patched = undefined;
  });

  test('non-codex requests pass through unchanged', async () => {
    const originalFetch = globalThis.fetch;
    let capturedUrl: string | undefined;
    const mockFetch = (input: any, init?: any) => {
      const req = input instanceof Request ? input : new Request(input, init);
      capturedUrl = req.url;
      return Promise.resolve(new Response('ok'));
    };
    (mockFetch as any).preconnect = undefined;
    globalThis.fetch = mockFetch as any;

    patchGlobalFetch();
    await globalThis.fetch('https://example.com/api/test');
    expect(capturedUrl).toContain('example.com');

    globalThis.fetch = originalFetch;
    (globalThis as any).__stratus_fetch_patched = undefined;
  });

  test('codex requests get rewritten to /responses endpoint', async () => {
    const originalFetch = globalThis.fetch;
    let capturedUrl: string | undefined;
    let capturedBody: string | undefined;
    const mockFetch = (input: any, init?: any) => {
      if (input instanceof Request) {
        capturedUrl = input.url;
      } else {
        capturedUrl = typeof input === 'string' ? input : input.url;
      }
      capturedBody = init?.body;
      return Promise.resolve(new Response('ok'));
    };
    (mockFetch as any).preconnect = undefined;
    globalThis.fetch = mockFetch as any;

    patchGlobalFetch();
    await globalThis.fetch('https://chatgpt.com/backend-api/codex/chat', {
      method: 'POST',
      body: JSON.stringify({ model: 'gpt-5' }),
    });

    // URL should be rewritten to /responses
    expect(capturedUrl).toContain('/backend-api/codex/responses');

    globalThis.fetch = originalFetch;
    (globalThis as any).__stratus_fetch_patched = undefined;
  });

  test('codex requests inject store=false and strip previous_response_id', async () => {
    const originalFetch = globalThis.fetch;
    let capturedBody: string | undefined;
    const mockFetch = (input: any, init?: any) => {
      capturedBody = init?.body;
      return Promise.resolve(new Response('ok'));
    };
    (mockFetch as any).preconnect = undefined;
    globalThis.fetch = mockFetch as any;

    patchGlobalFetch();
    await globalThis.fetch('https://chatgpt.com/backend-api/codex/chat', {
      method: 'POST',
      body: JSON.stringify({ model: 'gpt-5', previous_response_id: 'resp-123' }),
    });

    expect(capturedBody).toBeDefined();
    const parsed = JSON.parse(capturedBody!);
    expect(parsed.store).toBe(false);
    expect(parsed.previous_response_id).toBeUndefined();

    globalThis.fetch = originalFetch;
    (globalThis as any).__stratus_fetch_patched = undefined;
  });

  test('preserves preconnect property from original fetch', () => {
    const originalFetch = globalThis.fetch;
    const mockPreconnect = () => {};
    const mockFetch = (() => Promise.resolve(new Response('ok'))) as any;
    mockFetch.preconnect = mockPreconnect;
    globalThis.fetch = mockFetch;

    patchGlobalFetch();
    expect((globalThis.fetch as any).preconnect).toBe(mockPreconnect);

    globalThis.fetch = originalFetch;
    (globalThis as any).__stratus_fetch_patched = undefined;
  });
});
