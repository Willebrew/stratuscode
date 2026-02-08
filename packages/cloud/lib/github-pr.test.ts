import { describe, expect, test, beforeEach, mock } from 'bun:test';

// Mock the sandbox module before importing github-pr
mock.module('./sandbox', () => ({
  runSandboxCommand: mock((_sid: string, _cmd: string, _args?: string[]) =>
    Promise.resolve({ stdout: '', stderr: '', exitCode: 0 })
  ),
  getSandboxDiff: mock((_sid: string) => Promise.resolve('')),
  hasUncommittedChanges: mock((_sid: string) => Promise.resolve(false)),
}));

import { getChangesSummary } from './github-pr';
import { hasUncommittedChanges, getSandboxDiff } from './sandbox';

const mockHasChanges = hasUncommittedChanges as ReturnType<typeof mock>;
const mockGetDiff = getSandboxDiff as ReturnType<typeof mock>;

beforeEach(() => {
  mockHasChanges.mockReset();
  mockGetDiff.mockReset();
});

describe('github-pr: getChangesSummary', () => {
  test('returns no changes when hasUncommittedChanges is false', async () => {
    mockHasChanges.mockResolvedValue(false);
    const result = await getChangesSummary('sess-1');
    expect(result.hasChanges).toBe(false);
    expect(result.filesChanged).toBe(0);
    expect(result.insertions).toBe(0);
    expect(result.deletions).toBe(0);
    expect(result.diffSummary).toBe('');
  });

  test('parses diff stat output correctly', async () => {
    mockHasChanges.mockResolvedValue(true);
    mockGetDiff.mockResolvedValue(
      ' src/foo.ts | 10 +++++++---\n src/bar.ts |  5 ++---\n 2 files changed, 10 insertions(+), 6 deletions(-)'
    );

    const result = await getChangesSummary('sess-1');
    expect(result.hasChanges).toBe(true);
    expect(result.filesChanged).toBe(2);
    expect(result.insertions).toBe(10);
    expect(result.deletions).toBe(6);
  });

  test('handles insertions only (no deletions)', async () => {
    mockHasChanges.mockResolvedValue(true);
    mockGetDiff.mockResolvedValue(' 1 file changed, 5 insertions(+)');

    const result = await getChangesSummary('sess-1');
    expect(result.filesChanged).toBe(1);
    expect(result.insertions).toBe(5);
    expect(result.deletions).toBe(0);
  });

  test('handles deletions only (no insertions)', async () => {
    mockHasChanges.mockResolvedValue(true);
    mockGetDiff.mockResolvedValue(' 3 files changed, 20 deletions(-)');

    const result = await getChangesSummary('sess-1');
    expect(result.filesChanged).toBe(3);
    expect(result.insertions).toBe(0);
    expect(result.deletions).toBe(20);
  });

  test('handles sandbox error in hasUncommittedChanges gracefully', async () => {
    mockHasChanges.mockRejectedValue(new Error('410 Gone'));
    const result = await getChangesSummary('sess-1');
    expect(result.hasChanges).toBe(false);
    expect(result.diffSummary).toBe('');
  });

  test('handles sandbox error in getSandboxDiff gracefully', async () => {
    mockHasChanges.mockResolvedValue(true);
    mockGetDiff.mockRejectedValue(new Error('sandbox gone'));

    const result = await getChangesSummary('sess-1');
    expect(result.hasChanges).toBe(true);
    expect(result.diffSummary).toBe('');
    expect(result.filesChanged).toBe(0);
  });
});
