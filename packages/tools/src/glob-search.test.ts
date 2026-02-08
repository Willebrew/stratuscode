/**
 * Glob Search (execute) Tests
 *
 * Tests for the globTool.execute function - the recursive filesystem search
 * that uses matchGlob internally. Uses real temp directories with bun:test.
 *
 * Note: matchGlob has a quirk where ** requires a / prefix in the filepath.
 * This means bare root-level names like "file.ts" or "src" won't match
 * patterns like ** / *.ts or ** / *. Use *.ts to match root-level files.
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { globTool } from './glob';

// ============================================
// Helpers
// ============================================

const testDir = join(tmpdir(), `glob-search-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);

/** Build a SAGE ToolContext that the adapter will convert to StratusToolContext */
function makeContext(projectDir: string = testDir) {
  return {
    userId: 'test-user',
    conversationId: 'test-conv',
    sessionId: 'test-session',
    metadata: { projectDir },
  };
}

/** Parse the JSON string returned by execute */
function parse(raw: unknown): {
  pattern: string;
  searchDirectory: string;
  total: number;
  truncated: boolean;
  results: Array<{ path: string; type: 'file' | 'directory'; size?: number }>;
} {
  return JSON.parse(raw as string);
}

// ============================================
// Test Directory Structure
// ============================================
//
// testDir/
//   index.ts
//   README.md
//   config.json
//   src/
//     app.ts
//     app.test.ts
//     utils.ts
//     components/
//       Button.tsx
//       Input.tsx
//       styles/
//         theme.css
//   lib/
//     helpers.ts
//   node_modules/
//     pkg/
//       index.js
//   .git/
//     config
//   dist/
//     bundle.js
//   build/
//     output.js
//   .next/
//     cache.json
//   empty-dir/
//

beforeAll(() => {
  // Create directories
  const dirs = [
    '',
    'src',
    'src/components',
    'src/components/styles',
    'lib',
    'node_modules/pkg',
    '.git',
    'dist',
    'build',
    '.next',
    'empty-dir',
  ];
  for (const d of dirs) {
    mkdirSync(join(testDir, d), { recursive: true });
  }

  // Create files
  const files: Record<string, string> = {
    'index.ts': 'export {};',
    'README.md': '# Test',
    'config.json': '{}',
    'src/app.ts': 'const app = 1;',
    'src/app.test.ts': 'test("app", () => {});',
    'src/utils.ts': 'export const x = 1;',
    'src/components/Button.tsx': '<Button/>',
    'src/components/Input.tsx': '<Input/>',
    'src/components/styles/theme.css': 'body {}',
    'lib/helpers.ts': 'export function help() {}',
    'node_modules/pkg/index.js': 'module.exports = {};',
    '.git/config': '[core]',
    'dist/bundle.js': 'var x;',
    'build/output.js': 'var y;',
    '.next/cache.json': '{}',
  };
  for (const [f, content] of Object.entries(files)) {
    writeFileSync(join(testDir, f), content);
  }
});

afterAll(() => {
  rmSync(testDir, { recursive: true, force: true });
});

// ============================================
// Basic Pattern Matching
// ============================================

