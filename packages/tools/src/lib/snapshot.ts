/**
 * Snapshot Module
 *
 * Git-based file versioning for safe agent operations.
 * Enables tracking, reverting, and diffing file changes.
 */

import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';

// ============================================
// Types
// ============================================

export interface SnapshotFileDiff {
  path: string;
  additions: number;
  deletions: number;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
}

export interface SnapshotInfo {
  hash: string;
  timestamp: number;
  message?: string;
  files: SnapshotFileDiff[];
}

export interface SnapshotResult {
  success: boolean;
  hash?: string;
  error?: string;
}

// ============================================
// Git Helpers
// ============================================

async function execGit(args: string[], cwd: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const proc = spawn('git', args, { cwd });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode: code ?? 0 });
    });

    proc.on('error', (err) => {
      resolve({ stdout: '', stderr: err.message, exitCode: 1 });
    });
  });
}

async function isGitRepo(projectDir: string): Promise<boolean> {
  const result = await execGit(['rev-parse', '--is-inside-work-tree'], projectDir);
  return result.exitCode === 0 && result.stdout === 'true';
}


// ============================================
// Snapshot Functions
// ============================================

export namespace Snapshot {
  const SNAPSHOT_BRANCH_PREFIX = 'stratuscode-snapshot-';

  /**
   * Check if snapshots are available (git repo exists)
   */
  export async function isAvailable(projectDir: string): Promise<boolean> {
    return isGitRepo(projectDir);
  }

  /**
   * Create a snapshot of current state
   * Returns the git tree hash that can be used to restore
   */
  export async function track(projectDir: string, message?: string): Promise<SnapshotResult> {
    if (!(await isGitRepo(projectDir))) {
      return { success: false, error: 'Not a git repository' };
    }

    try {
      // Add all changes (including untracked files)
      await execGit(['add', '-A'], projectDir);

      // Write tree object (doesn't create a commit)
      const treeResult = await execGit(['write-tree'], projectDir);
      if (treeResult.exitCode !== 0) {
        return { success: false, error: `Failed to write tree: ${treeResult.stderr}` };
      }

      const treeHash = treeResult.stdout;

      // Store snapshot metadata
      const snapshotRef = `refs/stratuscode/snapshots/${Date.now()}`;
      await execGit(['update-ref', snapshotRef, treeHash], projectDir);

      return { success: true, hash: treeHash };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Get the diff between current state and a snapshot
   */
  export async function diff(projectDir: string, snapshotHash: string): Promise<{ files: SnapshotFileDiff[]; patch: string } | null> {
    if (!(await isGitRepo(projectDir))) {
      return null;
    }

    try {
      // Get diff stat
      const statResult = await execGit(
        ['diff', '--stat', '--numstat', snapshotHash, 'HEAD'],
        projectDir
      );

      // Get unified diff
      const patchResult = await execGit(
        ['diff', snapshotHash, 'HEAD'],
        projectDir
      );

      const files: SnapshotFileDiff[] = [];
      const lines = statResult.stdout.split('\n').filter(Boolean);

      for (const line of lines) {
        const match = line.match(/^(\d+|-)\s+(\d+|-)\s+(.+)$/);
        if (match && match[1] && match[2] && match[3]) {
          const additions = match[1] === '-' ? 0 : parseInt(match[1], 10);
          const deletions = match[2] === '-' ? 0 : parseInt(match[2], 10);
          const filePath = match[3];

          let status: SnapshotFileDiff['status'] = 'modified';
          if (additions > 0 && deletions === 0) status = 'added';
          else if (additions === 0 && deletions > 0) status = 'deleted';

          files.push({ path: filePath, additions, deletions, status });
        }
      }

      return { files, patch: patchResult.stdout };
    } catch (error) {
      return null;
    }
  }

  /**
   * Get list of changed files since snapshot
   */
  export async function getChangedFiles(projectDir: string, snapshotHash: string): Promise<SnapshotFileDiff[]> {
    const result = await diff(projectDir, snapshotHash);
    return result?.files ?? [];
  }

  /**
   * Restore working directory to a snapshot state
   */
  export async function restore(projectDir: string, snapshotHash: string): Promise<SnapshotResult> {
    if (!(await isGitRepo(projectDir))) {
      return { success: false, error: 'Not a git repository' };
    }

    try {
      // Read tree into index
      const readResult = await execGit(['read-tree', snapshotHash], projectDir);
      if (readResult.exitCode !== 0) {
        return { success: false, error: `Failed to read tree: ${readResult.stderr}` };
      }

      // Checkout index to working directory
      const checkoutResult = await execGit(['checkout-index', '-a', '-f'], projectDir);
      if (checkoutResult.exitCode !== 0) {
        return { success: false, error: `Failed to checkout: ${checkoutResult.stderr}` };
      }

      return { success: true, hash: snapshotHash };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Revert specific files to their state in a snapshot
   */
  export async function revertFiles(
    projectDir: string,
    snapshotHash: string,
    files: string[]
  ): Promise<SnapshotResult> {
    if (!(await isGitRepo(projectDir))) {
      return { success: false, error: 'Not a git repository' };
    }

    try {
      for (const file of files) {
        const result = await execGit(
          ['checkout', snapshotHash, '--', file],
          projectDir
        );
        if (result.exitCode !== 0) {
          return { success: false, error: `Failed to revert ${file}: ${result.stderr}` };
        }
      }

      return { success: true, hash: snapshotHash };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Get current HEAD hash
   */
  export async function getCurrentHash(projectDir: string): Promise<string | null> {
    const result = await execGit(['rev-parse', 'HEAD'], projectDir);
    return result.exitCode === 0 ? result.stdout : null;
  }

  /**
   * Get current working tree hash (uncommitted changes)
   */
  export async function getWorkingTreeHash(projectDir: string): Promise<string | null> {
    // Add all and write tree
    await execGit(['add', '-A'], projectDir);
    const result = await execGit(['write-tree'], projectDir);
    return result.exitCode === 0 ? result.stdout : null;
  }

  /**
   * Clean up old snapshots (retention: 7 days)
   */
  export async function cleanup(projectDir: string, retentionMs: number = 7 * 24 * 60 * 60 * 1000): Promise<void> {
    if (!(await isGitRepo(projectDir))) {
      return;
    }

    const cutoff = Date.now() - retentionMs;

    try {
      // List all snapshot refs
      const result = await execGit(['for-each-ref', '--format=%(refname)', 'refs/stratuscode/snapshots/'], projectDir);
      if (result.exitCode !== 0) return;

      const refs = result.stdout.split('\n').filter(Boolean);

      for (const ref of refs) {
        // Extract timestamp from ref name
        const timestamp = parseInt(ref.split('/').pop() ?? '0', 10);
        if (timestamp < cutoff) {
          await execGit(['update-ref', '-d', ref], projectDir);
        }
      }
    } catch {
      // Ignore cleanup errors
    }
  }

  /**
   * Create a summary of changes for display
   */
  export function summarize(files: SnapshotFileDiff[]): string {
    const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0);
    const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0);

    const lines = [
      `${files.length} file(s) changed`,
      `+${totalAdditions} additions, -${totalDeletions} deletions`,
      '',
      ...files.map(f => {
        const status = f.status === 'added' ? '[+]' : f.status === 'deleted' ? '[-]' : '[M]';
        return `${status} ${f.path} (+${f.additions}/-${f.deletions})`;
      }),
    ];

    return lines.join('\n');
  }
}

export default Snapshot;
