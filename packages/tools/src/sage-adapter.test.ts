/**
 * SAGE Adapter Tests
 *
 * Tests for defineTool context bridging and createStratusCodeToolRegistry.
 */

import { describe, test, expect } from 'bun:test';
import { defineTool, createStratusCodeToolRegistry } from './sage-adapter';

// ============================================
// defineTool
// ============================================

describe('defineTool', () => {
  test('creates a SAGE tool with correct name and description', () => {
    const tool = defineTool({
      name: 'test_tool',
      description: 'A test tool',
      parameters: {
        type: 'object',
        properties: { msg: { type: 'string' } },
        required: ['msg'],
      },
      execute: async () => 'result',
    });

    expect(tool.name).toBe('test_tool');
    expect(tool.description).toBe('A test tool');
  });

  test('preserves parameters schema', () => {
    const params = {
      type: 'object' as const,
      properties: {
        a: { type: 'string' as const, description: 'First param' },
        b: { type: 'number' as const },
      },
      required: ['a'],
    };

    const tool = defineTool({
      name: 'param_test',
      description: 'Test',
      parameters: params,
      execute: async () => 'ok',
    });

    expect(tool.parameters).toEqual(params);
  });

  test('passes timeout and maxResultSize through', () => {
    const tool = defineTool({
      name: 'limits_test',
      description: 'Test',
      parameters: { type: 'object', properties: {} },
      timeout: 5000,
      maxResultSize: 10000,
      execute: async () => 'ok',
    });

    expect(tool.timeout).toBe(5000);
    expect(tool.maxResultSize).toBe(10000);
  });

  test('adapts SAGE context to StratusCode context', async () => {
    let receivedContext: any;

    const tool = defineTool({
      name: 'ctx_test',
      description: 'Test',
      parameters: { type: 'object', properties: {} },
      execute: async (_args, ctx) => {
        receivedContext = ctx;
        return 'done';
      },
    });

    // Simulate SAGE calling the tool with its ToolContext
    const sageContext = {
      sessionId: 'sess-1',
      conversationId: 'conv-1',
      userId: 'user-1',
      metadata: {
        projectDir: '/test/project',
        abort: new AbortController().signal,
      },
    };

    await tool.execute({}, sageContext);

    expect(receivedContext.sessionId).toBe('sess-1');
    expect(receivedContext.projectDir).toBe('/test/project');
    expect(receivedContext.abort).toBeDefined();
  });

  test('defaults projectDir to cwd when metadata missing', async () => {
    let receivedContext: any;

    const tool = defineTool({
      name: 'no_meta',
      description: 'Test',
      parameters: { type: 'object', properties: {} },
      execute: async (_args, ctx) => {
        receivedContext = ctx;
        return 'done';
      },
    });

    await tool.execute({}, {
      sessionId: 'sess-1',
      conversationId: 'conv-1',
      userId: 'user-1',
    });

    expect(receivedContext.projectDir).toBe(process.cwd());
    expect(receivedContext.abort).toBeUndefined();
  });

  test('passes args through to execute function', async () => {
    let receivedArgs: any;

    const tool = defineTool<{ command: string; timeout: number }>({
      name: 'args_test',
      description: 'Test',
      parameters: { type: 'object', properties: {} },
      execute: async (args) => {
        receivedArgs = args;
        return 'ok';
      },
    });

    await tool.execute(
      { command: 'ls', timeout: 5000 },
      { sessionId: 's', conversationId: 'c', userId: 'u' }
    );

    expect(receivedArgs.command).toBe('ls');
    expect(receivedArgs.timeout).toBe(5000);
  });
});

// ============================================
// createStratusCodeToolRegistry
// ============================================

describe('createStratusCodeToolRegistry', () => {
  test('creates a tool registry', () => {
    const registry = createStratusCodeToolRegistry();
    expect(registry).toBeDefined();
    expect(typeof registry.register).toBe('function');
    expect(typeof registry.get).toBe('function');
    expect(typeof registry.list).toBe('function');
  });

  test('registry can register and retrieve tools', () => {
    const registry = createStratusCodeToolRegistry();
    const tool = defineTool({
      name: 'my_tool',
      description: 'My test tool',
      parameters: { type: 'object', properties: {} },
      execute: async () => 'result',
    });

    registry.register(tool);
    expect(registry.get('my_tool')).toBeDefined();
    expect(registry.list().some(t => t.name === 'my_tool')).toBe(true);
  });
});