describe('globTool.execute - basic patterns', () => {
  test('finds nested .ts files with **/*.ts (not root-level)', async () => {
    const result = parse(await globTool.execute(
      { pattern: '**/*.ts', search_directory: testDir },
      makeContext(),
    ));

    // ** requires / prefix in filepath, so root-level index.ts won't match
    expect(result.total).toBe(4);
    const paths = result.results.map(r => r.path);
    expect(paths).toContain('src/app.ts');
    expect(paths).toContain('src/app.test.ts');
    expect(paths).toContain('src/utils.ts');
    expect(paths).toContain('lib/helpers.ts');
    expect(paths).not.toContain('index.ts');
  });

  test('finds root-level files with *.ts', async () => {
    const result = parse(await globTool.execute(
      { pattern: '*.ts', search_directory: testDir },
      makeContext(),
    ));

    const paths = result.results.map(r => r.path);
    expect(paths).toContain('index.ts');
    // * doesn't cross / so nested files are excluded
    expect(paths).not.toContain('src/app.ts');
  });

  test('finds .tsx files in components', async () => {
    const result = parse(await globTool.execute(
      { pattern: '**/*.tsx', search_directory: testDir },
      makeContext(),
    ));

    expect(result.total).toBe(2);
    const paths = result.results.map(r => r.path);
    expect(paths).toContain('src/components/Button.tsx');
    expect(paths).toContain('src/components/Input.tsx');
  });

  test('finds files with exact name pattern', async () => {
    const result = parse(await globTool.execute(
      { pattern: 'README.md', search_directory: testDir },
      makeContext(),
    ));

    expect(result.total).toBe(1);
    expect(result.results[0]!.path).toBe('README.md');
  });

  test('finds .css files nested deep', async () => {
    const result = parse(await globTool.execute(
      { pattern: '**/*.css', search_directory: testDir },
      makeContext(),
    ));

    expect(result.total).toBe(1);
    expect(result.results[0]!.path).toBe('src/components/styles/theme.css');
  });

  test('returns no results for non-matching pattern', async () => {
    const result = parse(await globTool.execute(
      { pattern: '**/*.py', search_directory: testDir },
      makeContext(),
    ));

    expect(result.total).toBe(0);
    expect(result.results).toEqual([]);
    expect(result.truncated).toBe(false);
  });

  test('pattern with directory prefix narrows search', async () => {
    const result = parse(await globTool.execute(
      { pattern: 'src/*.ts', search_directory: testDir },
      makeContext(),
    ));

    const paths = result.results.map(r => r.path);
    expect(paths).toContain('src/app.ts');
    expect(paths).toContain('src/app.test.ts');
    expect(paths).toContain('src/utils.ts');
    // Should not include nested files or other directories
    expect(paths).not.toContain('src/components/Button.tsx');
    expect(paths).not.toContain('lib/helpers.ts');
  });

  test('? wildcard matches single character', async () => {
    const result = parse(await globTool.execute(
      { pattern: 'src/app.t??t.ts', search_directory: testDir },
      makeContext(),
    ));

    expect(result.total).toBe(1);
    expect(result.results[0]!.path).toBe('src/app.test.ts');
  });
});

// ============================================
// Default Excludes
// ============================================

describe('globTool.execute - default excludes', () => {
  test('excludes node_modules by default', async () => {
    const result = parse(await globTool.execute(
      { pattern: '**/*.js', search_directory: testDir },
      makeContext(),
    ));

    const paths = result.results.map(r => r.path);
    expect(paths).not.toContain('node_modules/pkg/index.js');
  });

  test('excludes .git by default', async () => {
    const result = parse(await globTool.execute(
      { pattern: '**/*', search_directory: testDir },
      makeContext(),
    ));

    const paths = result.results.map(r => r.path);
    const gitPaths = paths.filter(p => p.startsWith('.git'));
    expect(gitPaths).toHaveLength(0);
  });

  test('excludes dist by default', async () => {
    const result = parse(await globTool.execute(
      { pattern: '**/*.js', search_directory: testDir },
      makeContext(),
    ));

    const paths = result.results.map(r => r.path);
    expect(paths).not.toContain('dist/bundle.js');
  });

  test('excludes build by default', async () => {
    const result = parse(await globTool.execute(
      { pattern: '**/*.js', search_directory: testDir },
      makeContext(),
    ));

    const paths = result.results.map(r => r.path);
    expect(paths).not.toContain('build/output.js');
  });

  test('excludes .next by default', async () => {
    const result = parse(await globTool.execute(
      { pattern: '**/*.json', search_directory: testDir },
      makeContext(),
    ));

    const paths = result.results.map(r => r.path);
    expect(paths).not.toContain('.next/cache.json');
  });

  test('all five default excludes are filtered', async () => {
    // Search for everything to verify none of the default excludes appear
    const result = parse(await globTool.execute(
      { pattern: '**/*', search_directory: testDir },
      makeContext(),
    ));

    const paths = result.results.map(r => r.path);
    const excluded = ['node_modules', '.git', 'dist', 'build', '.next'];
    for (const ex of excluded) {
      const found = paths.filter(p => p.startsWith(ex) || p.includes(`/${ex}/`));
      expect(found).toHaveLength(0);
    }
  });
});

