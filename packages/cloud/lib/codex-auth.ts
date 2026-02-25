/**
 * Codex (ChatGPT Pro) OAuth Authentication
 * 
 * Handles OAuth flow with OpenAI for Codex access tokens.
 * Tokens are stored in HTTP-only cookies.
 */

import { cookies } from 'next/headers';

const CODEX_COOKIE_NAME = 'codex_tokens';
const CODEX_PKCE_COOKIE = 'codex_pkce';
const CODEX_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const ISSUER = 'https://auth.openai.com';

export interface CodexTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  accountId?: string;
}

/**
 * Get Codex tokens from the cookie store.
 */
export async function getCodexTokens(): Promise<CodexTokens | null> {
  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get(CODEX_COOKIE_NAME)?.value;
    if (!raw) return null;

    const tokens: CodexTokens = JSON.parse(raw);

    // Check if expired
    if (tokens.expiresAt && tokens.expiresAt < Date.now()) {
      // Try to refresh
      const refreshed = await refreshCodexTokens(tokens.refreshToken);
      if (refreshed) {
        // Save refreshed tokens — but don't lose them if save fails
        // (save can fail in Server Component renders where cookies are read-only)
        try {
          await saveCodexTokens(refreshed);
        } catch {
          // Cookie save failed (e.g. read-only context), still return refreshed tokens
        }
        return refreshed;
      }
      try { await clearCodexTokens(); } catch { /* ignore */ }
      return null;
    }

    return tokens;
  } catch {
    return null;
  }
}

/**
 * Save Codex tokens to an HTTP-only cookie.
 */
export async function saveCodexTokens(tokens: CodexTokens): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(CODEX_COOKIE_NAME, JSON.stringify(tokens), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  });
}

/**
 * Clear Codex tokens from cookies.
 */
export async function clearCodexTokens(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(CODEX_COOKIE_NAME);
}

function parseJwtClaims(token: string): Record<string, unknown> | undefined {
  const parts = token.split('.');
  if (parts.length !== 3) return undefined;
  try {
    return JSON.parse(Buffer.from(parts[1]!, 'base64url').toString());
  } catch {
    return undefined;
  }
}

function extractAccountIdFromClaims(claims: Record<string, unknown>): string | undefined {
  if (typeof claims.chatgpt_account_id === 'string') return claims.chatgpt_account_id;
  const authClaim = claims['https://api.openai.com/auth'] as Record<string, unknown> | undefined;
  if (authClaim && typeof authClaim.chatgpt_account_id === 'string') return authClaim.chatgpt_account_id;
  const orgs = claims.organizations as Array<{ id: string }> | undefined;
  if (orgs?.[0]?.id) return orgs[0].id;
  return undefined;
}

function extractAccountIdFromTokens(tokenJson: Record<string, unknown>): string | undefined {
  const idToken = tokenJson.id_token;
  if (typeof idToken === 'string') {
    const claims = parseJwtClaims(idToken);
    const accountId = claims && extractAccountIdFromClaims(claims);
    if (accountId) return accountId;
  }
  const accessToken = tokenJson.access_token;
  if (typeof accessToken === 'string') {
    const claims = parseJwtClaims(accessToken);
    return claims ? extractAccountIdFromClaims(claims) : undefined;
  }
  return undefined;
}

function generatePKCE(): { codeVerifier: string; challenge: string } {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const codeVerifier = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  const hash = require('crypto').createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, challenge: hash };
}

/**
 * Save the PKCE code verifier in a cookie for the callback to use.
 */
export async function savePkceVerifier(codeVerifier: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(CODEX_PKCE_COOKIE, codeVerifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 10 * 60, // 10 minutes
  });
}

/**
 * Get and clear the PKCE code verifier from the cookie store.
 */
export async function getPkceVerifier(): Promise<string | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(CODEX_PKCE_COOKIE)?.value;
  if (raw) cookieStore.delete(CODEX_PKCE_COOKIE);
  return raw || null;
}

/**
 * Initiate Codex OAuth flow — returns the authorize URL to redirect the user to.
 */
