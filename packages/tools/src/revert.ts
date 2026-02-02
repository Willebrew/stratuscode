/**
 * Revert Tool
 *
 * Restore files to a previous snapshot state.
 */

import { defineTool } from './sage-adapter';
import { Snapshot } from './lib/snapshot';

export interface RevertArgs extends Record<string, unknown> {
  hash?: string;
  files?: string[];
}

export const revertTool = defineTool<RevertArgs>({
  name: 'revert',
  description: `Revert files to a previous snapshot state.

Use this tool to:
- Undo recent file changes
- Restore files to a known good state
- Recover from mistakes

If no hash is provided, reverts to the most recent snapshot.
If files are specified, only those files are reverted.`,
  parameters: {
    type: 'object',
    properties: {
      hash: {
        type: 'string',
        description: 'The snapshot hash to revert to. If not provided, uses the most recent snapshot.',
      },
      files: {
        type: 'array',
        items: { type: 'string' },
        description: 'Specific files to revert. If not provided, reverts all changed files.',
      },
    },
  },

  async execute(args, context) {
    const { hash, files } = args;
    
    // Check if snapshots are available
    if (!(await Snapshot.isAvailable(context.projectDir))) {
      return JSON.stringify({
        error: true,
        message: 'Snapshots not available. The project must be a git repository.',
      });
    }
    
    // Get current state hash for comparison
    const currentHash = await Snapshot.getWorkingTreeHash(context.projectDir);
    
    // If no hash provided, get the most recent snapshot
    let targetHash: string | undefined = hash;
    if (!targetHash) {
      // Use HEAD as fallback
      const currentHead = await Snapshot.getCurrentHash(context.projectDir);
      if (!currentHead) {
        return JSON.stringify({
          error: true,
          message: 'No snapshots found and no hash provided.',
        });
      }
      targetHash = currentHead;
    }
    
    // Get the diff before reverting
    const diffBefore = await Snapshot.diff(context.projectDir, targetHash);
    
    let result;
    if (files && files.length > 0) {
      // Revert specific files
      result = await Snapshot.revertFiles(context.projectDir, targetHash, files);
    } else {
      // Revert all changes
      result = await Snapshot.restore(context.projectDir, targetHash);
    }
    
    if (!result.success) {
      return JSON.stringify({
        error: true,
        message: result.error,
      });
    }
    
    // Get summary of what was reverted
    const summary = diffBefore ? Snapshot.summarize(diffBefore.files) : 'Changes reverted';
    
    return JSON.stringify({
      success: true,
      hash: targetHash,
      filesReverted: files || diffBefore?.files.map(f => f.path) || [],
      summary,
    });
  },
});