// ============================================
// Custom Excludes
// ============================================

describe('globTool.execute - custom excludes', () => {
  test('custom excludes are added to defaults', async () => {
    const result = parse(await globTool.execute(
      { pattern: '**/*.ts', search_directory: testDir, excludes: ['lib'] },
      makeContext(),
    ));

    const paths = result.results.map(r => r.path);
    expect(paths).not.toContain('lib/helpers.ts');
    // Default excludes still in effect
    expect(paths).not.toContain('node_modules/pkg/index.js');
  });

  test('excluding src filters all src files', async () => {
    const result = parse(await globTool.execute(
      { pattern: '**/*.ts', search_directory: testDir, excludes: ['src'] },
      makeContext(),
    ));

    const paths = result.results.map(r => r.path);
    const srcPaths = paths.filter(p => p.startsWith('src'));
    expect(srcPaths).toHaveLength(0);
    // lib should still be present
    expect(paths).toContain('lib/helpers.ts');
  });

  test('empty excludes array still applies defaults', async () => {
    const result = parse(await globTool.execute(
      { pattern: '**/*.js', search_directory: testDir, excludes: [] },
      makeContext(),
    ));

    const paths = result.results.map(r => r.path);
    expect(paths).not.toContain('node_modules/pkg/index.js');
    expect(paths).not.toContain('dist/bundle.js');
  });
});

// ============================================
// Type Filtering
// ============================================

describe('globTool.execute - type filter', () => {
  test('type=file only returns files', async () => {
    const result = parse(await globTool.execute(
      { pattern: '**/*', search_directory: testDir, type: 'file' },
      makeContext(),
    ));

    for (const item of result.results) {
      expect(item.type).toBe('file');
    }
    expect(result.total).toBeGreaterThan(0);
  });

  test('type=directory only returns directories', async () => {
    // Use src/** pattern to get directories with / in their path (matchGlob quirk)
    const result = parse(await globTool.execute(
      { pattern: 'src/**', search_directory: testDir, type: 'directory' },
      makeContext(),
    ));

    for (const item of result.results) {
      expect(item.type).toBe('directory');
    }
    expect(result.total).toBeGreaterThan(0);
    const paths = result.results.map(r => r.path);
    expect(paths).toContain('src/components');
  });

  test('type=any returns both files and directories with nested pattern', async () => {
    // Use src/** which matches nested items (files and directories under src/)
    const result = parse(await globTool.execute(
      { pattern: 'src/**', search_directory: testDir, type: 'any' },
      makeContext(),
    ));

    const types = new Set(result.results.map(r => r.type));
    expect(types.has('file')).toBe(true);
    expect(types.has('directory')).toBe(true);
  });

  test('default type is any (omitting type param)', async () => {
    // Use src/** to get nested items that include both files and directories
    const result = parse(await globTool.execute(
      { pattern: 'src/**', search_directory: testDir },
      makeContext(),
    ));

    const types = new Set(result.results.map(r => r.type));
    expect(types.has('file')).toBe(true);
    expect(types.has('directory')).toBe(true);
  });

  test('files include size, directories do not', async () => {
    const result = parse(await globTool.execute(
      { pattern: 'src/**', search_directory: testDir },
      makeContext(),
    ));

    const files = result.results.filter(r => r.type === 'file');
    const dirs = result.results.filter(r => r.type === 'directory');
    expect(files.length).toBeGreaterThan(0);
    expect(dirs.length).toBeGreaterThan(0);

    for (const item of files) {
      expect(item.size).toBeDefined();
      expect(typeof item.size).toBe('number');
      expect(item.size!).toBeGreaterThanOrEqual(0);
    }
    for (const item of dirs) {
      expect(item.size).toBeUndefined();
    }
  });
});

// ============================================
// Depth Limiting
// ============================================