export function initiateCodexAuth(callbackUrl: string): { authorizeUrl: string; state: string; codeVerifier: string } {
  const state = crypto.randomUUID();
  const pkce = generatePKCE();

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CODEX_CLIENT_ID,
    redirect_uri: callbackUrl,
    scope: 'openid profile email offline_access',
    state,
    code_challenge: pkce.challenge,
    code_challenge_method: 'S256',
    id_token_add_organizations: 'true',
    codex_cli_simplified_flow: 'true',
    originator: 'stratuscode',
  });

  const authorizeUrl = `${ISSUER}/oauth/authorize?${params.toString()}`;
  return { authorizeUrl, state, codeVerifier: pkce.codeVerifier };
}

/**
 * Exchange an authorization code for Codex tokens.
 */
export async function exchangeCodexCode(
  code: string,
  _state: string,
  callbackUrl: string,
  codeVerifier: string
): Promise<CodexTokens | null> {
  try {
    const res = await fetch(`${ISSUER}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: CODEX_CLIENT_ID,
        code_verifier: codeVerifier,
        code,
        redirect_uri: callbackUrl,
      }).toString(),
    });

    if (!res.ok) return null;

    const data = await res.json();
    const accountId = extractAccountIdFromTokens(data as Record<string, unknown>);
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
      accountId,
    };
  } catch {
    return null;
  }
}

/**
 * Device Authorization Flow
 * Used by the WebUI since the public OAuth client only allows localhost redirect URIs.
 */

export interface DeviceAuthResponse {
  deviceAuthId: string;
  userCode: string;
  verificationUrl: string;
  interval: number;
}

/**
 * Initiate device authorization — returns a user code for the user to enter at OpenAI.
 */
export async function initiateCodexDeviceAuth(): Promise<DeviceAuthResponse> {
  const res = await fetch(`${ISSUER}/api/accounts/deviceauth/usercode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: CODEX_CLIENT_ID }),
  });

  if (!res.ok) {
    throw new Error(`Device auth initiation failed: ${res.status}`);
  }

  const data = await res.json();
  return {
    deviceAuthId: data.device_auth_id,
    userCode: data.user_code,
    verificationUrl: `${ISSUER}/codex/device`,
    interval: Math.max(parseInt(data.interval) || 5, 1),
  };
}

/**
 * Poll device auth status. Returns tokens if authorized, null if still pending, throws on error.
 */
export async function pollCodexDeviceAuth(
  deviceAuthId: string,
  userCode: string
): Promise<CodexTokens | null> {
  const res = await fetch(`${ISSUER}/api/accounts/deviceauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      device_auth_id: deviceAuthId,
      user_code: userCode,
    }),
  });

  if (res.ok) {
    const data = await res.json();
    // Exchange the authorization code for tokens
    const tokenRes = await fetch(`${ISSUER}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: data.authorization_code,
        redirect_uri: `${ISSUER}/deviceauth/callback`,
        client_id: CODEX_CLIENT_ID,
        code_verifier: data.code_verifier,
      }).toString(),
    });

    if (!tokenRes.ok) {
      throw new Error(`Token exchange failed: ${tokenRes.status}`);
    }

    const tokenData = await tokenRes.json();
    const accountId = extractAccountIdFromTokens(tokenData as Record<string, unknown>);
    return {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: Date.now() + (tokenData.expires_in || 3600) * 1000,
      accountId,
    };
  }

  // 403/404 = still pending
  if (res.status === 403 || res.status === 404) {
    return null;
  }

  throw new Error(`Device auth polling failed: ${res.status}`);
}

/**
 * Refresh Codex tokens using the refresh token.
 */
async function refreshCodexTokens(refreshToken: string): Promise<CodexTokens | null> {
  try {
    const res = await fetch(`${ISSUER}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: CODEX_CLIENT_ID,
      }).toString(),
    });

    if (!res.ok) return null;

    const data = await res.json();
    const accountId = extractAccountIdFromTokens(data as Record<string, unknown>);
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
      accountId,
    };
  } catch {
    return null;
  }
}
