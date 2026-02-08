import { describe, expect, test, mock, beforeEach, afterEach } from 'bun:test';

// Mock next/headers before importing codex-auth
const mockCookieStore = {
  get: mock(() => undefined as { value: string } | undefined),
  set: mock(() => {}),
  delete: mock(() => {}),
};

mock.module('next/headers', () => ({
  cookies: () => Promise.resolve(mockCookieStore),
}));

import {
  getCodexTokens,
  saveCodexTokens,
  clearCodexTokens,
  savePkceVerifier,
  getPkceVerifier,
  initiateCodexAuth,
  exchangeCodexCode,
  initiateCodexDeviceAuth,
  pollCodexDeviceAuth,
  type CodexTokens,
} from './codex-auth';

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  mockCookieStore.get.mockReset();
  mockCookieStore.set.mockReset();
  mockCookieStore.delete.mockReset();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ============================================
// Cookie-based token functions
// ============================================

describe('codex-auth: getCodexTokens', () => {
  test('returns null when no cookie exists', async () => {
    mockCookieStore.get.mockReturnValue(undefined);
    const tokens = await getCodexTokens();
    expect(tokens).toBeNull();
  });

  test('returns tokens from cookie when not expired', async () => {
    const stored: CodexTokens = {
      accessToken: 'at-123',
      refreshToken: 'rt-456',
      expiresAt: Date.now() + 60_000,
    };
    mockCookieStore.get.mockReturnValue({ value: JSON.stringify(stored) });
    const tokens = await getCodexTokens();
    expect(tokens).toBeDefined();
    expect(tokens!.accessToken).toBe('at-123');
  });

  test('attempts refresh when token is expired', async () => {
    const stored: CodexTokens = {
      accessToken: 'old-at',
      refreshToken: 'rt-456',
      expiresAt: Date.now() - 10_000,
    };
    mockCookieStore.get.mockReturnValue({ value: JSON.stringify(stored) });

    // Mock fetch for refresh — return failure
    globalThis.fetch = mock(() =>
      Promise.resolve({ ok: false, status: 401 } as Response)
    ) as unknown as typeof fetch;

    const tokens = await getCodexTokens();
    expect(tokens).toBeNull();
    // Should have tried to clear cookies
    expect(mockCookieStore.delete).toHaveBeenCalled();
  });

  test('returns refreshed tokens on successful refresh', async () => {
    const stored: CodexTokens = {
      accessToken: 'old-at',
      refreshToken: 'rt-456',
      expiresAt: Date.now() - 10_000,
    };
    mockCookieStore.get.mockReturnValue({ value: JSON.stringify(stored) });

    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'new-at',
            refresh_token: 'new-rt',
            expires_in: 3600,
          }),
      } as Response)
    ) as unknown as typeof fetch;

    const tokens = await getCodexTokens();
    expect(tokens).toBeDefined();
    expect(tokens!.accessToken).toBe('new-at');
    expect(tokens!.refreshToken).toBe('new-rt');
  });

  test('returns null on parse error', async () => {
    mockCookieStore.get.mockReturnValue({ value: 'not-json' });
    const tokens = await getCodexTokens();
    expect(tokens).toBeNull();
  });
});

describe('codex-auth: saveCodexTokens', () => {
  test('sets cookie with token JSON', async () => {
    const tokens: CodexTokens = {
      accessToken: 'at',
      refreshToken: 'rt',
      expiresAt: Date.now() + 60_000,
    };
    await saveCodexTokens(tokens);
    expect(mockCookieStore.set).toHaveBeenCalled();
  });
});

describe('codex-auth: clearCodexTokens', () => {
  test('deletes the token cookie', async () => {
    await clearCodexTokens();
    expect(mockCookieStore.delete).toHaveBeenCalled();
  });
});

// ============================================
// PKCE helpers
// ============================================

describe('codex-auth: PKCE verifier', () => {
  test('savePkceVerifier sets a cookie', async () => {
    await savePkceVerifier('test-verifier');
    expect(mockCookieStore.set).toHaveBeenCalled();
  });

  test('getPkceVerifier returns and deletes cookie value', async () => {
    mockCookieStore.get.mockReturnValue({ value: 'my-verifier' });
    const verifier = await getPkceVerifier();
    expect(verifier).toBe('my-verifier');
    expect(mockCookieStore.delete).toHaveBeenCalled();
  });

  test('getPkceVerifier returns null when no cookie', async () => {
    mockCookieStore.get.mockReturnValue(undefined);
    const verifier = await getPkceVerifier();
    expect(verifier).toBeNull();
  });
});

// ============================================
// initiateCodexAuth (pure, no cookies/fetch)
// ============================================