describe('globTool.execute - max_depth', () => {
  test('max_depth=0 only searches root level (no recursion into subdirs)', async () => {
    const result = parse(await globTool.execute(
      { pattern: '*.ts', search_directory: testDir, max_depth: 0 },
      makeContext(),
    ));

    const paths = result.results.map(r => r.path);
    // Root-level items only - no / in paths
    for (const p of paths) {
      expect(p.includes('/')).toBe(false);
    }
    expect(paths).toContain('index.ts');
  });

  test('max_depth=0 does not recurse into subdirectories', async () => {
    const result = parse(await globTool.execute(
      { pattern: 'src/*.ts', search_directory: testDir, max_depth: 0 },
      makeContext(),
    ));

    // At depth 0 we only process root entries. The search function enters src/
    // at depth 1, which exceeds max_depth=0, so nothing inside src/ is found.
    expect(result.total).toBe(0);
  });

  test('max_depth=1 finds files one level deep', async () => {
    const result = parse(await globTool.execute(
      { pattern: 'src/*.ts', search_directory: testDir, max_depth: 1 },
      makeContext(),
    ));

    const paths = result.results.map(r => r.path);
    // src/ entries are at depth 1
    expect(paths).toContain('src/app.ts');
    expect(paths).toContain('src/utils.ts');
  });

  test('max_depth=1 does not reach depth 2', async () => {
    const result = parse(await globTool.execute(
      { pattern: '**/*.tsx', search_directory: testDir, max_depth: 1 },
      makeContext(),
    ));

    // Button.tsx and Input.tsx are at depth 2 (src/components/), should not appear
    expect(result.total).toBe(0);
  });

  test('max_depth=2 includes two levels of nesting', async () => {
    const result = parse(await globTool.execute(
      { pattern: '**/*.tsx', search_directory: testDir, max_depth: 2 },
      makeContext(),
    ));

    const paths = result.results.map(r => r.path);
    expect(paths).toContain('src/components/Button.tsx');
    expect(paths).toContain('src/components/Input.tsx');
  });

  test('max_depth=2 does not reach depth 3', async () => {
    const result = parse(await globTool.execute(
      { pattern: '**/*.css', search_directory: testDir, max_depth: 2 },
      makeContext(),
    ));

    // theme.css is at depth 3 (src/components/styles/theme.css)
    expect(result.total).toBe(0);
  });

  test('max_depth undefined does not limit depth', async () => {
    const result = parse(await globTool.execute(
      { pattern: '**/*.css', search_directory: testDir },
      makeContext(),
    ));

    // theme.css is at depth 3 - should be found without depth limit
    expect(result.total).toBe(1);
    expect(result.results[0]!.path).toBe('src/components/styles/theme.css');
  });
});

// ============================================
// Result Cap (100 matches) and Truncation
// ============================================

describe('globTool.execute - result cap', () => {
  const manyFilesDir = join(testDir, 'many-files');
  const manySubDir = join(manyFilesDir, 'sub');

  beforeAll(() => {
    // Create 110 files inside a subdirectory so that relative paths contain /
    // which allows them to match **/*.txt (matchGlob requires / for ** match)
    mkdirSync(manySubDir, { recursive: true });
    for (let i = 0; i < 110; i++) {
      writeFileSync(join(manySubDir, `file-${String(i).padStart(3, '0')}.txt`), `content-${i}`);
    }
  });

  test('results are capped at 100', async () => {
    const result = parse(await globTool.execute(
      { pattern: '**/*.txt', search_directory: manyFilesDir },
      makeContext(manyFilesDir),
    ));

    expect(result.total).toBe(100);
    expect(result.results).toHaveLength(100);
  });

  test('truncated flag is true when cap is reached', async () => {
    const result = parse(await globTool.execute(
      { pattern: '**/*.txt', search_directory: manyFilesDir },
      makeContext(manyFilesDir),
    ));

    expect(result.truncated).toBe(true);
  });

  test('truncated flag is false when under cap', async () => {
    const result = parse(await globTool.execute(
      { pattern: '**/*.ts', search_directory: testDir },
      makeContext(),
    ));

    expect(result.truncated).toBe(false);
  });

  test('using *.txt from inside sub/ also hits cap', async () => {
    // Use *.txt at root level of sub/ to also test the non-** path
    const result = parse(await globTool.execute(
      { pattern: '*.txt', search_directory: manySubDir },
      makeContext(manySubDir),
    ));

    expect(result.total).toBe(100);
    expect(result.truncated).toBe(true);
  });
});

