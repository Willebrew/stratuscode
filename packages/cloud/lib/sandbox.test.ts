import { describe, expect, test, beforeEach, mock } from 'bun:test';

import {
  registerSandboxAlias,
  getSandbox,
  destroySandbox,
  extendSandboxTimeout,
  startSandboxKeepalive,
  runSandboxCommand,
  readSandboxFile,
  writeSandboxFiles,
  getSandboxDiff,
  getSandboxDetailedDiff,
  hasUncommittedChanges,
  listActiveSandboxes,
  type SandboxInfo,
} from './sandbox';

// Clean the globalThis sandbox map between tests
beforeEach(() => {
  const gs = globalThis as any;
  gs.__stratusActiveSandboxes?.clear();
});

function makeMockSandbox(overrides: Record<string, any> = {}) {
  return {
    sandboxId: 'sb-mock',
    stop: mock(() => Promise.resolve()),
    extendTimeout: mock(() => Promise.resolve()),
    runCommand: mock((_cmd: string, _args?: string[]) =>
      Promise.resolve({
        stdout: () => Promise.resolve(''),
        stderr: () => Promise.resolve(''),
        exitCode: 0,
      })
    ),
    readFile: mock(() => Promise.resolve(null)),
    writeFiles: mock(() => Promise.resolve()),
    ...overrides,
  } as any;
}

function makeSandboxInfo(overrides: Partial<SandboxInfo> = {}): SandboxInfo {
  return {
    sandboxId: 'sb-1',
    sandbox: makeMockSandbox(),
    owner: 'testowner',
    repo: 'testrepo',
    branch: 'main',
    sessionBranch: 'stratuscode/test-session',
    workDir: '/vercel/sandbox',
    ...overrides,
  };
}

// ============================================
// registerSandboxAlias & getSandbox
// ============================================

describe('sandbox: registerSandboxAlias & getSandbox', () => {
  test('getSandbox returns null for unknown session', async () => {
    const result = await getSandbox('nonexistent');
    expect(result).toBeNull();
  });

  test('registerSandboxAlias makes sandbox retrievable via alias', async () => {
    const info = makeSandboxInfo();
    registerSandboxAlias('alias-1', info);
    const result = await getSandbox('alias-1');
    expect(result).toBeDefined();
    expect(result!.sandboxId).toBe('sb-1');
  });

  test('listActiveSandboxes returns registered session IDs', () => {
    const info = makeSandboxInfo();
    registerSandboxAlias('s1', info);
    registerSandboxAlias('s2', info);
    const ids = listActiveSandboxes();
    expect(ids).toContain('s1');
    expect(ids).toContain('s2');
  });
});

// ============================================
// destroySandbox
// ============================================

describe('sandbox: destroySandbox', () => {
  test('calls sandbox.stop and removes from map', async () => {
    const mockSandbox = makeMockSandbox();
    const info = makeSandboxInfo({ sandbox: mockSandbox });
    registerSandboxAlias('sess-destroy', info);

    await destroySandbox('sess-destroy');

    expect(mockSandbox.stop).toHaveBeenCalled();
    const result = await getSandbox('sess-destroy');
    expect(result).toBeNull();
  });

  test('is safe to call for nonexistent session', async () => {
    await expect(destroySandbox('nonexistent')).resolves.toBeUndefined();
  });

  test('handles stop() failure gracefully', async () => {
    const mockSandbox = makeMockSandbox({
      stop: mock(() => Promise.reject(new Error('already stopped'))),
    });
    const info = makeSandboxInfo({ sandbox: mockSandbox });
    registerSandboxAlias('sess-fail', info);

    // Should not throw
    await destroySandbox('sess-fail');
    const result = await getSandbox('sess-fail');
    expect(result).toBeNull();
  });
});

// ============================================
// extendSandboxTimeout
// ============================================

