#!/usr/bin/env bun
/**
 * StratusCode CLI
 *
 * Terminal-first AI coding agent.
 */

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { render } from 'ink';
import React from 'react';
import { App } from './app';
import { loadConfig, hasApiKey, initDatabase, saveGlobalConfig } from '@stratuscode/storage';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as readline from 'readline';

// ============================================
// CLI Setup
// ============================================

const VERSION = '0.1.0';

// ============================================
// Auth Command
// ============================================

async function handleAuth(key: string | undefined, showKey: boolean, provider?: string): Promise<void> {
  const configDir = path.join(os.homedir(), '.stratuscode');
  const configPath = path.join(configDir, 'config.json');

  // Show current keys
  if (showKey) {
    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        // Show default provider key
        if (config.provider?.apiKey) {
          const masked = maskApiKey(config.provider.apiKey);
          console.log(`OpenAI API key: ${masked}`);
        } else {
          console.log('OpenAI: not configured');
        }
        // Show named provider keys
        if (config.providers) {
          for (const [name, pConfig] of Object.entries(config.providers as Record<string, any>)) {
            if (pConfig.apiKey) {
              console.log(`${name}: ${maskApiKey(pConfig.apiKey)} (${pConfig.baseUrl})`);
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

  // Get key from argument or prompt
  let apiKey = key;
  if (!apiKey) {
    apiKey = await promptForApiKey(provider);
  }

  if (!apiKey) {
    console.error('No API key provided.');
    process.exit(1);
  }

  // Save to config
  try {
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    let config: Record<string, unknown> = {};
    if (fs.existsSync(configPath)) {
      try {
        config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      } catch {
        // Start fresh
      }
    }

    if (provider === 'zen' || provider === 'opencode-zen') {
      // Save as named provider
      if (!config.providers) config.providers = {};
      (config.providers as Record<string, unknown>)['opencode-zen'] = {
        apiKey,
        baseUrl: 'https://opencode.ai/zen/v1',
        type: 'chat-completions',
        headers: { 'HTTP-Referer': 'https://stratuscode.dev/', 'X-Title': 'stratuscode' },
      };
      console.log('API key saved for OpenCode Zen!');
      console.log(`   Config file: ${configPath}`);
      console.log(`   Key: ${maskApiKey(apiKey)}`);
      console.log('');
      console.log('Use /model in stratuscode to select a Zen model.');
    } else {
      // Default: save as OpenAI provider key
      if (!apiKey.startsWith('sk-')) {
        console.warn('Warning: Key does not start with "sk-". Saving anyway.');
      }
      config.provider = {
        ...(config.provider as Record<string, unknown> || {}),
        apiKey,
      };
      console.log('API key saved successfully!');
      console.log(`   Config file: ${configPath}`);
      console.log(`   Key: ${maskApiKey(apiKey)}`);
      console.log('');
      console.log('You can now run: stratuscode');
    }

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error('Failed to save API key:', error);
    process.exit(1);
  }
}

function maskApiKey(key: string): string {
  if (key.length <= 8) return '****';
  return key.slice(0, 7) + '...' + key.slice(-4);
}

async function promptForApiKey(provider?: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    if (provider === 'zen' || provider === 'opencode-zen') {
      console.log('Enter your OpenCode Zen API key:');
      console.log('(Get one at https://opencode.ai)');
    } else {
      console.log('Enter your OpenAI API key:');
      console.log('(Get one at https://platform.openai.com/api-keys)');
    }
    console.log('');
    rl.question('API Key: ', (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .scriptName('stratuscode')
    .version(VERSION)
    .usage('$0 [options]')
    .command('auth [key]', 'Set or view API key', (yargs) => {
      return yargs
        .positional('key', {
          type: 'string',
          description: 'API key to save (omit to enter interactively)',
        })
        .option('show', {
          type: 'boolean',
          description: 'Show current API key (masked)',
          default: false,
        })
        .option('provider', {
          type: 'string',
          description: 'Provider name (openai, zen)',
        });
    }, async (argv) => {
      await handleAuth(argv.key as string | undefined, argv.show as boolean, argv.provider as string | undefined);
      process.exit(0);
    })
    .option('dir', {
      alias: 'd',
      type: 'string',
      description: 'Project directory',
      default: process.cwd(),
    })
    .option('agent', {
      alias: 'a',
      type: 'string',
      description: 'Agent to use (build, plan)',
      default: 'build',
    })
    .option('prompt', {
      alias: 'p',
      type: 'string',
      description: 'Initial prompt (non-interactive mode)',
    })
    .option('model', {
      alias: 'm',
      type: 'string',
      description: 'Model override',
    })
    .option('provider', {
      type: 'string',
      description: 'Named provider (e.g. opencode-zen)',
    })
    .help()
    .alias('help', 'h')
    .parse();

  // Resolve project directory
  const projectDir = path.resolve(argv.dir);

  // Load configuration
  const { config, sources } = loadConfig(projectDir);

  // Check API key
  if (!hasApiKey(config)) {
    console.error('Error: No API key found.');
    console.error('');
    console.error('Set your OpenAI API key using one of these methods:');
    console.error('  1. Environment variable: export OPENAI_API_KEY=sk-...');
    console.error('  2. Global config: ~/.stratuscode/config.json');
    console.error('  3. Project config: ./stratuscode.json');
    process.exit(1);
  }

  // Initialize database
  initDatabase();

  // Apply CLI overrides to config
  if (argv.model) {
    config.model = argv.model;
  }

  // Resolve named provider into the default provider slot so both
  // non-interactive and interactive modes use it seamlessly.
  const providerName = argv.provider as string | undefined;
  if (providerName && (config as any).providers?.[providerName]) {
    const p = (config as any).providers[providerName];
    config.provider = {
      apiKey: p.apiKey ?? config.provider.apiKey,
      baseUrl: p.baseUrl ?? config.provider.baseUrl,
      ...p,
    };
  }

  // Non-interactive mode
  if (argv.prompt) {
    const { runNonInteractive } = await import('./non-interactive');
    await runNonInteractive({
      projectDir,
      config,
      agent: argv.agent,
      prompt: argv.prompt,
    });
    return;
  }

  // Interactive TUI mode
  console.clear();

  const { waitUntilExit } = render(
    React.createElement(App, {
      projectDir,
      config,
      initialAgent: argv.agent,
    })
  );

  await waitUntilExit();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
