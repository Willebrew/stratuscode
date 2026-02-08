/**
 * Config Extended Tests
 *
 * Tests for discoverOllamaModels with mocked fetch responses,
 * and additional buildSystemPrompt variant coverage.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { discoverOllamaModels } from './config';
import { buildSystemPrompt, BUILT_IN_AGENTS, getPromptVariant } from './agents';

// ============================================
// discoverOllamaModels
// ============================================

describe('discoverOllamaModels', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('returns models from Ollama API', async () => {
    globalThis.fetch = ((url: any, opts?: any) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr.includes('/api/tags')) {
        return Promise.resolve(new Response(JSON.stringify({
          models: [{ name: 'llama3:latest' }, { name: 'codellama:7b' }],
        }), { status: 200 }));
      }
      if (urlStr.includes('/api/show')) {
        return Promise.resolve(new Response(JSON.stringify({
          model_info: { 'llama.context_length': 8192 },
        }), { status: 200 }));
      }
      return Promise.resolve(new Response('', { status: 404 }));
    }) as unknown as typeof fetch;

    const models = await discoverOllamaModels('http://localhost:11434');
    expect(models).not.toBeNull();
    expect(models!.length).toBe(2);
    expect(models![0]!.id).toBe('llama3:latest');
    expect(models![0]!.name).toBe('llama3');
    expect(models![0]!.contextWindow).toBe(8192);
  });

  test('returns null when Ollama is not running', async () => {
    globalThis.fetch = (() => {
      return Promise.reject(new Error('ECONNREFUSED'));
    }) as unknown as typeof fetch;

    const result = await discoverOllamaModels();
    expect(result).toBeNull();
  });

  test('returns null when API returns non-200', async () => {
    globalThis.fetch = (() => {
      return Promise.resolve(new Response('Internal Server Error', { status: 500 }));
    }) as unknown as typeof fetch;

    const result = await discoverOllamaModels();
    expect(result).toBeNull();
  });

  test('uses default context window when /api/show fails', async () => {
    globalThis.fetch = ((url: any) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr.includes('/api/tags')) {
        return Promise.resolve(new Response(JSON.stringify({
          models: [{ name: 'tiny-model' }],
        }), { status: 200 }));
      }
      if (urlStr.includes('/api/show')) {
        return Promise.reject(new Error('timeout'));
      }
      return Promise.resolve(new Response('', { status: 404 }));
    }) as unknown as typeof fetch;

    const models = await discoverOllamaModels();
    expect(models).not.toBeNull();
    expect(models![0]!.contextWindow).toBe(2048); // OLLAMA_DEFAULT_CONTEXT_WINDOW
  });

  test('parses num_ctx from parameters string', async () => {
    globalThis.fetch = ((url: any) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr.includes('/api/tags')) {
        return Promise.resolve(new Response(JSON.stringify({
          models: [{ name: 'custom-model' }],
        }), { status: 200 }));
      }
      if (urlStr.includes('/api/show')) {
        return Promise.resolve(new Response(JSON.stringify({
          parameters: 'num_ctx 32768\ntemperature 0.7',
        }), { status: 200 }));
      }
      return Promise.resolve(new Response('', { status: 404 }));
    }) as unknown as typeof fetch;

    const models = await discoverOllamaModels();
    expect(models).not.toBeNull();
    expect(models![0]!.contextWindow).toBe(32768);
  });

  test('handles empty model list', async () => {
    globalThis.fetch = ((url: any) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr.includes('/api/tags')) {
        return Promise.resolve(new Response(JSON.stringify({ models: [] }), { status: 200 }));
      }
      return Promise.resolve(new Response('', { status: 404 }));
    }) as unknown as typeof fetch;

    const models = await discoverOllamaModels();
    expect(models).not.toBeNull();
    expect(models!.length).toBe(0);
  });

  test('handles missing models key in response', async () => {
    globalThis.fetch = ((url: any) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr.includes('/api/tags')) {
        return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
      }
      return Promise.resolve(new Response('', { status: 404 }));
    }) as unknown as typeof fetch;

    const models = await discoverOllamaModels();
    expect(models).not.toBeNull();
    expect(models!.length).toBe(0);
  });

  test('strips :latest suffix from model name', async () => {
    globalThis.fetch = ((url: any) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr.includes('/api/tags')) {
        return Promise.resolve(new Response(JSON.stringify({
          models: [{ name: 'phi3:latest' }],
        }), { status: 200 }));
      }
      if (urlStr.includes('/api/show')) {
        return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
      }
      return Promise.resolve(new Response('', { status: 404 }));
    }) as unknown as typeof fetch;

    const models = await discoverOllamaModels();
    expect(models![0]!.name).toBe('phi3');
    expect(models![0]!.id).toBe('phi3:latest');
  });
});

// ============================================
// buildSystemPrompt variants (covering uncovered lines)
// ============================================

describe('buildSystemPrompt variant coverage', () => {
  test('openai variant includes full capabilities section', () => {
    const prompt = buildSystemPrompt({
      agent: BUILT_IN_AGENTS.build!,
      tools: [],
      projectDir: '/test',
      modelId: 'gpt-5-mini',
    });
    expect(prompt).toContain('CORE PRINCIPLES');
    expect(prompt).toContain('CAPABILITIES');
    expect(prompt).toContain('TASK MANAGEMENT');
  });

  test('gemini variant is more concise', () => {
    const prompt = buildSystemPrompt({
      agent: BUILT_IN_AGENTS.build!,
      tools: [],
      projectDir: '/test',
      modelId: 'gemini-2.0-flash',
    });
    expect(prompt).toContain('CORE RULES');
    expect(prompt).toContain('Be concise');
    // Gemini variant should not have full CAPABILITIES section
    expect(prompt).not.toContain('CAPABILITIES');
  });

  test('zen variant is minimal', () => {
    const prompt = buildSystemPrompt({
      agent: BUILT_IN_AGENTS.build!,
      tools: [],
      projectDir: '/test',
      modelId: 'kimi-k2.5-free',
    });
    expect(prompt).toContain('StratusCode');
    // Zen variant should be more concise than OpenAI
    const openaiPrompt = buildSystemPrompt({
      agent: BUILT_IN_AGENTS.build!,
      tools: [],
      projectDir: '/test',
      modelId: 'gpt-5-mini',
    });
    expect(prompt.length).toBeLessThan(openaiPrompt.length);
  });

  test('environment section includes OS info', () => {
    const prompt = buildSystemPrompt({
      agent: BUILT_IN_AGENTS.build!,
      tools: [],
      projectDir: '/my/project',
    });
    expect(prompt).toContain('<environment>');
    expect(prompt).toContain('Operating System:');
    expect(prompt).toContain('/my/project');
    expect(prompt).toContain('Shell:');
    expect(prompt).toContain('</environment>');
  });

  test('getPromptVariant handles edge cases', () => {
    // Empty string
    expect(getPromptVariant('')).toBe('default');
    // Random model
    expect(getPromptVariant('random-model-xyz')).toBe('default');
  });
});