describe('codex-auth: initiateCodexAuth', () => {
  test('returns authorizeUrl, state, and codeVerifier', () => {
    const result = initiateCodexAuth('http://localhost:3000/callback');
    expect(result.authorizeUrl).toContain('https://auth.openai.com/oauth/authorize');
    expect(result.authorizeUrl).toContain('response_type=code');
    expect(result.authorizeUrl).toContain('redirect_uri=');
    expect(result.state).toBeTruthy();
    expect(result.codeVerifier).toBeTruthy();
    expect(result.codeVerifier.length).toBeGreaterThan(0);
  });

  test('includes PKCE challenge in URL', () => {
    const result = initiateCodexAuth('http://localhost:3000/cb');
    expect(result.authorizeUrl).toContain('code_challenge=');
    expect(result.authorizeUrl).toContain('code_challenge_method=S256');
  });

  test('includes originator param', () => {
    const result = initiateCodexAuth('http://localhost:3000/cb');
    expect(result.authorizeUrl).toContain('originator=stratuscode');
  });
});

// ============================================
// exchangeCodexCode (fetch-dependent)
// ============================================

describe('codex-auth: exchangeCodexCode', () => {
  test('returns tokens on successful exchange', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'at-new',
            refresh_token: 'rt-new',
            expires_in: 7200,
          }),
      } as Response)
    ) as unknown as typeof fetch;

    const tokens = await exchangeCodexCode('code-123', 'state-456', 'http://localhost:3000/cb', 'verifier');
    expect(tokens).toBeDefined();
    expect(tokens!.accessToken).toBe('at-new');
    expect(tokens!.refreshToken).toBe('rt-new');
    expect(tokens!.expiresAt).toBeGreaterThan(Date.now());
  });

  test('returns null on failed exchange', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve({ ok: false, status: 400 } as Response)
    ) as unknown as typeof fetch;

    const tokens = await exchangeCodexCode('bad-code', 'state', 'http://localhost/cb', 'verifier');
    expect(tokens).toBeNull();
  });

  test('returns null on fetch error', async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error('network error'))) as unknown as typeof fetch;

    const tokens = await exchangeCodexCode('code', 'state', 'http://localhost/cb', 'verifier');
    expect(tokens).toBeNull();
  });

  test('extracts accountId from id_token claims', async () => {
    // Build a fake JWT with claims in the second segment
    const claims = { chatgpt_account_id: 'acct-789' };
    const fakeIdToken = `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;

    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'at',
            refresh_token: 'rt',
            expires_in: 3600,
            id_token: fakeIdToken,
          }),
      } as Response)
    ) as unknown as typeof fetch;

    const tokens = await exchangeCodexCode('code', 'state', 'http://localhost/cb', 'verifier');
    expect(tokens).toBeDefined();
    expect(tokens!.accountId).toBe('acct-789');
  });
});

// ============================================
// initiateCodexDeviceAuth (fetch-dependent)
// ============================================

describe('codex-auth: initiateCodexDeviceAuth', () => {
  test('returns device auth info on success', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            device_auth_id: 'da-123',
            user_code: 'ABCD-1234',
            interval: '5',
          }),
      } as Response)
    ) as unknown as typeof fetch;

    const result = await initiateCodexDeviceAuth();
    expect(result.deviceAuthId).toBe('da-123');
    expect(result.userCode).toBe('ABCD-1234');
    expect(result.verificationUrl).toContain('https://auth.openai.com/codex/device');
    expect(result.interval).toBe(5);
  });

  test('throws on failed request', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve({ ok: false, status: 500 } as Response)
    ) as unknown as typeof fetch;

    expect(initiateCodexDeviceAuth()).rejects.toThrow('Device auth initiation failed');
  });

  test('interval falls back to 5 when parsed as 0 (falsy)', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            device_auth_id: 'da-1',
            user_code: 'X',
            interval: '0',
          }),
      } as Response)
    ) as unknown as typeof fetch;

    // parseInt('0') = 0, 0 || 5 = 5, Math.max(5, 1) = 5
    const result = await initiateCodexDeviceAuth();
    expect(result.interval).toBe(5);
  });
});

// ============================================
// pollCodexDeviceAuth (fetch-dependent)
// ============================================

describe('codex-auth: pollCodexDeviceAuth', () => {
  test('returns null when still pending (403)', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve({ ok: false, status: 403 } as Response)
    ) as unknown as typeof fetch;

    const result = await pollCodexDeviceAuth('da-id', 'user-code');
    expect(result).toBeNull();
  });

  test('returns null when still pending (404)', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve({ ok: false, status: 404 } as Response)
    ) as unknown as typeof fetch;

    const result = await pollCodexDeviceAuth('da-id', 'user-code');
    expect(result).toBeNull();
  });

  test('throws on unexpected error status', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve({ ok: false, status: 500 } as Response)
    ) as unknown as typeof fetch;

    expect(pollCodexDeviceAuth('da-id', 'user-code')).rejects.toThrow('Device auth polling failed');
  });

  test('exchanges code for tokens on success', async () => {
    let callCount = 0;
    globalThis.fetch = mock(() => {
      callCount++;
      if (callCount === 1) {
        // First call: poll returns authorization_code
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              authorization_code: 'auth-code-123',
              code_verifier: 'cv-456',
            }),
        } as Response);
      }
      // Second call: token exchange
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'at-final',
            refresh_token: 'rt-final',
            expires_in: 3600,
          }),
      } as Response);
    }) as unknown as typeof fetch;

    const tokens = await pollCodexDeviceAuth('da-id', 'user-code');
    expect(tokens).toBeDefined();
    expect(tokens!.accessToken).toBe('at-final');
    expect(tokens!.refreshToken).toBe('rt-final');
  });

  test('throws when token exchange fails after successful poll', async () => {
    let callCount = 0;
    globalThis.fetch = mock(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              authorization_code: 'auth-code',
              code_verifier: 'cv',
            }),
        } as Response);
      }
      return Promise.resolve({ ok: false, status: 401 } as Response);
    }) as unknown as typeof fetch;

    expect(pollCodexDeviceAuth('da-id', 'user-code')).rejects.toThrow('Token exchange failed');
  });
});

// ============================================
// AccountId extraction edge cases
// ============================================

describe('codex-auth: accountId extraction edge cases', () => {
  test('extracts accountId from auth claim nested object', async () => {
    const claims = { 'https://api.openai.com/auth': { chatgpt_account_id: 'acct-nested' } };
    const fakeIdToken = `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'at',
            refresh_token: 'rt',
            expires_in: 3600,
            id_token: fakeIdToken,
          }),
      } as Response)
    ) as unknown as typeof fetch;
    const tokens = await exchangeCodexCode('code', 'state', 'http://localhost/cb', 'v');
    expect(tokens!.accountId).toBe('acct-nested');
  });

  test('extracts accountId from organizations array', async () => {
    const claims = { organizations: [{ id: 'org-456' }] };
    const fakeIdToken = `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'at',
            refresh_token: 'rt',
            expires_in: 3600,
            id_token: fakeIdToken,
          }),
      } as Response)
    ) as unknown as typeof fetch;
    const tokens = await exchangeCodexCode('code', 'state', 'http://localhost/cb', 'v');
    expect(tokens!.accountId).toBe('org-456');
  });

  test('returns undefined accountId when no claims match', async () => {
    const claims = { sub: 'user-123', email: 'test@test.com' };
    const fakeIdToken = `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'at',
            refresh_token: 'rt',
            expires_in: 3600,
            id_token: fakeIdToken,
          }),
      } as Response)
    ) as unknown as typeof fetch;
    const tokens = await exchangeCodexCode('code', 'state', 'http://localhost/cb', 'v');
    expect(tokens!.accountId).toBeUndefined();
  });

  test('falls back to access_token when id_token has no accountId', async () => {
    const idClaims = { sub: 'no-account-id' };
    const fakeIdToken = `header.${Buffer.from(JSON.stringify(idClaims)).toString('base64url')}.signature`;
    const atClaims = { chatgpt_account_id: 'acct-from-at' };
    const fakeAccessToken = `header.${Buffer.from(JSON.stringify(atClaims)).toString('base64url')}.signature`;
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: fakeAccessToken,
            refresh_token: 'rt',
            expires_in: 3600,
            id_token: fakeIdToken,
          }),
      } as Response)
    ) as unknown as typeof fetch;
    const tokens = await exchangeCodexCode('code', 'state', 'http://localhost/cb', 'v');
    expect(tokens!.accountId).toBe('acct-from-at');
  });

  test('returns undefined accountId when neither id_token nor access_token present', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            refresh_token: 'rt',
            expires_in: 3600,
          }),
      } as Response)
    ) as unknown as typeof fetch;
    const tokens = await exchangeCodexCode('code', 'state', 'http://localhost/cb', 'v');
    expect(tokens!.accountId).toBeUndefined();
  });

  test('returns undefined accountId for JWT with invalid base64 payload', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'header.!!!invalid!!!.signature',
            refresh_token: 'rt',
            expires_in: 3600,
          }),
      } as Response)
    ) as unknown as typeof fetch;
    const tokens = await exchangeCodexCode('code', 'state', 'http://localhost/cb', 'v');
    expect(tokens!.accountId).toBeUndefined();
  });

  test('returns undefined accountId for non-JWT access_token', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'not-a-jwt',
            refresh_token: 'rt',
            expires_in: 3600,
          }),
      } as Response)
    ) as unknown as typeof fetch;
    const tokens = await exchangeCodexCode('code', 'state', 'http://localhost/cb', 'v');
    expect(tokens!.accountId).toBeUndefined();
  });
});

describe('codex-auth: refresh edge cases', () => {
  test('handles refresh when fetch throws network error', async () => {
    const stored: CodexTokens = {
      accessToken: 'old-at',
      refreshToken: 'rt-456',
      expiresAt: Date.now() - 10_000,
    };
    mockCookieStore.get.mockReturnValue({ value: JSON.stringify(stored) });
    globalThis.fetch = mock(() =>
      Promise.reject(new Error('network failure'))
    ) as unknown as typeof fetch;
    const tokens = await getCodexTokens();
    expect(tokens).toBeNull();
    expect(mockCookieStore.delete).toHaveBeenCalled();
  });
});