// ============================================
// Search Directory Handling
// ============================================

describe('globTool.execute - search directory', () => {
  test('absolute search_directory is used as-is', async () => {
    const result = parse(await globTool.execute(
      { pattern: '**/*.ts', search_directory: testDir },
      makeContext(),
    ));

    expect(result.searchDirectory).toBe(testDir);
    expect(result.total).toBeGreaterThan(0);
  });

  test('relative search_directory is resolved against projectDir', async () => {
    const result = parse(await globTool.execute(
      { pattern: '*.ts', search_directory: 'src' },
      makeContext(),
    ));

    expect(result.searchDirectory).toBe(join(testDir, 'src'));
    const paths = result.results.map(r => r.path);
    expect(paths).toContain('app.ts');
    expect(paths).toContain('app.test.ts');
    expect(paths).toContain('utils.ts');
  });

  test('non-existent directory returns empty results (no crash)', async () => {
    const result = parse(await globTool.execute(
      { pattern: '**/*', search_directory: join(testDir, 'does-not-exist') },
      makeContext(),
    ));

    expect(result.total).toBe(0);
    expect(result.results).toEqual([]);
  });

  test('searching within a subdirectory using *.tsx finds its files', async () => {
    // Use *.tsx (not **/*.tsx) because root-level files won't match ** pattern
    const result = parse(await globTool.execute(
      { pattern: '*.tsx', search_directory: join(testDir, 'src', 'components') },
      makeContext(),
    ));

    expect(result.total).toBe(2);
    const paths = result.results.map(r => r.path);
    expect(paths).toContain('Button.tsx');
    expect(paths).toContain('Input.tsx');
  });

  test('relative path with nested directories resolves correctly', async () => {
    const result = parse(await globTool.execute(
      { pattern: '*.tsx', search_directory: 'src/components' },
      makeContext(),
    ));

    expect(result.searchDirectory).toBe(join(testDir, 'src', 'components'));
    expect(result.total).toBe(2);
  });
});

// ============================================
// Output Shape
// ============================================

describe('globTool.execute - output shape', () => {
  test('returns valid JSON string', async () => {
    const raw = await globTool.execute(
      { pattern: '**/*.ts', search_directory: testDir },
      makeContext(),
    );

    expect(typeof raw).toBe('string');
    expect(() => JSON.parse(raw as string)).not.toThrow();
  });

  test('output has all expected fields', async () => {
    const result = parse(await globTool.execute(
      { pattern: '**/*.ts', search_directory: testDir },
      makeContext(),
    ));

    expect(result).toHaveProperty('pattern');
    expect(result).toHaveProperty('searchDirectory');
    expect(result).toHaveProperty('total');
    expect(result).toHaveProperty('truncated');
    expect(result).toHaveProperty('results');
    expect(Array.isArray(result.results)).toBe(true);
  });

  test('pattern in output matches input', async () => {
    const result = parse(await globTool.execute(
      { pattern: '**/*.tsx', search_directory: testDir },
      makeContext(),
    ));

    expect(result.pattern).toBe('**/*.tsx');
  });

  test('total matches results array length', async () => {
    const result = parse(await globTool.execute(
      { pattern: '**/*.ts', search_directory: testDir },
      makeContext(),
    ));

    expect(result.total).toBe(result.results.length);
  });

  test('each result has path and type fields', async () => {
    const result = parse(await globTool.execute(
      { pattern: '**/*', search_directory: testDir },
      makeContext(),
    ));

    for (const item of result.results) {
      expect(typeof item.path).toBe('string');
      expect(['file', 'directory']).toContain(item.type);
    }
  });

  test('file results include numeric size', async () => {
    const result = parse(await globTool.execute(
      { pattern: 'index.ts', search_directory: testDir },
      makeContext(),
    ));

    expect(result.total).toBe(1);
    expect(result.results[0]!.type).toBe('file');
    expect(typeof result.results[0]!.size).toBe('number');
    // 'export {};' is 10 bytes
    expect(result.results[0]!.size).toBe(10);
  });

  test('searchDirectory in output is absolute', async () => {
    const result = parse(await globTool.execute(
      { pattern: '*.ts', search_directory: 'src' },
      makeContext(),
    ));

    expect(result.searchDirectory.startsWith('/')).toBe(true);
    expect(result.searchDirectory).toBe(join(testDir, 'src'));
  });
});

