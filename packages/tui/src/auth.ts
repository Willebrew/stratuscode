#!/usr/bin/env bun
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as readline from 'readline';
import crypto from 'crypto';
import http from 'http';
import { patchGlobalFetch } from '@stratuscode/shared';

patchGlobalFetch();

function parseArgs(argv: string[]): { key?: string; show: boolean; provider?: string } {
  const args = argv.slice(2);
  let key: string | undefined;
  let show = false;
  let provider: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--show') {
      show = true;
      continue;
    }
    if (arg === '--provider') {
      provider = args[i + 1];
      i += 1;
      continue;
    }
    if (arg && !arg.startsWith('-') && !key) {
      key = arg;
    }
  }
  return { key, show, provider };
}

async function promptForApiKey(provider?: string): Promise<string | undefined> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const label = provider ? `${provider} API key` : 'API key';
  return new Promise(resolve => {
    rl.question(`Enter ${label}: `, answer => {
      rl.close();
      resolve(answer.trim() || undefined);
    });
  });
}

function maskApiKey(key: string): string {
  if (key.length <= 8) return '****';
  return key.slice(0, 7) + '...' + key.slice(-4);
}

interface OAuthResult {
  refresh: string;
  access: string;
  expires: number;
  accountId?: string;
}

function generateRandomString(length: number): string {
  return crypto.randomBytes(length).toString('hex');
}

function generatePKCE() {
  const codeVerifier = crypto.randomBytes(32).toString('hex');
  const challenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, challenge };
}

function buildAuthorizeUrl(issuer: string, redirectUri: string, challenge: string, state: string, clientId: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'openid profile email',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  return `${issuer}/authorize?${params.toString()}`;
}

async function waitForOAuthCode(port: number, expectedState: string): Promise<string | null> {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || '/', `http://localhost:${port}`);
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      if (code && state === expectedState) {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Authorization complete. You can close this tab.');
        server.close();
        resolve(code);
      } else {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Invalid authorization response.');
      }
    });
    server.listen(port, () => {
      // waiting
    });
  });
}

async function runCodexBrowserAuth(): Promise<OAuthResult | null> {
  const ISSUER = 'https://auth.openai.com';
  const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
  const REDIRECT_PORT = 1455;
  const redirectUri = `http://localhost:${REDIRECT_PORT}/auth/callback`;

  try {
    const pkce = generatePKCE();
    const state = generateRandomString(32);
    const authUrl = buildAuthorizeUrl(ISSUER, redirectUri, pkce.challenge, state, CLIENT_ID);

    console.log('\nOpenAI Codex OAuth (browser)');
    console.log('1) Click/open this URL:');
    console.log(authUrl);
    console.log('2) Complete login; this window will capture the callback.\n');

    const code = await waitForOAuthCode(REDIRECT_PORT, state);
    if (!code) {
      console.error('No authorization code received.');
      return null;
    }

    const tokenResp = await fetch(`${ISSUER}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: CLIENT_ID,
        code_verifier: pkce.codeVerifier,
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResp.ok) {
      console.error('OAuth token exchange failed.');
      return null;
    }

    const tokenJson = await tokenResp.json() as Record<string, unknown>;
    const access = String(tokenJson.access_token || '');
    const refresh = String(tokenJson.refresh_token || '');
    const expires = Number(tokenJson.expires_in || 0);

    const accountId = typeof tokenJson.account_id === 'string' ? tokenJson.account_id : undefined;
    return { refresh, access, expires, accountId };
  } catch (err) {
    console.error('OAuth failed:', err);
    return null;
  }
}

async function handleAuth(key: string | undefined, showKey: boolean, provider?: string): Promise<void> {
  const configDir = path.join(os.homedir(), '.stratuscode');
  const configPath = path.join(configDir, 'config.json');

  if (showKey) {
    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        if (config.provider?.apiKey) {
          const masked = maskApiKey(config.provider.apiKey);
          console.log(`OpenAI API key: ${masked}`);
        } else {
          console.log('OpenAI: not configured');
        }
        if (config.providers) {
          for (const [name, pConfig] of Object.entries(config.providers as Record<string, any>)) {
            if (pConfig.apiKey) {
              console.log(`${name}: ${maskApiKey(pConfig.apiKey)} (${pConfig.baseUrl})`);
            } else if (pConfig.auth?.access) {
              console.log(`${name}: oauth (${pConfig.baseUrl})`);
            }
          }
        }
        console.log(`Config file: ${configPath}`);
      } catch {
        console.log('No API key saved in config file.');
      }
    } else {
      console.log('No config file found.');
    }
    return;
  }

  let apiKey = key;
  if (!['openai-codex'].includes(provider ?? '')) {
    if (!apiKey) {
      apiKey = await promptForApiKey(provider);
    }
    if (!apiKey) {
      console.error('No API key provided.');
      process.exit(1);
    }
  }

  try {
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    let config: Record<string, unknown> = {};
    if (fs.existsSync(configPath)) {
      try {
        config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      } catch {
        // ignore
      }
    }

    if (provider === 'zen' || provider === 'opencode-zen') {
      if (!config.providers) config.providers = {};
      (config.providers as Record<string, unknown>)['opencode-zen'] = {
        apiKey,
        baseUrl: 'https://opencode.ai/zen/v1',
        type: 'chat-completions',
        headers: { 'HTTP-Referer': 'https://stratuscode.dev/', 'X-Title': 'stratuscode' },
      };
      console.log('API key saved for OpenCode Zen!');
      console.log(`   Config file: ${configPath}`);
      console.log(`   Key: ${maskApiKey(apiKey!)}`);
      console.log('');
      console.log('Use /models in stratuscode to select a Zen model.');
    } else if (provider === 'openai-codex') {
      const codexCredentials = await runCodexBrowserAuth();
      if (!codexCredentials) {
        console.error('Codex authorization failed or was cancelled.');
        process.exit(1);
      }
      if (!config.providers) config.providers = {};
      (config.providers as Record<string, any>)['openai-codex'] = {
        apiKey: codexCredentials.access,
        baseUrl: 'https://chatgpt.com/backend-api/codex',
        type: 'responses-api',
        headers: codexCredentials.accountId ? { 'ChatGPT-Account-Id': codexCredentials.accountId } : undefined,
        auth: {
          type: 'oauth',
          refresh: codexCredentials.refresh,
          access: codexCredentials.access,
          expires: codexCredentials.expires,
          accountId: codexCredentials.accountId,
        },
      };
      console.log('OpenAI Codex tokens saved!');
      console.log(`   Config file: ${configPath}`);
      console.log(`   Account: ${codexCredentials.accountId ?? 'default'}`);
    } else {
      if (!apiKey!.startsWith('sk-')) {
        console.warn('Warning: Key does not start with "sk-". Saving anyway.');
      }
      config.provider = {
        ...(config.provider as Record<string, unknown> || {}),
        apiKey,
      };
      console.log('API key saved successfully!');
      console.log(`   Config file: ${configPath}`);
      console.log(`   Key: ${maskApiKey(apiKey!)}`);
      console.log('');
      console.log('You can now run: stratuscode');
    }

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error('Failed to save API key:', error);
    process.exit(1);
  }
}

async function main() {
  const { key, show, provider } = parseArgs(process.argv);
  await handleAuth(key, show, provider);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
