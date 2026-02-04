/**
 * Shared fetch patch for Codex endpoints.
 *
 * Ensures requests to ChatGPT Codex use the `/responses` endpoint,
 * injects `store=false`, strips `previous_response_id`, and preserves
 * bun's optional `preconnect` property. Safe to call multiple times.
 */
declare global {
  // Guard to avoid double-patching
  // eslint-disable-next-line no-var
  var __stratus_fetch_patched: boolean | undefined;
}

export function patchGlobalFetch(): void {
  const g: any = globalThis as any;
  if (g.__stratus_fetch_patched) return;

  const originalFetch: any = g.fetch;
  const RequestCtor: any = g.Request;
  if (typeof originalFetch !== 'function' || !RequestCtor) return;

  g.fetch = (input: any, init?: any) => {
    try {
      const req = input instanceof RequestCtor ? input : new RequestCtor(input, init);
      const url = new URL(req.url);

      // Codex: force responses endpoint and normalize payload
      if (url.hostname === 'chatgpt.com' && url.pathname.includes('/backend-api/codex')) {
        url.pathname = '/backend-api/codex/responses';
        const rewritten = new RequestCtor(url.toString(), req);
        let nextInit = init;
        if (nextInit?.body && typeof nextInit.body === 'string') {
          try {
            const body = JSON.parse(nextInit.body);
            if (body.store === undefined) {
              body.store = false;
            }
            if ('previous_response_id' in body) {
              delete (body as any).previous_response_id;
            }
            nextInit = { ...nextInit, body: JSON.stringify(body) };
          } catch {
            // Ignore JSON parse errors and fall back to original body
          }
        }
        return originalFetch(rewritten, nextInit);
      }
    } catch {
      // Fall through to original fetch on any error
    }
    return originalFetch(input, init);
  };

  // Preserve optional preconnect (bun)
  (g.fetch as any).preconnect = (originalFetch as any)?.preconnect;
  g.__stratus_fetch_patched = true;
}

export {}; // ensure this file is treated as a module
