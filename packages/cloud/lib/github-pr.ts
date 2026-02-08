/**
 * GitHub PR Creation
 *
 * Handles pushing changes from sandbox and creating pull requests.
 */

import { Octokit } from '@octokit/rest';
import { runSandboxCommand, getSandboxDiff, hasUncommittedChanges } from './sandbox';

export interface CreatePROptions {
  sessionId: string;
  owner: string;
  repo: string;
  baseBranch: string;
  sessionBranch: string;
  githubToken: string;
  title: string;
  body?: string;
}

export interface PRResult {
  prUrl: string;
  prNumber: number;
  diffSummary: string;
}

/**
 * Commit all changes, push to GitHub, and create a PR
 */
export async function pushAndCreatePR(options: CreatePROptions): Promise<PRResult> {
  const {
    sessionId,
    owner,
    repo,
    baseBranch,
    sessionBranch,
    githubToken,
    title,
    body,
  } = options;

  // Check if there are changes to commit
  const hasChanges = await hasUncommittedChanges(sessionId);
  if (!hasChanges) {
    throw new Error('No changes to commit');
  }

  // Get diff summary before committing
  const diffSummary = await getSandboxDiff(sessionId);

  // Stage all changes
  await runSandboxCommand(sessionId, 'git', ['add', '-A']);

  // Commit changes
  const commitMessage = `stratuscode: ${title}`;
  await runSandboxCommand(sessionId, 'git', ['commit', '-m', commitMessage]);

  // Set up remote with token for push
  const remoteUrl = `https://x-access-token:${githubToken}@github.com/${owner}/${repo}.git`;
  await runSandboxCommand(sessionId, 'git', ['remote', 'set-url', 'origin', remoteUrl]);

  // Push the branch
  await runSandboxCommand(sessionId, 'git', ['push', '-u', 'origin', sessionBranch]);

  // Create the PR using Octokit
  const octokit = new Octokit({ auth: githubToken });

  const prBody = body || `## Changes made by StratusCode

${diffSummary}

---
*This PR was automatically created by [StratusCode](https://stratuscode.dev)*`;

  const { data: pr } = await octokit.pulls.create({
    owner,
    repo,
    title,
    body: prBody,
    head: sessionBranch,
    base: baseBranch,
  });

  return {
    prUrl: pr.html_url,
    prNumber: pr.number,
    diffSummary,
  };
}

/**
 * Get a summary of changes without creating a PR
 */
export async function getChangesSummary(sessionId: string): Promise<{
  hasChanges: boolean;
  diffSummary: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
}> {
  let hasChanges: boolean;
  try {
    hasChanges = await hasUncommittedChanges(sessionId);
  } catch (error) {
    // Sandbox may have stopped (410 Gone) — treat as unknown state
    console.warn(`[pr] Could not check changes for ${sessionId}:`, error instanceof Error ? error.message : error);
    return {
      hasChanges: false,
      diffSummary: '',
      filesChanged: 0,
      insertions: 0,
      deletions: 0,
    };
  }

  if (!hasChanges) {
    return {
      hasChanges: false,
      diffSummary: '',
      filesChanged: 0,
      insertions: 0,
      deletions: 0,
    };
  }

  let diffSummary: string;
  try {
    diffSummary = await getSandboxDiff(sessionId);
  } catch {
    return { hasChanges: true, diffSummary: '', filesChanged: 0, insertions: 0, deletions: 0 };
  }

  // Parse the diff stat output
  const lines = diffSummary.trim().split('\n');
  const summaryLine = lines[lines.length - 1] || '';

  let filesChanged = 0;
  let insertions = 0;
  let deletions = 0;

  const filesMatch = summaryLine.match(/(\d+) files? changed/);
  const insertionsMatch = summaryLine.match(/(\d+) insertions?\(\+\)/);
  const deletionsMatch = summaryLine.match(/(\d+) deletions?\(-\)/);

  if (filesMatch) filesChanged = parseInt(filesMatch[1]!, 10);
  if (insertionsMatch) insertions = parseInt(insertionsMatch[1]!, 10);
  if (deletionsMatch) deletions = parseInt(deletionsMatch[1]!, 10);

  return {
    hasChanges: true,
    diffSummary,
    filesChanged,
    insertions,
    deletions,
  };
}