describe('sandbox: extendSandboxTimeout', () => {
  test('calls sandbox.extendTimeout with duration', async () => {
    const mockSandbox = makeMockSandbox();
    const info = makeSandboxInfo({ sandbox: mockSandbox });
    registerSandboxAlias('sess-extend', info);

    await extendSandboxTimeout('sess-extend', 120_000);
    expect(mockSandbox.extendTimeout).toHaveBeenCalledWith(120_000);
  });

  test('does nothing for unknown session', async () => {
    await expect(extendSandboxTimeout('nonexistent')).resolves.toBeUndefined();
  });

  test('handles extendTimeout failure gracefully', async () => {
    const mockSandbox = makeMockSandbox({
      extendTimeout: mock(() => Promise.reject(new Error('timeout error'))),
    });
    const info = makeSandboxInfo({ sandbox: mockSandbox });
    registerSandboxAlias('sess-ext-fail', info);

    // Should not throw
    await extendSandboxTimeout('sess-ext-fail');
  });
});

// ============================================
// startSandboxKeepalive
// ============================================

describe('sandbox: startSandboxKeepalive', () => {
  test('returns a cleanup function', () => {
    const info = makeSandboxInfo();
    registerSandboxAlias('sess-ka', info);
    const cleanup = startSandboxKeepalive('sess-ka');
    expect(typeof cleanup).toBe('function');
    // Clean up the interval
    cleanup();
  });
});

// ============================================
// runSandboxCommand
// ============================================

describe('sandbox: runSandboxCommand', () => {
  test('throws for unknown session', async () => {
    expect(runSandboxCommand('nonexistent', 'echo', ['hello'])).rejects.toThrow(
      'No sandbox found for session nonexistent'
    );
  });

  test('runs command in sandbox workDir by default', async () => {
    const mockSandbox = makeMockSandbox({
      runCommand: mock(() =>
        Promise.resolve({
          stdout: () => Promise.resolve('file1.ts\n'),
          stderr: () => Promise.resolve(''),
          exitCode: 0,
        })
      ),
    });
    const info = makeSandboxInfo({ sandbox: mockSandbox });
    registerSandboxAlias('sess-cmd', info);

    const result = await runSandboxCommand('sess-cmd', 'ls', ['-la']);
    expect(result.stdout).toBe('file1.ts\n');
    expect(result.exitCode).toBe(0);
    expect(mockSandbox.runCommand).toHaveBeenCalled();
  });

  test('uses custom cwd when provided', async () => {
    const mockSandbox = makeMockSandbox();
    const info = makeSandboxInfo({ sandbox: mockSandbox });
    registerSandboxAlias('sess-cwd', info);

    await runSandboxCommand('sess-cwd', 'pwd', [], { cwd: '/custom/dir' });
    const callArgs = mockSandbox.runCommand.mock.calls[0];
    expect(callArgs![1]![1]).toContain('/custom/dir');
  });
});

// ============================================
// readSandboxFile
// ============================================

describe('sandbox: readSandboxFile', () => {
  test('throws for unknown session', async () => {
    expect(readSandboxFile('nonexistent', '/file.txt')).rejects.toThrow(
      'No sandbox found for session nonexistent'
    );
  });

  test('throws when file not found', async () => {
    const mockSandbox = makeMockSandbox({
      readFile: mock(() => Promise.resolve(null)),
    });
    const info = makeSandboxInfo({ sandbox: mockSandbox });
    registerSandboxAlias('sess-read', info);

    expect(readSandboxFile('sess-read', '/missing.txt')).rejects.toThrow('File not found');
  });

  test('reads file with Web Streams API reader', async () => {
    const content = Buffer.from('hello world');
    let readCalled = false;
    const mockStream = {
      getReader: () => ({
        read: () => {
          if (!readCalled) {
            readCalled = true;
            return Promise.resolve({ done: false, value: content });
          }
          return Promise.resolve({ done: true, value: undefined });
        },
      }),
    };
    const mockSandbox = makeMockSandbox({
      readFile: mock(() => Promise.resolve(mockStream)),
    });
    const info = makeSandboxInfo({ sandbox: mockSandbox });
    registerSandboxAlias('sess-read-ok', info);

    const result = await readSandboxFile('sess-read-ok', '/test.txt');
    expect(result).toBe('hello world');
  });

  test('prepends workDir for relative paths', async () => {
    const mockSandbox = makeMockSandbox({
      readFile: mock(() => Promise.resolve(null)),
    });
    const info = makeSandboxInfo({ sandbox: mockSandbox, workDir: '/work' });
    registerSandboxAlias('sess-rel', info);

    try {
      await readSandboxFile('sess-rel', 'relative.txt');
    } catch {
      // Expected to throw "File not found"
    }
    expect(mockSandbox.readFile).toHaveBeenCalledWith({ path: '/work/relative.txt' });
  });
});

