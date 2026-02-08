import { describe, expect, test, beforeEach, mock } from 'bun:test';
mock.module('./sandbox', () => ({
  runSandboxCommand: mock((_sid: string, _cmd: string, _args?: string[]) =>
    Promise.resolve({ stdout: '', stderr: '', exitCode: 0 })),
  getSandboxDiff: mock((_sid: string) => Promise.resolve('')),
  hasUncommittedChanges: mock((_sid: string) => Promise.resolve(false)),
}));
const mockPullsCreate = mock(() => Promise.resolve({
  data: { html_url: 'https://github.com/test/repo/pull/42', number: 42 },
}));
mock.module('@octokit/rest', () => ({
  Octokit: class MockOctokit { pulls = { create: mockPullsCreate }; },
}));
import { getChangesSummary, pushAndCreatePR } from './github-pr';
import { hasUncommittedChanges, getSandboxDiff, runSandboxCommand } from './sandbox';
const mockHasChanges = hasUncommittedChanges as ReturnType<typeof mock>;
const mockGetDiff = getSandboxDiff as ReturnType<typeof mock>;
const mockRunCommand = runSandboxCommand as ReturnType<typeof mock>;
beforeEach(() => {
  mockHasChanges.mockReset(); mockGetDiff.mockReset(); mockRunCommand.mockReset(); mockPullsCreate.mockReset();
  mockRunCommand.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
  mockPullsCreate.mockResolvedValue({ data: { html_url: 'https://github.com/test/repo/pull/42', number: 42 } });
});
describe('github-pr: getChangesSummary', () => {
  test('returns no changes when hasUncommittedChanges is false', async () => {
    mockHasChanges.mockResolvedValue(false);
    const result = await getChangesSummary('sess-1');
    expect(result.hasChanges).toBe(false);
    expect(result.filesChanged).toBe(0);
  });
  test('parses diff stat output correctly', async () => {
    mockHasChanges.mockResolvedValue(true);
    mockGetDiff.mockResolvedValue(' 2 files changed, 10 insertions(+), 6 deletions(-)');
    const result = await getChangesSummary('sess-1');
    expect(result.filesChanged).toBe(2);
    expect(result.insertions).toBe(10);
    expect(result.deletions).toBe(6);
  });
  test('handles insertions only', async () => {
    mockHasChanges.mockResolvedValue(true);
    mockGetDiff.mockResolvedValue(' 1 file changed, 5 insertions(+)');
    const result = await getChangesSummary('sess-1');
    expect(result.insertions).toBe(5);
    expect(result.deletions).toBe(0);
  });
  test('handles deletions only', async () => {
    mockHasChanges.mockResolvedValue(true);
    mockGetDiff.mockResolvedValue(' 3 files changed, 20 deletions(-)');
    const result = await getChangesSummary('sess-1');
    expect(result.deletions).toBe(20);
    expect(result.insertions).toBe(0);
  });
  test('handles sandbox error in hasUncommittedChanges', async () => {
    mockHasChanges.mockRejectedValue(new Error('410 Gone'));
    const result = await getChangesSummary('sess-1');
    expect(result.hasChanges).toBe(false);
  });
  test('handles sandbox error in getSandboxDiff', async () => {
    mockHasChanges.mockResolvedValue(true);
    mockGetDiff.mockRejectedValue(new Error('sandbox gone'));
    const result = await getChangesSummary('sess-1');
    expect(result.hasChanges).toBe(true);
    expect(result.diffSummary).toBe('');
    expect(result.filesChanged).toBe(0);
  });
});
describe('github-pr: pushAndCreatePR', () => {
  const opts = { sessionId: 'sess-1', owner: 'test', repo: 'repo', baseBranch: 'main', sessionBranch: 'stratuscode/test', githubToken: 'ghp_test', title: 'Fix bug' };
  test('creates PR successfully', async () => {
    mockHasChanges.mockResolvedValue(true);
    mockGetDiff.mockResolvedValue('1 file changed');
    const result = await pushAndCreatePR(opts);
    expect(result.prUrl).toBe('https://github.com/test/repo/pull/42');
    expect(result.prNumber).toBe(42);
  });
  test('throws when no changes', async () => {
    mockHasChanges.mockResolvedValue(false);
    await expect(pushAndCreatePR(opts)).rejects.toThrow('No changes to commit');
  });
  test('uses default PR body', async () => {
    mockHasChanges.mockResolvedValue(true);
    mockGetDiff.mockResolvedValue('diff output');
    await pushAndCreatePR(opts);
    const callArgs = mockPullsCreate.mock.calls[0]![0] as any;
    expect(callArgs.body).toContain('Changes made by StratusCode');
  });
  test('uses custom body', async () => {
    mockHasChanges.mockResolvedValue(true);
    mockGetDiff.mockResolvedValue('diff');
    await pushAndCreatePR({ ...opts, body: 'Custom body' });
    const callArgs = mockPullsCreate.mock.calls[0]![0] as any;
    expect(callArgs.body).toBe('Custom body');
  });
  test('executes git commands in order', async () => {
    mockHasChanges.mockResolvedValue(true);
    mockGetDiff.mockResolvedValue('diff');
    const log: string[] = [];
    mockRunCommand.mockImplementation((_s: string, cmd: string, args?: string[]) => {
      log.push(`${cmd} ${(args || []).join(' ')}`.trim());
      return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
    });
    await pushAndCreatePR(opts);
    expect(log[0]).toBe('git add -A');
    expect(log[1]).toContain('git commit');
    expect(log[2]).toContain('git remote');
    expect(log[3]).toContain('git push');
  });
  test('commit message includes title', async () => {
    mockHasChanges.mockResolvedValue(true);
    mockGetDiff.mockResolvedValue('diff');
    let commitArgs: string[] = [];
    mockRunCommand.mockImplementation((_s: string, _cmd: string, args?: string[]) => {
      if (args && args.includes('-m')) commitArgs = args;
      return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
    });
    await pushAndCreatePR({ ...opts, title: 'Add feature' });
    expect(commitArgs).toContain('stratuscode: Add feature');
  });
});
