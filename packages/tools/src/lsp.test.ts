import { describe, expect, test } from 'bun:test';
import { lspTool } from './lsp';

const ctx = { sessionId: 'test', metadata: { projectDir: '/tmp' } };

describe('lsp tool: parameter validation', () => {
  test('requires filePath for definition', async () => {
    const result = await lspTool.execute(
      { operation: 'definition' },
      ctx as any
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.error).toContain('requires filePath');
  });

  test('requires filePath for hover', async () => {
    const result = await lspTool.execute(
      { operation: 'hover' },
      ctx as any
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.error).toContain('requires filePath');
  });

  test('requires filePath for diagnostics', async () => {
    const result = await lspTool.execute(
      { operation: 'diagnostics' },
      ctx as any
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.error).toContain('requires filePath');
  });

  test('requires position for definition', async () => {
    const result = await lspTool.execute(
      { operation: 'definition', filePath: '/tmp/test.ts' },
      ctx as any
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.error).toContain('requires line and character');
  });

  test('requires position for references', async () => {
    const result = await lspTool.execute(
      { operation: 'references', filePath: '/tmp/test.ts' },
      ctx as any
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.error).toContain('requires line and character');
  });

  test('requires query for workspaceSymbols', async () => {
    const result = await lspTool.execute(
      { operation: 'workspaceSymbols' },
      ctx as any
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.error).toContain('requires a query');
  });

  test('requires newName for rename', async () => {
    const result = await lspTool.execute(
      { operation: 'rename', filePath: '/tmp/test.ts', line: 0, character: 0 },
      ctx as any
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.error).toContain('requires newName');
  });
});