// ============================================
// writeSandboxFiles
// ============================================

describe('sandbox: writeSandboxFiles', () => {
  test('throws for unknown session', async () => {
    expect(writeSandboxFiles('nonexistent', {})).rejects.toThrow(
      'No sandbox found for session nonexistent'
    );
  });

  test('writes files to sandbox with absolute paths', async () => {
    const mockSandbox = makeMockSandbox();
    const info = makeSandboxInfo({ sandbox: mockSandbox, workDir: '/work' });
    registerSandboxAlias('sess-write', info);

    await writeSandboxFiles('sess-write', {
      '/abs/path.txt': 'content1',
      'relative.txt': 'content2',
    });

    expect(mockSandbox.writeFiles).toHaveBeenCalled();
    const files = mockSandbox.writeFiles.mock.calls[0]![0];
    expect(files).toHaveLength(2);
    expect(files[0].path).toBe('/abs/path.txt');
    expect(files[1].path).toBe('/work/relative.txt');
  });
});

// ============================================
// getSandboxDiff / getSandboxDetailedDiff / hasUncommittedChanges
// ============================================

describe('sandbox: git helpers', () => {
  test('getSandboxDiff returns diff --stat output', async () => {
    const mockSandbox = makeMockSandbox({
      runCommand: mock(() =>
        Promise.resolve({
          stdout: () => Promise.resolve(' 2 files changed, 10 insertions(+)'),
          stderr: () => Promise.resolve(''),
          exitCode: 0,
        })
      ),
    });
    const info = makeSandboxInfo({ sandbox: mockSandbox });
    registerSandboxAlias('sess-diff', info);

    const diff = await getSandboxDiff('sess-diff');
    expect(diff).toContain('files changed');
  });

  test('getSandboxDetailedDiff returns full diff', async () => {
    const mockSandbox = makeMockSandbox({
      runCommand: mock(() =>
        Promise.resolve({
          stdout: () => Promise.resolve('diff --git a/foo.ts b/foo.ts\n+added line'),
          stderr: () => Promise.resolve(''),
          exitCode: 0,
        })
      ),
    });
    const info = makeSandboxInfo({ sandbox: mockSandbox });
    registerSandboxAlias('sess-ddiff', info);

    const diff = await getSandboxDetailedDiff('sess-ddiff');
    expect(diff).toContain('diff --git');
  });

  test('hasUncommittedChanges returns true when status is non-empty', async () => {
    const mockSandbox = makeMockSandbox({
      runCommand: mock(() =>
        Promise.resolve({
          stdout: () => Promise.resolve('M src/foo.ts\n'),
          stderr: () => Promise.resolve(''),
          exitCode: 0,
        })
      ),
    });
    const info = makeSandboxInfo({ sandbox: mockSandbox });
    registerSandboxAlias('sess-changes', info);

    expect(await hasUncommittedChanges('sess-changes')).toBe(true);
  });

  test('hasUncommittedChanges returns false when status is empty', async () => {
    const mockSandbox = makeMockSandbox({
      runCommand: mock(() =>
        Promise.resolve({
          stdout: () => Promise.resolve(''),
          stderr: () => Promise.resolve(''),
          exitCode: 0,
        })
      ),
    });
    const info = makeSandboxInfo({ sandbox: mockSandbox });
    registerSandboxAlias('sess-clean', info);

    expect(await hasUncommittedChanges('sess-clean')).toBe(false);
  });
});
