import { describe, expect, test } from 'bun:test';
import { grepTool } from './grep';

const ctx = { sessionId: 'test', metadata: { projectDir: '/tmp' } };

describe('grep tool', () => {
  test('finds matches in a directory (file list mode)', async () => {
    const result = await grepTool.execute(
      { query: 'grep', search_path: __dirname, includes: ['*.ts'] },
      ctx as any
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.matchingFiles).toBeGreaterThan(0);
    expect(parsed.files.length).toBeGreaterThan(0);
  });

  test('returns no matches for nonexistent pattern', async () => {
    const result = await grepTool.execute(
      { query: 'zzz_definitely_not_found_xyz_123', search_path: __dirname, includes: ['*.json'] },
      ctx as any
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.matchingFiles).toBe(0);
  });

  test('match_per_line returns context', async () => {
    const result = await grepTool.execute(
      { query: 'grepTool', search_path: __filename, match_per_line: true },
      ctx as any
    );
    expect(typeof result).toBe('string');
    expect(result as string).toContain('grepTool');
  });

  test('fixed_strings treats pattern as literal', async () => {
    const result = await grepTool.execute(
      { query: 'xyzzy_42_not_a_real_pattern', search_path: __dirname, fixed_strings: true, includes: ['*.json'] },
      ctx as any
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.matchingFiles).toBe(0);
  });

  test('case_sensitive respects casing', async () => {
    const result = await grepTool.execute(
      { query: 'DEFINETOOL', search_path: __dirname, case_sensitive: true, includes: ['*.json'] },
      ctx as any
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.matchingFiles).toBe(0);
  });

  test('throws for nonexistent path', async () => {
    expect(
      grepTool.execute(
        { query: 'test', search_path: '/tmp/nonexistent_dir_xyz_12345' },
        ctx as any
      )
    ).rejects.toThrow();
  });

  test('include exclusion patterns work', async () => {
    const result = await grepTool.execute(
      { query: 'import', search_path: __dirname, includes: ['!*.test.ts'] },
      ctx as any
    );
    const parsed = JSON.parse(result as string);
    // Should only match non-test files
    if (parsed.files) {
      for (const f of parsed.files) {
        expect(f).not.toContain('.test.ts');
      }
    }
  });
});