// ============================================
// Edge Cases
// ============================================

describe('globTool.execute - edge cases', () => {
  test('empty directory returns no file results', async () => {
    const result = parse(await globTool.execute(
      { pattern: '*', search_directory: join(testDir, 'empty-dir'), type: 'file' },
      makeContext(),
    ));

    expect(result.total).toBe(0);
  });

  test('searching for nested directories with type=directory', async () => {
    // ** only matches paths with /, so only nested dirs appear
    const result = parse(await globTool.execute(
      { pattern: '**/*', search_directory: testDir, type: 'directory' },
      makeContext(),
    ));

    const paths = result.results.map(r => r.path);
    // These are nested so they contain / and match **/*
    expect(paths).toContain('src/components');
    expect(paths).toContain('src/components/styles');
    for (const item of result.results) {
      expect(item.type).toBe('directory');
    }
  });

  test('root-level directories match with * pattern', async () => {
    const result = parse(await globTool.execute(
      { pattern: '*', search_directory: testDir, type: 'directory' },
      makeContext(),
    ));

    const paths = result.results.map(r => r.path);
    expect(paths).toContain('src');
    expect(paths).toContain('lib');
    expect(paths).toContain('empty-dir');
    // Default excludes should still apply
    expect(paths).not.toContain('node_modules');
    expect(paths).not.toContain('.git');
    expect(paths).not.toContain('dist');
  });

  test('dot-prefixed files (non-excluded) are included', async () => {
    // Create a dotfile that is not in the default excludes
    writeFileSync(join(testDir, '.env'), 'SECRET=1');
    try {
      const result = parse(await globTool.execute(
        { pattern: '.env', search_directory: testDir },
        makeContext(),
      ));

      expect(result.total).toBe(1);
      expect(result.results[0]!.path).toBe('.env');
    } finally {
      rmSync(join(testDir, '.env'), { force: true });
    }
  });

  test('multiple patterns with same extension work', async () => {
    const jsonResult = parse(await globTool.execute(
      { pattern: '*.json', search_directory: testDir },
      makeContext(),
    ));

    const paths = jsonResult.results.map(r => r.path);
    expect(paths).toContain('config.json');
    // .next/cache.json excluded by default (and also wouldn't match *.json at root)
    expect(paths).not.toContain('.next/cache.json');
  });

  test('all result paths are relative (no leading /)', async () => {
    const result = parse(await globTool.execute(
      { pattern: '**/*.ts', search_directory: testDir },
      makeContext(),
    ));

    for (const item of result.results) {
      expect(item.path.startsWith('/')).toBe(false);
    }
  });

  test('unreadable directory is gracefully skipped', async () => {
    // Searching a path that is actually a file (not a directory)
    // should return empty results since readdir will fail
    const result = parse(await globTool.execute(
      { pattern: '*', search_directory: join(testDir, 'index.ts') },
      makeContext(),
    ));

    expect(result.total).toBe(0);
  });

  test('size reflects actual file content length', async () => {
    const result = parse(await globTool.execute(
      { pattern: 'README.md', search_directory: testDir },
      makeContext(),
    ));

    expect(result.total).toBe(1);
    // '# Test' is 6 bytes
    expect(result.results[0]!.size).toBe(6);
  });
});
