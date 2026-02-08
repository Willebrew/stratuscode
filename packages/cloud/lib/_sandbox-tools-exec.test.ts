// @ts-nocheck — test file; runtime correctness verified by bun:test
import { describe, expect, test, beforeEach, afterEach, mock } from 'bun:test';
import type { Tool } from '@willebrew/sage-core';
import type { SandboxInfo } from './sandbox';

// ============================================
// This file is named with _ prefix so it sorts BEFORE
// cloud-session-sendmessage.test.ts which mocks './sandbox-tools'.
// That way our real imports work before the mock is applied.
// ============================================

import { resolveAnswer, registerSandboxTools } from './sandbox-tools';

const originalFetch = globalThis.fetch;

beforeEach(() => {
  const gs = globalThis as any;
  gs.__stratusPendingAnswers?.clear();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ============================================
// Helpers
// ============================================

function createSandboxInfo(overrides?: any): SandboxInfo {
  return {
    sandboxId: 'sb-test',
    sandbox: {
      runCommand: async () => ({ exitCode: 0, stdout: async () => '', stderr: async () => '' }),
      readFile: async () => new ReadableStream(),
      writeFiles: async () => {},
    } as any,
    owner: 'testowner',
    repo: 'testrepo',
    branch: 'main',
    sessionBranch: 'stratuscode/test-session',
    workDir: '/workspace',
    ...overrides,
  } as any;
}

// Simple local registry for getting tools by name
function localRegistry() {
  const tools = new Map<string, Tool>();
  return {
    register(tool: Tool) { tools.set(tool.name, tool); },
    get(name: string) { return tools.get(name); },
    list() { return Array.from(tools.values()); },
    registerMCP: async () => {},
    execute: async () => {},
    toAPIFormat: () => [],
  };
}

function setupAll(overrides?: any, sessionId = 'sess-1') {
  const info = createSandboxInfo(overrides);
  const reg = localRegistry();
  registerSandboxTools(reg as any, info, sessionId);
  return { info, reg };
}

function resolveGlobal(sandboxId: string, answer: string) {
  const gs = globalThis as any;
  const pending = gs.__stratusPendingAnswers as Map<string, { resolve: (a: string) => void }>;
  const entry = pending.get(sandboxId);
  if (entry) { entry.resolve(answer); pending.delete(sandboxId); return true; }
  return false;
}

// ============================================
// resolveAnswer
// ============================================

describe('sandbox-tools: resolveAnswer', () => {
  test('returns false when no pending', () => {
    expect(resolveAnswer('nonexistent', 'x')).toBe(false);
  });

  test('resolves pending and returns true', () => {
    const gs = globalThis as any;
    const pending = gs.__stratusPendingAnswers as Map<string, { resolve: (a: string) => void }>;
    let resolved = '';
    pending.set('sb-1', { resolve: (a: string) => { resolved = a; } });
    expect(resolveAnswer('sb-1', 'yes')).toBe(true);
    expect(resolved).toBe('yes');
    expect(resolveAnswer('sb-1', 'again')).toBe(false);
  });
});

// ============================================
// registerSandboxTools
// ============================================

describe('sandbox-tools: registerSandboxTools', () => {
  test('registers all 18 tools', () => {
    const { reg } = setupAll();
    const tools = reg.list();
    expect(tools.length).toBe(18);
    const names = tools.map(t => t.name);
    for (const n of ['bash', 'read', 'write_to_file', 'edit', 'multi_edit', 'grep', 'glob', 'ls',
      'websearch', 'webfetch', 'git_commit', 'git_push', 'pr_create',
      'todoread', 'todowrite', 'question', 'plan_enter', 'plan_exit']) {
      expect(names).toContain(n);
    }
  });
});

// ============================================
// bash
// ============================================

describe('sandbox-tools: bash', () => {
  test('executes command', async () => {
    const { info, reg } = setupAll();
    (info as any).sandbox.runCommand = async () => ({
      exitCode: 0, stdout: async () => 'file1.ts\nfile2.ts', stderr: async () => '',
    });
    const result = await reg.get('bash')!.execute({ command: 'ls' });
    const p = JSON.parse(result as string);
    expect(p.exitCode).toBe(0);
    expect(p.stdout).toContain('file1.ts');
  });

  test('handles failure', async () => {
    const { info, reg } = setupAll();
    (info as any).sandbox.runCommand = async () => ({
      exitCode: 127, stdout: async () => '', stderr: async () => 'command not found',
    });
    const p = JSON.parse(await reg.get('bash')!.execute({ command: 'x' }) as string);
    expect(p.exitCode).toBe(127);
    expect(p.stderr).toContain('command not found');
  });

  test('uses custom cwd', async () => {
    const { info, reg } = setupAll();
    let captured: string[] = [];
    (info as any).sandbox.runCommand = async (_: string, a: string[]) => {
      captured = a; return { exitCode: 0, stdout: async () => '', stderr: async () => '' };
    };
    await reg.get('bash')!.execute({ command: 'pwd', cwd: '/custom' });
    expect(captured[1]).toContain('/custom');
  });

  test('catches thrown errors', async () => {
    const { info, reg } = setupAll();
    (info as any).sandbox.runCommand = async () => { throw new Error('crashed'); };
    const p = JSON.parse(await reg.get('bash')!.execute({ command: 'x' }) as string);
    expect(p.exitCode).toBe(1);
    expect(p.stderr).toContain('crashed');
  });
});

// ============================================
// read
// ============================================

describe('sandbox-tools: read', () => {
  test('reads without offset/limit', async () => {
    const { info, reg } = setupAll();
    let c = 0;
    (info as any).sandbox.runCommand = async () => {
      c++; if (c === 1) return { exitCode: 0, stdout: async () => '     1\tline', stderr: async () => '' };
      return { exitCode: 0, stdout: async () => '2', stderr: async () => '' };
    };
    const r = await reg.get('read')!.execute({ file_path: '/workspace/t.ts' });
    expect(r).toContain('2 lines');
  });

  test('reads with offset+limit', async () => {
    const { info, reg } = setupAll();
    let c = 0;
    (info as any).sandbox.runCommand = async () => {
      c++; if (c === 1) return { exitCode: 0, stdout: async () => 'data', stderr: async () => '' };
      return { exitCode: 0, stdout: async () => '100', stderr: async () => '' };
    };
    const r = await reg.get('read')!.execute({ file_path: '/workspace/f.ts', offset: 5, limit: 10 });
    expect(r).toContain('lines 5-14');
  });

  test('reads with offset only', async () => {
    const { info, reg } = setupAll();
    let c = 0;
    (info as any).sandbox.runCommand = async (_: string, a: string[]) => {
      c++; if (c === 1) { expect(a[1]).toContain('tail -n +10'); return { exitCode: 0, stdout: async () => 'x', stderr: async () => '' }; }
      return { exitCode: 0, stdout: async () => '50', stderr: async () => '' };
    };
    const r = await reg.get('read')!.execute({ file_path: '/workspace/f.ts', offset: 10 });
    expect(r).toContain('lines 10-');
  });

  test('reads with limit only', async () => {
    const { info, reg } = setupAll();
    let c = 0;
    (info as any).sandbox.runCommand = async (_: string, a: string[]) => {
      c++; if (c === 1) { expect(a[1]).toContain('head -n 5'); return { exitCode: 0, stdout: async () => 'x', stderr: async () => '' }; }
      return { exitCode: 0, stdout: async () => '100', stderr: async () => '' };
    };
    const r = await reg.get('read')!.execute({ file_path: '/workspace/f.ts', limit: 5 });
    expect(r).toContain('lines 1-5');
  });

  test('throws on file not found', async () => {
    const { info, reg } = setupAll();
    (info as any).sandbox.runCommand = async () => ({ exitCode: 1, stdout: async () => '', stderr: async () => 'No such file' });
    expect(reg.get('read')!.execute({ file_path: '/missing' })).rejects.toThrow();
  });
});

// ============================================
// edit
// ============================================

describe('sandbox-tools: edit', () => {
  test('throws on identical strings', async () => {
    const { reg } = setupAll();
    expect(reg.get('edit')!.execute({ file_path: '/f', old_string: 'x', new_string: 'x' })).rejects.toThrow('identical');
  });

  test('throws on not found', async () => {
    const { info, reg } = setupAll();
    (info as any).sandbox.runCommand = async () => ({ exitCode: 0, stdout: async () => 'content', stderr: async () => '' });
    expect(reg.get('edit')!.execute({ file_path: '/f', old_string: 'missing', new_string: 'y' })).rejects.toThrow('not found');
  });

  test('throws on multiple matches', async () => {
    const { info, reg } = setupAll();
    (info as any).sandbox.runCommand = async () => ({ exitCode: 0, stdout: async () => 'aa bb aa cc aa', stderr: async () => '' });
    expect(reg.get('edit')!.execute({ file_path: '/f', old_string: 'aa', new_string: 'zz' })).rejects.toThrow('3 times');
  });

  test('single replacement', async () => {
    const { info, reg } = setupAll();
    let c = 0;
    (info as any).sandbox.runCommand = async () => {
      c++; if (c === 1) return { exitCode: 0, stdout: async () => 'hello world', stderr: async () => '' };
      return { exitCode: 0, stdout: async () => '', stderr: async () => '' };
    };
    const p = JSON.parse(await reg.get('edit')!.execute({ file_path: '/f', old_string: 'hello', new_string: 'bye' }) as string);
    expect(p.success).toBe(true);
    expect(p.replacements).toBe(1);
  });

  test('replace_all', async () => {
    const { info, reg } = setupAll();
    let c = 0;
    (info as any).sandbox.runCommand = async () => {
      c++; if (c === 1) return { exitCode: 0, stdout: async () => 'aa bb aa', stderr: async () => '' };
      return { exitCode: 0, stdout: async () => '', stderr: async () => '' };
    };
    const p = JSON.parse(await reg.get('edit')!.execute({ file_path: '/f', old_string: 'aa', new_string: 'zz', replace_all: true }) as string);
    expect(p.replacements).toBe(2);
  });

  test('throws on read failure', async () => {
    const { info, reg } = setupAll();
    (info as any).sandbox.runCommand = async () => ({ exitCode: 1, stdout: async () => '', stderr: async () => '' });
    expect(reg.get('edit')!.execute({ file_path: '/f', old_string: 'a', new_string: 'b' })).rejects.toThrow('File not found');
  });

  test('throws on write failure', async () => {
    const { info, reg } = setupAll();
    let c = 0;
    (info as any).sandbox.runCommand = async () => {
      c++; if (c === 1) return { exitCode: 0, stdout: async () => 'content', stderr: async () => '' };
      return { exitCode: 1, stdout: async () => '', stderr: async () => 'disk full' };
    };
    expect(reg.get('edit')!.execute({ file_path: '/f', old_string: 'content', new_string: 'new' })).rejects.toThrow('Failed to write');
  });
});

// ============================================
// multi_edit
// ============================================

describe('sandbox-tools: multi_edit', () => {
  test('applies multiple edits', async () => {
    const { info, reg } = setupAll();
    let c = 0;
    (info as any).sandbox.runCommand = async () => {
      c++; if (c === 1) return { exitCode: 0, stdout: async () => 'aaa bbb ccc', stderr: async () => '' };
      return { exitCode: 0, stdout: async () => '', stderr: async () => '' };
    };
    const p = JSON.parse(await reg.get('multi_edit')!.execute({
      file_path: '/f', edits: [{ old_string: 'aaa', new_string: 'xxx' }, { old_string: 'bbb', new_string: 'yyy' }],
    }) as string);
    expect(p.success).toBe(true);
    expect(p.editsApplied).toBe(2);
  });

  test('throws on identical', async () => {
    const { info, reg } = setupAll();
    (info as any).sandbox.runCommand = async () => ({ exitCode: 0, stdout: async () => 'x', stderr: async () => '' });
    expect(reg.get('multi_edit')!.execute({ file_path: '/f', edits: [{ old_string: 'x', new_string: 'x' }] })).rejects.toThrow('identical');
  });

  test('throws on not found', async () => {
    const { info, reg } = setupAll();
    (info as any).sandbox.runCommand = async () => ({ exitCode: 0, stdout: async () => 'content', stderr: async () => '' });
    expect(reg.get('multi_edit')!.execute({ file_path: '/f', edits: [{ old_string: 'missing', new_string: 'y' }] })).rejects.toThrow('not found');
  });

  test('throws on read failure', async () => {
    const { info, reg } = setupAll();
    (info as any).sandbox.runCommand = async () => ({ exitCode: 1, stdout: async () => '', stderr: async () => '' });
    expect(reg.get('multi_edit')!.execute({ file_path: '/f', edits: [{ old_string: 'a', new_string: 'b' }] })).rejects.toThrow('File not found');
  });

  test('throws on write failure', async () => {
    const { info, reg } = setupAll();
    let c = 0;
    (info as any).sandbox.runCommand = async () => {
      c++; if (c === 1) return { exitCode: 0, stdout: async () => 'content', stderr: async () => '' };
      return { exitCode: 1, stdout: async () => '', stderr: async () => 'full' };
    };
    expect(reg.get('multi_edit')!.execute({ file_path: '/f', edits: [{ old_string: 'content', new_string: 'y' }] })).rejects.toThrow('Failed to write');
  });

  test('replace_all in multi_edit', async () => {
    const { info, reg } = setupAll();
    let c = 0;
    (info as any).sandbox.runCommand = async () => {
      c++; if (c === 1) return { exitCode: 0, stdout: async () => 'aa bb aa', stderr: async () => '' };
      return { exitCode: 0, stdout: async () => '', stderr: async () => '' };
    };
    const p = JSON.parse(await reg.get('multi_edit')!.execute({ file_path: '/f', edits: [{ old_string: 'aa', new_string: 'zz', replace_all: true }] }) as string);
    expect(p.success).toBe(true);
  });
});

// ============================================
// grep
// ============================================

describe('sandbox-tools: grep', () => {
  test('file list mode', async () => {
    const { info, reg } = setupAll();
    (info as any).sandbox.runCommand = async () => ({ exitCode: 0, stdout: async () => '/a.ts\n/b.ts', stderr: async () => '' });
    const p = JSON.parse(await reg.get('grep')!.execute({ query: 'import', search_path: '/workspace' }) as string);
    expect(p.matchingFiles).toBe(2);
  });

  test('match_per_line', async () => {
    const { info, reg } = setupAll();
    (info as any).sandbox.runCommand = async () => ({ exitCode: 0, stdout: async () => '/a.ts:5:import foo', stderr: async () => '' });
    const r = await reg.get('grep')!.execute({ query: 'import', search_path: '/workspace', match_per_line: true });
    expect(r).toContain('import');
  });

  test('no matches', async () => {
    const { info, reg } = setupAll();
    (info as any).sandbox.runCommand = async () => ({ exitCode: 0, stdout: async () => '', stderr: async () => '' });
    const p = JSON.parse(await reg.get('grep')!.execute({ query: 'zzz', search_path: '/workspace' }) as string);
    expect(p.matchingFiles).toBe(0);
  });

  test('include/exclude patterns', async () => {
    const { info, reg } = setupAll();
    let cap: string[] = [];
    (info as any).sandbox.runCommand = async (_: string, a: string[]) => { cap = a; return { exitCode: 0, stdout: async () => '', stderr: async () => '' }; };
    await reg.get('grep')!.execute({ query: 'test', search_path: '/workspace', includes: ['*.ts', '!*.test.ts'] });
    expect(cap[1]).toContain("--include='*.ts'");
    expect(cap[1]).toContain("--exclude='*.test.ts'");
  });

  test('case_sensitive + fixed_strings', async () => {
    const { info, reg } = setupAll();
    let cap: string[] = [];
    (info as any).sandbox.runCommand = async (_: string, a: string[]) => { cap = a; return { exitCode: 0, stdout: async () => '', stderr: async () => '' }; };
    await reg.get('grep')!.execute({ query: 'X', search_path: '/', case_sensitive: true, fixed_strings: true });
    expect(cap[1]).toContain('F');
  });

  test('truncates >100 files', async () => {
    const { info, reg } = setupAll();
    const many = Array.from({ length: 120 }, (_, i) => '/f' + i).join('\n');
    (info as any).sandbox.runCommand = async () => ({ exitCode: 0, stdout: async () => many, stderr: async () => '' });
    const p = JSON.parse(await reg.get('grep')!.execute({ query: 'x', search_path: '/' }) as string);
    expect(p.files.length).toBe(100);
    expect(p.truncated).toBe(true);
  });
});

// ============================================
// glob
// ============================================

describe('sandbox-tools: glob', () => {
  test('returns files', async () => {
    const { info, reg } = setupAll();
    (info as any).sandbox.runCommand = async () => ({ exitCode: 0, stdout: async () => '/a.ts\n/b.ts', stderr: async () => '' });
    const p = JSON.parse(await reg.get('glob')!.execute({ pattern: '*.ts', search_directory: '/' }) as string);
    expect(p.total).toBe(2);
  });

  test('type + max_depth', async () => {
    const { info, reg } = setupAll();
    let cap: string[] = [];
    (info as any).sandbox.runCommand = async (_: string, a: string[]) => { cap = a; return { exitCode: 0, stdout: async () => '', stderr: async () => '' }; };
    await reg.get('glob')!.execute({ pattern: '*.ts', search_directory: '/', type: 'file', max_depth: 3 });
    expect(cap[1]).toContain('-type f');
    expect(cap[1]).toContain('-maxdepth 3');
  });

  test('directory type', async () => {
    const { info, reg } = setupAll();
    let cap: string[] = [];
    (info as any).sandbox.runCommand = async (_: string, a: string[]) => { cap = a; return { exitCode: 0, stdout: async () => '', stderr: async () => '' }; };
    await reg.get('glob')!.execute({ pattern: 'src', search_directory: '/', type: 'directory' });
    expect(cap[1]).toContain('-type d');
  });

  test('extracts name from path pattern', async () => {
    const { info, reg } = setupAll();
    let cap: string[] = [];
    (info as any).sandbox.runCommand = async (_: string, a: string[]) => { cap = a; return { exitCode: 0, stdout: async () => '', stderr: async () => '' }; };
    await reg.get('glob')!.execute({ pattern: 'src/**/*.ts', search_directory: '/' });
    expect(cap[1]).toContain("'*.ts'");
  });
});

// ============================================
// ls
// ============================================

describe('sandbox-tools: ls', () => {
  test('lists directory', async () => {
    const { info, reg } = setupAll();
    (info as any).sandbox.runCommand = async () => ({ exitCode: 0, stdout: async () => 'total 8\nsrc', stderr: async () => '' });
    expect(await reg.get('ls')!.execute({ directory: '/' })).toContain('src');
  });

  test('throws on not found', async () => {
    const { info, reg } = setupAll();
    (info as any).sandbox.runCommand = async () => ({ exitCode: 1, stdout: async () => '', stderr: async () => 'No such file' });
    expect(reg.get('ls')!.execute({ directory: '/x' })).rejects.toThrow();
  });
});

// ============================================
// websearch
// ============================================

describe('sandbox-tools: websearch', () => {
  test('returns results', async () => {
    const { reg } = setupAll();
    globalThis.fetch = (async () => ({
      ok: true, text: async () => '<a class="result-link" href="https://e.com">E</a><td class="result-snippet">S</td>',
    })) as any;
    const p = JSON.parse(await reg.get('websearch')!.execute({ query: 'q' }) as string);
    expect(p.success).toBe(true);
    expect(p.results.length).toBe(1);
  });

  test('returns error on failure', async () => {
    const { reg } = setupAll();
    globalThis.fetch = (async () => ({ ok: false, status: 503 })) as any;
    const p = JSON.parse(await reg.get('websearch')!.execute({ query: 'q' }) as string);
    expect(p.error).toBe(true);
  });

  test('respects maxResults', async () => {
    const { reg } = setupAll();
    const html = Array.from({ length: 20 }, (_, i) => `<a class="result-link" href="https://e${i}.com">R${i}</a><td class="result-snippet">S${i}</td>`).join('');
    globalThis.fetch = (async () => ({ ok: true, text: async () => html })) as any;
    const p = JSON.parse(await reg.get('websearch')!.execute({ query: 'q', maxResults: 3 }) as string);
    expect(p.results.length).toBe(3);
  });
});

// ============================================
// webfetch
// ============================================

describe('sandbox-tools: webfetch', () => {
  test('fetches content', async () => {
    const { reg } = setupAll();
    globalThis.fetch = (async () => ({ ok: true, text: async () => '<html>Hello</html>' })) as any;
    const p = JSON.parse(await reg.get('webfetch')!.execute({ url: 'https://e.com' }) as string);
    expect(p.success).toBe(true);
    expect(p.content).toContain('Hello');
  });

  test('truncates long content', async () => {
    const { reg } = setupAll();
    globalThis.fetch = (async () => ({ ok: true, text: async () => 'x'.repeat(200) })) as any;
    const p = JSON.parse(await reg.get('webfetch')!.execute({ url: 'https://e.com', maxLength: 50 }) as string);
    expect(p.truncated).toBe(true);
    expect(p.content.length).toBe(50);
  });

  test('returns error on failure', async () => {
    const { reg } = setupAll();
    globalThis.fetch = (async () => ({ ok: false, status: 404 })) as any;
    const p = JSON.parse(await reg.get('webfetch')!.execute({ url: 'https://e.com/x' }) as string);
    expect(p.error).toBe(true);
  });
});

// ============================================
// write_to_file
// ============================================

describe('sandbox-tools: write_to_file', () => {
  test('writes and returns diff', async () => {
    const { info, reg } = setupAll();
    let c = 0;
    (info as any).sandbox.runCommand = async () => {
      c++; if (c <= 2) return { exitCode: 0, stdout: async () => '', stderr: async () => '' };
      return { exitCode: 0, stdout: async () => '+new\n-old', stderr: async () => '' };
    };
    expect(await reg.get('write_to_file')!.execute({ TargetFile: 'f.ts', CodeContent: 'x' })).toContain('+new');
  });

  test('handles absolute path', async () => {
    const { info, reg } = setupAll();
    let cap: string[][] = [];
    (info as any).sandbox.runCommand = async (_: string, a: string[]) => { cap.push(a); return { exitCode: 0, stdout: async () => '', stderr: async () => '' }; };
    await reg.get('write_to_file')!.execute({ TargetFile: '/abs/f.ts', CodeContent: 'x' });
    expect(cap[0]![1]).toBe('/abs');
  });

  test('returns JSON when no diff', async () => {
    const { info, reg } = setupAll();
    (info as any).sandbox.runCommand = async () => ({ exitCode: 0, stdout: async () => '', stderr: async () => '' });
    const p = JSON.parse(await reg.get('write_to_file')!.execute({ TargetFile: 'f.ts', CodeContent: 'x' }) as string);
    expect(p.success).toBe(true);
  });

  test('returns error on write fail', async () => {
    const { info, reg } = setupAll();
    let c = 0;
    (info as any).sandbox.runCommand = async () => {
      c++; if (c === 1) return { exitCode: 0, stdout: async () => '', stderr: async () => '' };
      return { exitCode: 1, stdout: async () => '', stderr: async () => 'denied' };
    };
    const p = JSON.parse(await reg.get('write_to_file')!.execute({ TargetFile: 'f.ts', CodeContent: 'x' }) as string);
    expect(p.error).toContain('denied');
  });

  test('handles thrown error', async () => {
    const { info, reg } = setupAll();
    let c = 0;
    (info as any).sandbox.runCommand = async () => {
      c++; if (c === 1) return { exitCode: 0, stdout: async () => '', stderr: async () => '' };
      throw new Error('boom');
    };
    const p = JSON.parse(await reg.get('write_to_file')!.execute({ TargetFile: 'f.ts', CodeContent: 'x' }) as string);
    expect(p.error).toContain('boom');
  });

  test('shows new file diff', async () => {
    const { info, reg } = setupAll();
    let c = 0;
    (info as any).sandbox.runCommand = async () => {
      c++; if (c <= 2) return { exitCode: 0, stdout: async () => '', stderr: async () => '' };
      if (c === 3) return { exitCode: 0, stdout: async () => '', stderr: async () => '' };
      return { exitCode: 0, stdout: async () => '+++ new\n+x', stderr: async () => '' };
    };
    expect(await reg.get('write_to_file')!.execute({ TargetFile: 'n.ts', CodeContent: 'x' })).toContain('+++ new');
  });
});

// ============================================
// git_commit
// ============================================

describe('sandbox-tools: git_commit', () => {
  test('requires confirmation', async () => {
    const { reg } = setupAll();
    const p = JSON.parse(await reg.get('git_commit')!.execute({ message: 'x' }) as string);
    expect(p.needsConfirmation).toBe(true);
  });

  test('succeeds when confirmed', async () => {
    const { info, reg } = setupAll();
    (info as any).sandbox.runCommand = async () => ({ exitCode: 0, stdout: async () => 'committed', stderr: async () => '' });
    const p = JSON.parse(await reg.get('git_commit')!.execute({ message: 'x', confirmed: true }) as string);
    expect(p.success).toBe(true);
  });

  test('succeeds in alpha mode', async () => {
    const { info, reg } = setupAll({ alphaMode: true });
    (info as any).sandbox.runCommand = async () => ({ exitCode: 0, stdout: async () => 'ok', stderr: async () => '' });
    const p = JSON.parse(await reg.get('git_commit')!.execute({ message: 'x' }) as string);
    expect(p.success).toBe(true);
  });

  test('returns error on failure', async () => {
    const { info, reg } = setupAll({ alphaMode: true });
    let c = 0;
    (info as any).sandbox.runCommand = async () => { c++; if (c === 1) return { exitCode: 0, stdout: async () => '', stderr: async () => '' }; return { exitCode: 1, stdout: async () => 'nothing', stderr: async () => '' }; };
    const p = JSON.parse(await reg.get('git_commit')!.execute({ message: 'x' }) as string);
    expect(p.error).toContain('nothing');
  });

  test('handles throw', async () => {
    const { info, reg } = setupAll({ alphaMode: true });
    (info as any).sandbox.runCommand = async () => { throw new Error('net'); };
    const p = JSON.parse(await reg.get('git_commit')!.execute({ message: 'x' }) as string);
    expect(p.error).toContain('net');
  });
});

// ============================================
// git_push
// ============================================

describe('sandbox-tools: git_push', () => {
  test('requires confirmation', async () => {
    const { reg } = setupAll();
    const p = JSON.parse(await reg.get('git_push')!.execute({}) as string);
    expect(p.needsConfirmation).toBe(true);
  });

  test('succeeds confirmed', async () => {
    const { info, reg } = setupAll();
    (info as any).sandbox.runCommand = async () => ({ exitCode: 0, stdout: async () => 'ok', stderr: async () => '' });
    const p = JSON.parse(await reg.get('git_push')!.execute({ confirmed: true }) as string);
    expect(p.success).toBe(true);
    expect(p.branch).toBe('stratuscode/test-session');
  });

  test('returns error on failure', async () => {
    const { info, reg } = setupAll({ alphaMode: true });
    (info as any).sandbox.runCommand = async () => ({ exitCode: 1, stdout: async () => '', stderr: async () => 'rejected' });
    const p = JSON.parse(await reg.get('git_push')!.execute({}) as string);
    expect(p.error).toContain('rejected');
  });

  test('handles throw', async () => {
    const { info, reg } = setupAll({ alphaMode: true });
    (info as any).sandbox.runCommand = async () => { throw new Error('timeout'); };
    const p = JSON.parse(await reg.get('git_push')!.execute({}) as string);
    expect(p.error).toContain('timeout');
  });
});

// ============================================
// pr_create
// ============================================

describe('sandbox-tools: pr_create', () => {
  test('requires confirmation', async () => {
    const { reg } = setupAll();
    const p = JSON.parse(await reg.get('pr_create')!.execute({ title: 'x' }) as string);
    expect(p.needsConfirmation).toBe(true);
  });

  test('returns error without token', async () => {
    const orig = { ...process.env };
    delete process.env.GITHUB_TOKEN;
    try {
      const { reg } = setupAll({ alphaMode: true });
      const p = JSON.parse(await reg.get('pr_create')!.execute({ title: 'x', confirmed: true }) as string);
      expect(p.error).toContain('GitHub token');
    } finally { process.env = orig; }
  });

  test('creates PR', async () => {
    const orig = { ...process.env };
    process.env.GITHUB_TOKEN = 'ghp_test';
    mock.module('@octokit/rest', () => ({
      Octokit: class { pulls = { create: async () => ({ data: { html_url: 'https://g.com/pull/42', number: 42, title: 'PR' } }) }; },
    }));
    try {
      const { reg } = setupAll({ alphaMode: true });
      const p = JSON.parse(await reg.get('pr_create')!.execute({ title: 'PR', body: 'desc' }) as string);
      expect(p.success).toBe(true);
      expect(p.number).toBe(42);
    } finally { process.env = orig; }
  });

  test('handles Octokit error', async () => {
    const orig = { ...process.env };
    process.env.GITHUB_TOKEN = 'ghp_test';
    mock.module('@octokit/rest', () => ({
      Octokit: class { pulls = { create: async () => { throw new Error('Validation Failed'); } }; },
    }));
    try {
      const { reg } = setupAll({ alphaMode: true });
      const p = JSON.parse(await reg.get('pr_create')!.execute({ title: 'Bad' }) as string);
      expect(p.error).toContain('Validation Failed');
    } finally { process.env = orig; }
  });
});

// ============================================
// todoread
// ============================================

describe('sandbox-tools: todoread', () => {
  test('empty list', async () => {
    const { reg } = setupAll(undefined, 'sess-empty');
    const p = JSON.parse(await reg.get('todoread')!.execute({}) as string);
    expect(p.todos).toEqual([]);
    expect(p.message).toContain('No todos');
  });

  test('with todos', async () => {
    const { createSession, createTodo, clearAllStorage } = await import('./storage-shim');
    clearAllStorage();
    const s = createSession('/test');
    createTodo(s.id, 'T1', { status: 'pending' });
    createTodo(s.id, 'T2', { status: 'in_progress' });
    const { reg } = setupAll(undefined, s.id);
    const p = JSON.parse(await reg.get('todoread')!.execute({}) as string);
    expect(p.todos).toHaveLength(2);
    expect(p.counts.total).toBe(2);
    clearAllStorage();
  });
});

// ============================================
// todowrite
// ============================================

describe('sandbox-tools: todowrite', () => {
  test('replaces todos', async () => {
    const { createSession, clearAllStorage } = await import('./storage-shim');
    clearAllStorage();
    const s = createSession('/test');
    const { reg } = setupAll(undefined, s.id);
    const p = JSON.parse(await reg.get('todowrite')!.execute({
      todos: [{ content: 'A', status: 'pending' }, { content: 'B', status: 'in_progress' }, { content: 'C', status: 'completed' }],
    }) as string);
    expect(p.success).toBe(true);
    expect(p.counts.total).toBe(3);
    clearAllStorage();
  });

  test('rejects multiple in_progress', async () => {
    const { createSession, clearAllStorage } = await import('./storage-shim');
    clearAllStorage();
    const s = createSession('/test');
    const { reg } = setupAll(undefined, s.id);
    const p = JSON.parse(await reg.get('todowrite')!.execute({
      todos: [{ content: 'A', status: 'in_progress' }, { content: 'B', status: 'in_progress' }],
    }) as string);
    expect(p.error).toContain('Only one');
    clearAllStorage();
  });
});

// ============================================
// plan_enter
// ============================================

describe('sandbox-tools: plan_enter', () => {
  test('returns plan mode info', async () => {
    const { reg } = setupAll();
    const p = JSON.parse(await reg.get('plan_enter')!.execute({ reason: 'complex' }) as string);
    expect(p.mode).toBe('plan');
    expect(p.entered).toBe(true);
    expect(p.instructions).toHaveLength(4);
  });

  test('works without reason', async () => {
    const { reg } = setupAll();
    const p = JSON.parse(await reg.get('plan_enter')!.execute({}) as string);
    expect(p.entered).toBe(true);
  });
});

// ============================================
// plan_exit
// ============================================

describe('sandbox-tools: plan_exit', () => {
  test('error when no todos', async () => {
    const { createSession, clearAllStorage } = await import('./storage-shim');
    clearAllStorage();
    const s = createSession('/test');
    const { reg } = setupAll(undefined, s.id);
    const p = JSON.parse(await reg.get('plan_exit')!.execute({ summary: 'x' }) as string);
    expect(p.approved).toBe(false);
    expect(p.error).toContain('No plan');
    clearAllStorage();
  });

  test('approved', async () => {
    const { createSession, createTodo, clearAllStorage } = await import('./storage-shim');
    clearAllStorage();
    const s = createSession('/test');
    createTodo(s.id, 'task');
    const { reg } = setupAll(undefined, s.id);
    setTimeout(() => resolveGlobal('sb-test', 'approve'), 50);
    const p = JSON.parse(await reg.get('plan_exit')!.execute({ summary: 'plan' }) as string);
    expect(p.approved).toBe(true);
    expect(p.modeSwitch).toBe('build');
    clearAllStorage();
  });

  test('rejected', async () => {
    const { createSession, createTodo, clearAllStorage } = await import('./storage-shim');
    clearAllStorage();
    const s = createSession('/test');
    createTodo(s.id, 'task');
    const { reg } = setupAll(undefined, s.id);
    setTimeout(() => resolveGlobal('sb-test', 'reject this'), 50);
    const p = JSON.parse(await reg.get('plan_exit')!.execute({ summary: 'x' }) as string);
    expect(p.approved).toBe(false);
    expect(p.answer).toBe('reject this');
    clearAllStorage();
  });
});

// ============================================
// question
// ============================================

describe('sandbox-tools: question', () => {
  test('blocks until answered', async () => {
    const { reg } = setupAll();
    setTimeout(() => resolveGlobal('sb-test', 'React'), 50);
    const p = JSON.parse(await reg.get('question')!.execute({ question: 'Which?', options: ['React', 'Vue'] }) as string);
    expect(p.answer).toBe('React');
    expect(p.options).toEqual(['React', 'Vue']);
  });

  test('works without options', async () => {
    const { reg } = setupAll();
    setTimeout(() => resolveGlobal('sb-test', 'custom'), 50);
    const p = JSON.parse(await reg.get('question')!.execute({ question: 'What?' }) as string);
    expect(p.answer).toBe('custom');
  });
});
